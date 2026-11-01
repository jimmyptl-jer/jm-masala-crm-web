/**
 * Type declarations for Vite (not runtime code). The reference line pulls in Vite's client types
 * (import.meta.env, asset imports); the interfaces below describe this project's own VITE_* variables.
 */

/// <reference types="vite/client" />
/**
 * Typed list of the build-time variables the app reads from web/.env (see .env.example). Vite copies every
 * VITE_* variable into the browser bundle when you build, so they must never be secrets.
 * - VITE_SUPABASE_URL: the Supabase project URL (lib/supabase.ts).
 * - VITE_SUPABASE_PUBLISHABLE_KEY: the public "anon/publishable" key, safe in the browser
 *   (lib/supabase.ts).
 * - VITE_API_URL: base URL of the Express API including /api/v1 (lib/config.ts). Default '' = sample-data mode (dev / demo only);
 *   a production build fails without it unless VITE_DEMO=true.
 * - VITE_DEMO: the string 'true' lets a production build run without VITE_API_URL (sample-data demo). Read by vite.config.ts only.
 * - VITE_AUTH_BYPASS: the string 'true' switches login off (lib/config.ts). Optional.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_API_URL: string;
  readonly VITE_AUTH_BYPASS?: string;
  readonly VITE_DEMO?: string;
}
// Tells TypeScript that import.meta.env has the shape above.
interface ImportMeta { readonly env: ImportMetaEnv }
