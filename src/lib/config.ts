/**
 * The single switch that turns login off (AUTH_BYPASS). Read from the build-time variable VITE_AUTH_BYPASS.
 * Imported by auth/AuthProvider.tsx, components/Layout.tsx, lib/api.ts and pages/Login.tsx; each documents
 * what it does differently. Calls no API.
 */

/**
 * True when VITE_AUTH_BYPASS is exactly the string 'true' (set in web/.env, see .env.example, or as a
 * build-time variable). Evaluated once when the bundle is built or the dev server starts; changing it needs
 * a rebuild/restart.
 * What changes when true: AuthProvider skips Supabase and just calls GET /me; RequireAuth lets everyone in;
 * /login redirects to /; Layout hides the Sign out buttons; lib/api.ts sends no Authorization header and
 * does not sign out on a 401. The API must run with AUTH_BYPASS=true as well, otherwise every request fails
 * with 401.
 */
export const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true';

/** The current API adapter is wired to in-memory mock data, never production records. */
export const MOCK_API = true;

/**
 * True when VITE_SIMPLE_AUTH is 'true': sign in with e-mail and password against the API's fixed users
 * (POST /auth/login) instead of Supabase Auth. The token is kept in localStorage (key below) for 30 days.
 * The API must run with SIMPLE_AUTH=true as well.
 */
export const SIMPLE_AUTH = import.meta.env.VITE_SIMPLE_AUTH === 'true';
/** localStorage key holding the simple-login token. */
export const TOKEN_KEY = 'jm-login-token';
/** Window event fired when the API rejects the stored token, so the app returns to the sign-in screen. */
export const AUTH_LOST_EVENT = 'jm-auth-lost';
