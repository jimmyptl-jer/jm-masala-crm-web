/**
 * Reset password screen (route /reset-password, public): choose a new password after clicking the email
 * link.
 * Talks only to Supabase (supabase.auth.updateUser, lib/supabase.ts); no Express API call. Reached via
 * RecoveryRedirect (auth/AuthProvider.tsx), which reacts to Supabase's PASSWORD_RECOVERY event.
 * Reuses AuthShell from pages/Login.tsx. SRS: FR-01/FR-02 (password reset by email).
 */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Input, Spinner, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { t } from '@/strings';
import { AuthShell } from './Login';

// Shorthand for the login strings (this screen shares them).
const s = t.login;

/**
 * Set-a-new-password screen (route /reset-password, public). The user arrives from the link in the
 * password-reset email; Supabase has already signed them in with a temporary recovery session (see
 * RecoveryRedirect in AuthProvider).
 * States: while the auth check runs a spinner; with no session (link expired or page opened directly) a
 * "link expired" card with a Back to sign in link; otherwise the form: new password, confirm password,
 * "show passwords" checkbox, Save.
 * Save: needs at least 8 characters and both fields equal (messages under the inputs), then
 * supabase.auth.updateUser({ password }) (Supabase, not our API). Supabase error text, or a generic message
 * if none, appears in a red box; success shows a "password saved" toast and navigates to / (replace).
 * Local state: pw, pw2, showPw (text vs password inputs), busy (prevents double-submit; submit ignores a
 * second call), errors { pw, pw2, form }.
 * AUTH_BYPASS mode: there is never a session here, so you only see the "link expired" card.
 */
export default function ResetPassword() {
  // Session from AuthProvider; `loading` is true until the first session check completed.
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  // New password text.
  const [pw, setPw] = useState('');
  // Confirmation text.
  const [pw2, setPw2] = useState('');
  // "Show password" checkbox state.
  const [showPw, setShowPw] = useState(false);
  // True while updateUser is running.
  const [busy, setBusy] = useState(false);
  // Field messages (pw, pw2) and a form-level message (form) from Supabase.
  const [errors, setErrors] = useState<{ pw?: string; pw2?: string; form?: string }>({});

  // Wait for the session check so the "expired" card is not flashed while the recovery session is still
  // being read.
  if (loading) return <AuthShell title={s.newPasswordTitle}><Spinner /></AuthShell>;

  // No recovery session: the link is invalid/expired or the page was opened directly.
  if (!session) {
    return (
      <AuthShell title={s.noRecoveryTitle}>
        <p className="mb-4 text-base text-fg-secondary">{s.noRecoveryHelp}</p>
        <Link to="/login" className="tap inline-flex w-full items-center justify-center rounded-lg bg-forest-900 px-4 py-2 text-base font-semibold text-white hover:bg-forest-800">{s.backToSignIn}</Link>
      </AuthShell>
    );
  }

  /**
   * Form submit: validate length and match, then supabase.auth.updateUser({ password }); on success toast +
   * go to /. Ignored while busy. @param ev — submit event.
   */
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e: typeof errors = {};
    if (pw.length < 8) e.pw = s.passwordTooShort;
    if (pw2 !== pw) e.pw2 = s.passwordMismatch;
    setErrors(e);
    if (e.pw || e.pw2) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) { setErrors({ form: error.message || s.updateFailed }); return; }
      toast(s.passwordSaved);
      navigate('/', { replace: true });
    } catch {
      setErrors({ form: s.updateFailed });
    } finally {
      setBusy(false);
    }
  };

  // Both password inputs switch between hidden and visible together.
  const type = showPw ? 'text' : 'password';
  return (
    <AuthShell title={s.newPasswordTitle}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label={s.newPassword} type={type} autoComplete="new-password" autoCapitalize="none" spellCheck={false} hint={s.passwordHint}
          value={pw} onChange={(e) => setPw(e.target.value)} error={errors.pw} />
        <Input label={s.confirmPassword} type={type} autoComplete="new-password" autoCapitalize="none" spellCheck={false}
          value={pw2} onChange={(e) => setPw2(e.target.value)} error={errors.pw2} />
        <label className="tap flex items-center gap-3 text-base text-forest-900">
          <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
          {s.showPassword}
        </label>
        {errors.form && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-900">{errors.form}</p>}
        <Button type="submit" className="w-full" loading={busy}>{s.newPasswordSave}</Button>
      </form>
    </AuthShell>
  );
}
