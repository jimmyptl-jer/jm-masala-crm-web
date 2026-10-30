/**
 * First-time setup page: /jm-masala-crm-create-admin-user (public, outside the sign-in check; see router.tsx). Lets the owner create the
 * first administrator: sign up or sign in with Supabase, then claim the administrator account in the CRM.
 * API: GET /setup/status (is setup still open?) and POST /setup/claim-admin (needs the Supabase token that lib/api.ts adds). The API
 * decides everything that matters: setup works only while no active administrator exists and only for the e-mail in ADMIN_EMAIL, so
 * the hidden address is not what protects it. Afterwards the page just says setup is done.
 * Supabase: signUp needs "Allow new users to sign up" on (switch it off again afterwards), or create the user in the Supabase
 * dashboard and use "I already have an account" here. If the project requires e-mail confirmation there is no session after sign up;
 * the page then asks the person to confirm the e-mail and come back.
 */
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button, ErrorNote, Input, Spinner } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { t } from '@/strings';
import { AuthShell } from './Login';

const s = t.setup;
type Mode = 'signup' | 'signin';

export default function CreateAdmin() {
  const { session, refreshMe } = useAuth();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ['setup', 'status'], queryFn: () => api.get<{ open: boolean }>('/setup/status'), retry: false, refetchOnWindowFocus: false });
  const [mode, setMode] = useState<Mode>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (status.isPending) return <AuthShell title={s.title}><Spinner label={s.loading} /></AuthShell>;
  if (status.isError) return <AuthShell title={s.title}><ErrorNote error={status.error} onRetry={() => void status.refetch()} /></AuthShell>;
  if (!status.data.open) {
    return <AuthShell title={s.closedTitle}><p className="mb-4 text-base text-fg-secondary">{s.closed}</p><Link to="/login" className="font-semibold text-paprika underline">{s.toSignIn}</Link></AuthShell>;
  }

  /** Claims the administrator account with the current Supabase session, then opens the app. */
  const claim = async () => {
    try {
      await api.post('/setup/claim-admin', { full_name: fullName.trim() });
      await refreshMe();
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? s.notAllowed : e instanceof ApiError ? e.message : s.failed);
    }
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const fe: Record<string, string> = {};
    if (!fullName.trim()) fe.fullName = s.nameRequired;
    if (!session) {
      if (!email.trim()) fe.email = s.emailRequired;
      if (mode === 'signup' && password.length < 8) fe.password = s.passwordShort;
      if (mode === 'signin' && !password) fe.password = s.passwordShort;
      if (mode === 'signup' && confirm !== password) fe.confirm = s.passwordMismatch;
    }
    setErrors(fe);
    setError(null);
    setNotice(null);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      if (!session) {
        if (mode === 'signup') {
          const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
          if (err) { setError(err.message || s.failed); return; }
          if (!data.session) { setNotice(s.confirmEmail); return; }
        } else {
          const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (err) { setError(err.status === 400 || err.status === 401 || err.code === 'invalid_credentials' ? s.invalid : s.failed); return; }
        }
      }
      await claim();
    } catch {
      setError(s.failed);
    } finally {
      setBusy(false);
    }
  };

  const pwInput = (label: string, value: string, set: (v: string) => void, err: string | undefined, autoComplete: string) =>
    <Input label={label} type={showPw ? 'text' : 'password'} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} value={value} onChange={(e) => set(e.target.value)} error={err} />;

  return (
    <AuthShell title={s.title}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-fg-secondary">{session ? s.finishHelp : s.intro}</p>
        {session && <p className="text-sm font-medium text-ink">{s.signedInAs(session.user.email ?? '')}</p>}
        <Input label={s.fullName} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
        {!session && <>
          <Input label={s.email} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          {pwInput(s.password, password, setPassword, errors.password, mode === 'signup' ? 'new-password' : 'current-password')}
          {mode === 'signup' && pwInput(s.confirm, confirm, setConfirm, errors.confirm, 'new-password')}
          <label className="tap flex items-center gap-3 text-base text-forest-900"><input type="checkbox" className="h-5 w-5 accent-forest-700" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />{s.showPassword}</label>
        </>}
        {notice && <p role="status" className="rounded-lg bg-forest-50 p-3 text-base text-forest-900">{notice}</p>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-900">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>{busy ? s.creating : session ? s.finish : mode === 'signup' ? s.create : s.signInAndFinish}</Button>
      </form>
      {!session && <Button variant="ghost" className="mt-2 w-full" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setErrors({}); setError(null); setNotice(null); }}>{mode === 'signup' ? s.haveAccount : s.needAccount}</Button>}
    </AuthShell>
  );
}
