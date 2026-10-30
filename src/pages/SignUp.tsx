/**
 * Sign-up page: /sign-up (public). A new person creates their own Supabase account (full name, e-mail, password). They get NO access to
 * the CRM yet: the first time they sign in the app records them as a pending user (AuthProvider calls POST /signup/request) and shows
 * "waiting for approval" until an administrator approves them in Settings > Users. Needs "Allow new users to sign up" on in Supabase.
 * With e-mail confirmation on there is no session after sign-up; the page asks the person to confirm the e-mail and then sign in.
 */
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Input } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { t } from '@/strings';
import { AuthShell } from './Login';

const s = t.signup;

export default function SignUp() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  if (signedIn) return <Navigate to="/" replace />;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const fe: Record<string, string> = {};
    if (!fullName.trim()) fe.fullName = s.nameRequired;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = s.emailInvalid;
    if (password.length < 8) fe.password = s.passwordShort;
    if (confirm !== password) fe.confirm = s.passwordMismatch;
    setErrors(fe);
    setError(null);
    if (Object.keys(fe).length) return;
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
      if (err) { setError(err.status === 422 || /signups? (not allowed|disabled)/i.test(err.message) ? s.signupsOff : err.message || s.failed); return; }
      // an e-mail that already has an account comes back without an error and without identities
      if (data.user && data.user.identities?.length === 0) { setError(s.exists); return; }
      if (data.session) { navigate('/', { replace: true }); return; }
      setConfirmSent(true);
    } catch {
      setError(s.failed);
    } finally {
      setBusy(false);
    }
  };

  if (confirmSent) {
    return <AuthShell title={s.sentTitle}><p role="status" className="mb-4 rounded-lg bg-forest-50 p-3 text-base text-forest-900">{s.confirmEmail}</p><Link to="/login" className="font-semibold text-paprika underline">{s.toSignIn}</Link></AuthShell>;
  }

  return (
    <AuthShell title={s.title}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-fg-secondary">{s.intro}</p>
        <Input label={s.fullName} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
        <Input label={s.email} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Input label={s.password} type={showPw ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <Input label={s.confirm} type={showPw ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <label className="tap flex items-center gap-3 text-base text-forest-900"><input type="checkbox" className="h-5 w-5 accent-forest-700" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />{s.showPassword}</label>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-900">{error}</p>}
        <Button type="submit" className="w-full" loading={busy}>{busy ? s.creating : s.create}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-fg-secondary">{s.haveAccount} <Link to="/login" className="font-semibold text-paprika underline">{s.signIn}</Link></p>
    </AuthShell>
  );
}
