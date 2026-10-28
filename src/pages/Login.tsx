/**
 * Sign-in screen (route /login, public) including the "forgot password" request.
 * Auth goes straight to Supabase (signInWithPassword, resetPasswordForEmail via lib/supabase.ts); no call
 * to our Express API here. After sign-in AuthProvider loads the profile (GET /me). Also exports AuthShell,
 * the brand frame reused by ResetPassword.
 * AUTH_BYPASS (lib/config.ts): this screen is skipped; visiting /login redirects to /.
 * Composes Input, Button, Card from ui.tsx. SRS: FR-01 (login, stay signed in), FR-02.
 */

import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Card, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { AUTH_BYPASS, SIMPLE_AUTH } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { t } from '@/strings';

// Shorthand for the login strings.
const s = t.login;

/**
 * Branded frame (dark green page, logo, app name, white card with a heading) shared by the sign-in,
 * forgot-password and reset-password screens.
 * @param props.title — card heading (the page's <h1>). @param props.children — the card's content.
 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-forest-900 px-4 py-8">
      <img src="/logo.png" alt="" className="h-20 w-20 rounded-xl bg-cream-50 object-contain p-1" />
      <p className="mt-3 font-serif text-3xl font-semibold text-white">{t.common.appName}</p>
      <p className="mt-1 text-center text-sm text-gold-300">{s.subtitle}</p>
      <Card className="mt-6 w-full max-w-sm bg-cream-50 p-5">
        <h1 className="mb-4 font-serif text-2xl font-semibold text-forest-900">{title}</h1>
        {children}
      </Card>
    </div>
  );
}

/**
 * Sign-in screen (route /login, public) with a "Forgot password?" mode that sends a reset email.
 * AUTH_BYPASS mode: there is no login; if bypass is on, or a session already exists, the component
 * immediately redirects (to / in bypass mode, otherwise back to where the user came from).
 * Sign in: email + password (with a "show password" checkbox) -> supabase.auth.signInWithPassword (this
 * talks to Supabase, not our API) -> on success navigate to `from` (replace). The session listener in
 * AuthProvider then loads the profile with GET /me. Wrong credentials show one generic message (s.invalid)
 * so it does not reveal which part was wrong; other failures show a "could not sign in" message.
 * Forgot password: email -> supabase.auth.resetPasswordForEmail with redirectTo <this site>/reset-password.
 * The confirmation is ALWAYS shown, even if the email has no account or the call failed, so the screen
 * never reveals which emails exist.
 * Local state: mode ('signin' | 'forgot'), email, password, showPw, busy (disables submit while a request
 * runs), error (form-level message), fieldErrors (per-input messages), sent (reset email confirmation).
 */
export default function Login() {
  // Current Supabase session (null when signed out; always null in bypass mode).
  const { signedIn, signInSimple } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  // RequireAuth redirects here with the page the user wanted in navigation state (`from`).
  const rawFrom = (loc.state as { from?: string } | null)?.from;
  // Where to go after sign-in: the wanted page, but never /login or /reset-password (which would loop);
  // default '/'.
  const from = rawFrom && !rawFrom.startsWith('/login') && !rawFrom.startsWith('/reset-password') ? rawFrom : '/';

  // Which form is shown: sign in, or the forgot-password form.
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  // Email text (shared by both modes).
  const [email, setEmail] = useState('');
  // Password text.
  const [password, setPassword] = useState('');
  // "Show password" checkbox: switches the input between text and password.
  const [showPw, setShowPw] = useState(false);
  // True while a Supabase request is running (disables the submit button).
  const [busy, setBusy] = useState(false);
  // Form-level error shown in a red box (wrong credentials / sign-in failed).
  const [error, setError] = useState<string | null>(null);
  // Messages for an empty email or password.
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  // True after "send reset link" was pressed; shows the confirmation text.
  const [sent, setSent] = useState(false);

  // Already signed in: return to the requested screen. In local demo bypass mode, keep the sign-in screen
  // visible so one click on Sign in can take the user straight to the sample dashboard.
  if (signedIn) return <Navigate to={from} replace />;

  /**
   * Sign-in form submit. Ignored while busy. Checks that email and password are filled (messages under the
   * inputs), then calls supabase.auth.signInWithPassword. Invalid credentials (HTTP 400/401 or code
   * invalid_credentials) -> s.invalid; any other failure or exception -> s.signInFailed. Success ->
   * navigate(from, { replace: true }).
   * @param ev — submit event.
   */
  const signIn = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    if (AUTH_BYPASS) {
      navigate('/', { replace: true });
      return;
    }
    const fe: { email?: string; password?: string } = {};
    if (!email.trim()) fe.email = s.emailRequired;
    if (!password) fe.password = s.passwordRequired;
    setFieldErrors(fe);
    setError(null);
    if (fe.email || fe.password) return;
    setBusy(true);
    try {
      if (SIMPLE_AUTH) {
        await signInSimple(email.trim(), password);
        navigate(from, { replace: true });
        return;
      }
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        setError(err.status === 400 || err.status === 401 || err.code === 'invalid_credentials' ? s.invalid : s.signInFailed);
        return;
      }
      navigate(from, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? s.invalid : e instanceof ApiError && e.status === 429 ? e.message : s.signInFailed);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Forgot-password submit. Needs an email. Calls supabase.auth.resetPasswordForEmail(email, { redirectTo:
   * <origin>/reset-password }); any failure is deliberately ignored, and in every case the confirmation is
   * shown (`sent`). The email link brings the user to /reset-password (see RecoveryRedirect in
   * AuthProvider).
   * @param ev — submit event.
   */
  const sendReset = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    if (!email.trim()) { setFieldErrors({ email: s.emailRequired }); return; }
    setFieldErrors({});
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    } catch {
      /* deliberately ignored: the answer never reveals whether the email has an account */
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  if (mode === 'forgot') {
    return (
      <AuthShell title={s.resetTitle}>
        {sent ? (
          <p role="status" className="mb-4 rounded-lg bg-forest-50 p-3 text-base text-forest-900">{s.resetSent}</p>
        ) : (
          <form onSubmit={sendReset} className="space-y-4" noValidate>
            <p className="text-sm text-ink/70">{s.resetHelp}</p>
            <Input label={s.email} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />
            <Button type="submit" className="w-full" loading={busy}>{s.resetSend}</Button>
          </form>
        )}
        <Button variant="ghost" className="mt-3 w-full" onClick={() => { setMode('signin'); setSent(false); setFieldErrors({}); }}>{s.backToSignIn}</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={s.title}>
      <form onSubmit={signIn} className="space-y-4" noValidate>
        <Input label={s.email} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)} error={fieldErrors.email} />
        <div>
          <Input label={s.password} type={showPw ? 'text' : 'password'} autoComplete="current-password" autoCapitalize="none" spellCheck={false}
            value={password} onChange={(e) => setPassword(e.target.value)} error={fieldErrors.password} />
          <label className="tap mt-1 flex items-center gap-3 text-base text-forest-900">
            <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
            {s.showPassword}
          </label>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-900">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>{busy ? s.submitting : s.submit}</Button>
      </form>
      {!SIMPLE_AUTH && <Button variant="ghost" className="mt-2 w-full" onClick={() => { setMode('forgot'); setError(null); setFieldErrors({}); }}>{s.forgot}</Button>}
    </AuthShell>
  );
}
