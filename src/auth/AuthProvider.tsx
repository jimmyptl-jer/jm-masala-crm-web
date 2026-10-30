/**
 * Auth state, the useAuth() hook and the route guards for the whole app.
 * Normal mode: Supabase Auth holds the session (FR-01: stays signed in on the device); the API is asked for
 * the profile with GET /me (FR-02), which gives role and full name. AUTH_BYPASS mode (lib/config.ts): no
 * Supabase, no login; GET /me returns the built-in admin.
 * Exports: AuthProvider (mounted in main.tsx), useAuth, RequireAuth and RequireAdmin (route guards, FR-04)
 * and RecoveryRedirect (password reset), all wired up in router.tsx.
 * React-query: no query keys of its own; calls queryClient.clear() when the user signs out.
 */

import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '@/lib/api';
import { AUTH_BYPASS } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import type { Me } from '@/lib/types';
import { Spinner } from '@/components/ui';
import { t } from '@/strings';

/** The value every component gets from useAuth(). Held in React context by AuthProvider. */
interface AuthState {
  /**
   * Supabase session (holds the access token). Always null in AUTH_BYPASS mode: there is no Supabase login
   * then.
   */
  session: Session | null;
  /**
   * Profile of the signed-in user from GET /me ({ id, email, role, full_name }); null until loaded or if
   * loading failed.
   */
  me: Me | null;
  /**
   * True until the first session check (and, when signed in, the first /me call) has finished. Guards show
   * a spinner meanwhile.
   */
  loading: boolean;
  /**
   * me.role === 'admin'. Used to show Settings and the product edit buttons (FR-04); the API enforces it as
   * well.
   */
  isAdmin: boolean;
  /** Set when the account signed in but has no profile row yet. */
  profileError: string | null;
  /** True when someone is signed in (a Supabase session). */
  signedIn: boolean;
  /**
   * Ends the Supabase session. The SIGNED_OUT listener in AuthProvider then clears me and the whole query
   * cache.
   */
  signOut: () => Promise<void>;
  /**
   * Re-fetches GET /me. Called after a user edits their own name in Settings > Users so "Prepared by"
   * updates.
   */
  refreshMe: () => Promise<void>;
}

// React context holding the AuthState; null outside AuthProvider (useAuth turns that into an error).
/** The person every request is treated as while login is off (the API answers GET /me with the same). */
const BYPASS_ME: Me = { id: '00000000-0000-4000-8000-000000000001', email: null, role: 'admin', full_name: 'Admin' };

const Ctx = createContext<AuthState | null>(null);
/**
 * Read the auth state (session, me, loading, isAdmin, profileError, signOut, refreshMe) from any component
 * under AuthProvider.
 * @returns the AuthState object.
 * @throws Error if called outside AuthProvider (a programming mistake, not a runtime condition).
 */
export const useAuth = (): AuthState => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
};

/**
 * Provider that owns the signed-in user for the whole app (mounted once in main.tsx, above the router).
 * Normal mode: reads the stored Supabase session (persisted in localStorage by lib/supabase.ts, so the
 * device stays signed in, FR-01), then calls GET /me to load the profile and role. It listens to Supabase
 * auth events: SIGNED_OUT clears `me` and empties the react-query cache (so the next user never sees the
 * previous user's data); SIGNED_IN loads the profile; token refreshes only update `session`.
 * AUTH_BYPASS mode (lib/config.ts): no Supabase call is made at all. It just calls GET /me, and the API
 * answers with the built-in admin, so `session` stays null and `me` is that admin.
 * Local state: session, me, loading (true until the first check completes), profileError (message shown
 * when the account has no profile row or /me failed).
 * @param props.children — the app (RouterProvider).
 * React-query: calls qc.clear() on sign-out; uses no query keys itself (me is plain state).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const qc = useQueryClient();

  /**
   * Fetch the current user's profile with GET /me and store it in `me`.
   * On success clears profileError. On failure `me` becomes null and: an ApiError with code `no_profile`
   * (403: the account signed in but has no profiles row) sets the "account not set up" message; a 401 sets
   * nothing (api.request has already signed the user out, so the login screen takes over); any other error
   * sets the generic "could not load" message.
   * Stable (useCallback with no deps) so the effect below does not re-run. Also exposed as refreshMe.
   */
  const loadMe = useCallback(async (retry = true): Promise<void> => {
    try {
      setMe(await api.get<Me>('/me'));
      setProfileError(null);
    } catch (e) {
      // Login is switched off: never block the whole app (or show a Sign out screen) because the API did not answer
      // for a moment. Use the built-in admin; each page shows its own "try again" if its data cannot load.
      if (AUTH_BYPASS) { setMe(BYPASS_ME); setProfileError(null); return; }
      setMe(null);
      // 403 account_inactive: signed up and waiting for approval (or deactivated)
      if (e instanceof ApiError && e.code === 'account_inactive') { setProfileError(t.login.pending); return; }
      // 403 forbidden: signed in with Supabase but not known to the CRM yet (just signed up): ask for access once, which records the
      // person as pending, then look again
      if (e instanceof ApiError && e.status === 403 && retry) {
        try { await api.post('/signup/request', {}); return loadMe(false); } catch { /* fall through to the message below */ }
      }
      if (e instanceof ApiError && e.status === 403) setProfileError(t.login.noProfile);
      // 401 from GET /me while Supabase accepts the session: the API rejects Supabase's token (wrong Supabase project, or an old API copy)
      else if (e instanceof ApiError && e.status === 401) setProfileError(t.login.apiRejected);
      else setProfileError(t.common.loadFailed);
    }
  }, []);

  // Runs once at start-up (and again only if loadMe/qc identity changes, which they do not).
  // Bypass mode: just load the profile; `alive` stops a late response from touching state after unmount.
  // Normal mode: 1) read the stored session, load the profile if there is one, then stop `loading`;
  // 2) subscribe to auth events (login, logout, token refresh, password recovery). The cleanup
  // unsubscribes.
  useEffect(() => {
    let alive = true;
    if (AUTH_BYPASS) {
      // no Supabase session: the API identifies everyone as the built-in admin
      loadMe().finally(() => { if (alive) setLoading(false); });
      return () => { alive = false; };
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) await loadMe();
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') { setMe(null); qc.clear(); }
      // defer: Supabase forbids awaiting other Supabase calls inside this callback
      if (event === 'SIGNED_IN' && s) setTimeout(() => void loadMe(), 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadMe, qc]);

  // Memoised so consumers re-render only when something they read actually changed.
  // signOut simply asks Supabase to end the session; the SIGNED_OUT listener above does the clean-up.
  const value = useMemo<AuthState>(() => ({
    session, me, loading, profileError, isAdmin: me?.role === 'admin',
    signedIn: !!session,
    signOut: async () => { await supabase.auth.signOut(); },
    refreshMe: loadMe,
  }), [session, me, loading, profileError, loadMe]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Route guard (router.tsx wraps every private screen in it). Renders the matched child route via <Outlet
 * />.
 * - While loading: a spinner.
 * - No Supabase session (normal mode): redirect to /login, remembering the wanted URL in navigation state
 *   (`from`) so Login can send the user back after signing in. In AUTH_BYPASS mode this check is skipped.
 * - Session but no profile (`me` null): a small screen showing profileError (or "Loading") and a Sign out
 *   link, so a half-set-up account is not stuck. In bypass mode this screen appears only if GET /me itself
 *   fails.
 */
export function RequireAuth() {
  const { signedIn, me, loading, profileError, signOut } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!signedIn && !AUTH_BYPASS) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (!me) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="mb-4 text-forest-900">{profileError ?? t.common.loading}</p>
        <button className="tap font-semibold underline" onClick={() => void signOut()}>{t.nav.signOut}</button>
      </div>
    );
  }
  return <Outlet />;
}

/**
 * Route guard for admin-only screens (currently /settings, FR-04). Non-admins are redirected to /
 * (replace). Only a convenience: the API returns 403 for admin endpoints anyway. In AUTH_BYPASS mode the
 * built-in user is an admin, so it always lets you through.
 */
export function RequireAdmin() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}

/**
 * Invisible component (renders null), mounted by Root in router.tsx. When the user clicks the link in a
 * password-reset email, Supabase signs them in with a temporary recovery session and fires the
 * PASSWORD_RECOVERY event; this component catches it and navigates to /reset-password (replace), where the
 * new password is set. Subscribes on mount and unsubscribes on unmount.
 */
export function RecoveryRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password', { replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);
  return null;
}
