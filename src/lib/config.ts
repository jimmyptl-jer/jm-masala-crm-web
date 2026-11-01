/**
 * The single switch that turns login off (AUTH_BYPASS). Read from the build-time variable VITE_AUTH_BYPASS.
 * Imported by auth/AuthProvider.tsx, components/Layout.tsx, lib/api.ts and pages/Login.tsx; each documents
 * what it does differently. Calls no API.
 */

/**
 * True when VITE_AUTH_BYPASS is exactly the string 'true' (set in web/.env, see .env.example, or as a
 * build-time variable). Evaluated once when the bundle is built or the dev server starts; changing it needs
 * a rebuild/restart.
 * What changes when true: AuthProvider skips Supabase and calls GET /me; RequireAuth lets everyone in; /login
 * redirects to /; Layout hides the Sign out buttons. Only meant for trying the screens on the sample data
 * (VITE_API_URL unset): the real API always needs a Supabase sign-in and has no bypass.
 */
export const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === 'true';

/**
 * Base URL of the real API including the /api/v1 prefix (build-time VITE_API_URL, e.g. http://localhost:3000/api/v1), or ''
 * when not set (sample-data mode). With it set, the routes listed in LIVE_ROUTES go to the real API and any other call fails with
 * ApiError 501 'not_available' (it never falls back to sample data); screens hide the controls of routes that are not live yet. Live mode needs a real
 * Supabase sign-in (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) and VITE_AUTH_BYPASS unset (or not 'true').
 */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

/** The calls the real API serves so far: [HTTP method or '*', path pattern]. Keep in step with docs/API.md. */
const LIVE_ROUTES: [string, RegExp][] = [
  ['POST', /^\/auth\/login$/],
  ['GET', /^\/me$/],
  ['*', /^\/buyers(\/[0-9a-f]{24})?(\?|$)/],
  ['GET', /^\/quotes(\?|$)/],
  ['POST', /^\/signup\/request$/],
  ['GET', /^\/users$/],
  ['PATCH', /^\/users\/[0-9a-f]{24}$/],
  ['GET', /^\/setup\/status$/],
  ['POST', /^\/setup\/claim-admin$/],
  ['*', /^\/inquiries(\/[0-9a-f]{24})?(\?|$)/],
  ['GET', /^\/price-calculator\/defaults$/],
  ['POST', /^\/price-calculator$/],
  ['*', /^\/price-calculator\/sheets(\/[0-9a-f]{24})?(\?|$)/],
  ['*', /^\/samples(\/[0-9a-f]{24})?(\?|$)/],
  ['*', /^\/partners(\/[0-9a-f]{24}(\/activities)?)?(\?|$)/],
  ['*', /^\/products(\/[0-9a-f]{24})?(\?|$)/],
  ['GET', /^\/products\/[0-9a-f]{24}\/rate-history$/],
  ['PUT', /^\/daily-rates$/],
  // settings, today's dollar rate and what the server can send itself
  ['GET', /^\/settings$/],
  ['PUT', /^\/settings$/],
  ['*', /^\/fx-rate$/],
  ['GET', /^\/send-channels$/],
  // quotes: live totals, drafts, issue (with the PDF), the page and e-mail preview, the PDF and sending. Ids of the sample data are not 24 hex characters, so they stay on the sample data.
  ['POST', /^\/quotes\/calculate$/],
  ['POST', /^\/quotes$/],
  ['GET', /^\/quotes\/[0-9a-f]{24}$/],
  ['PUT', /^\/quotes\/[0-9a-f]{24}\/draft$/],
  ['POST', /^\/quotes\/[0-9a-f]{24}\/issue$/],
  ['*', /^\/quotes\/[0-9a-f]{24}\/revisions\/\d+\/(pdf|render|send|document)(\?|$)/],
  // status change, follow-up date, activity log, the dashboard, the team list and the Buyer CRM numbers (routes confirmed in api/src/routes)
  ['PATCH', /^\/quotes\/[0-9a-f]{24}\/(status|followup)$/],
  ['POST', /^\/quotes\/[0-9a-f]{24}\/activities$/],
  ['GET', /^\/dashboard$/],
  ['GET', /^\/team$/],
  ['GET', /^\/buyers\/summary$/],
  ['POST', /^\/buyers\/[0-9a-f]{24}\/activities$/],
];

/** Path of the one-time administrator set-up screen (public). AuthProvider must not auto-request access while it is open. */
export const CREATE_ADMIN_PATH = '/jm-masala-crm-create-admin-user';

/** True when the app talks to the real API (VITE_API_URL set). False = sample-data mode (dev / the explicit demo build). */
export const LIVE_MODE = API_URL !== '';

/** Whether this call is answered by the real API (API_URL is set and the route is live). */
export const isLive = (method: string, path: string): boolean => LIVE_MODE && LIVE_ROUTES.some(([m, rx]) => (m === '*' || m === method) && rx.test(path));

/** A well-formed id that matches the id patterns above; used to ask hasRoute about routes that carry an id. */
export const PROBE_ID = '000000000000000000000000';

/**
 * Whether a screen may offer a feature that calls this route: always in sample-data mode, and in live mode only when the route is
 * in LIVE_ROUTES. Screens use it to hide controls whose API route does not exist yet; adding the route to LIVE_ROUTES turns them on.
 * @example hasRoute('PATCH', `/quotes/${PROBE_ID}/status`)
 */
export const hasRoute = (method: string, path: string): boolean => !LIVE_MODE || isLive(method, path);
