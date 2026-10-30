// Refreshes the saved test session (state.json) with its own refresh token, so a long run does not fail with 401 when the access token ages.
// Usage: node e2e/refresh-session.mjs   (run from web/). Never prints a token.
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const file = 'e2e/.auth/state.json';
const state = JSON.parse(readFileSync(file, 'utf8'));
let done = false;
for (const origin of state.origins) {
  for (const item of origin.localStorage) {
    if (!/^sb-.*-auth-token$/.test(item.name)) continue;
    const session = JSON.parse(item.value);
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
    if (!res.ok) { console.error(`refresh failed: HTTP ${res.status} (the refresh token was already used or expired: sign in again with the setup project)`); process.exit(1); }
    const next = await res.json();
    item.value = JSON.stringify({ ...session, access_token: next.access_token, refresh_token: next.refresh_token, expires_at: next.expires_at, expires_in: next.expires_in, token_type: next.token_type, user: next.user ?? session.user });
    done = true;
  }
}
if (!done) { console.error('no Supabase session found in state.json'); process.exit(1); }
writeFileSync(file, JSON.stringify(state, null, 2));
console.log('session refreshed');
