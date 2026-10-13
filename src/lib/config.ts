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
