/**
 * Creates the Supabase client used for login. Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
 * (public values, see vite-env.d.ts). Makes no calls to our own Express API and uses no react-query keys.
 * Implements the sign-in/session side of FR-01 and FR-02 (the API verifies the token it sends, see
 * lib/api.ts).
 */

import { createClient } from '@supabase/supabase-js';

/**
 * The one Supabase browser client, created when this module is first imported. Used only for Auth:
 * signInWithPassword and resetPasswordForEmail (pages/Login.tsx), updateUser (pages/ResetPassword.tsx),
 * getSession/signOut/onAuthStateChange (auth/AuthProvider.tsx, lib/api.ts).
 * Browser client: publishable key only, used for login. The service-role key never exists in this project.
 * Options: persistSession keeps the session in localStorage; autoRefreshToken renews the access token
 * before it expires, so the device stays signed in (FR-01; the 30-day length is the Supabase project's
 * refresh-token setting); detectSessionInUrl reads the token from the URL when the user opens a
 * password-reset email link (this is what raises the PASSWORD_RECOVERY event).
 * The client is created even in AUTH_BYPASS mode, but nothing signs in with it then.
 */
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL ?? 'http://localhost:54321', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'unused', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
