/**
 * Helpers for the QA tests (e2e/api/*, the role tests and the quote tests): sign in WITHOUT a browser, call the API as a given person,
 * make and remove test records. Optional accounts come from environment variables; a test that needs one that is not set is skipped,
 * never failed.
 *   E2E_EMAIL / E2E_PASSWORD                     an administrator (required, as for every e2e test)
 *   E2E_SALES_EMAIL / E2E_SALES_PASSWORD         an active sales user
 *   E2E_STRANGER_EMAIL / E2E_STRANGER_PASSWORD   a Supabase account that has NO CRM user (never asked for access)
 *   E2E_PENDING_EMAIL / E2E_PENDING_PASSWORD     a CRM user waiting for approval (inactive, pending)
 *   E2E_DEACTIVATED_EMAIL / E2E_DEACTIVATED_PASSWORD   a CRM user an administrator has deactivated
 *   E2E_ISSUE=1   allow tests that issue quotations (each uses up a real quotation number: run them against a test database)
 *   E2E_SEND=1    also allow the test that really e-mails a quotation
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';
import { API, testName } from './helpers';
import { fakeBuyer } from './fake';

export { API, testName };

/** The values of web/.env, so the tests need no second copy of the Supabase address and key. */
function dotEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(fileURLToPath(new URL('../.env', import.meta.url)), 'utf8').split(/\r?\n/).filter((l) => /^\s*[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
    );
  } catch { return {}; }
}
const env = dotEnv();
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.E2E_SUPABASE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

export type Person = 'admin' | 'sales' | 'stranger' | 'pending' | 'deactivated';
const ENV_NAMES: Record<Person, [string, string]> = {
  admin: ['E2E_EMAIL', 'E2E_PASSWORD'], sales: ['E2E_SALES_EMAIL', 'E2E_SALES_PASSWORD'], stranger: ['E2E_STRANGER_EMAIL', 'E2E_STRANGER_PASSWORD'],
  pending: ['E2E_PENDING_EMAIL', 'E2E_PENDING_PASSWORD'], deactivated: ['E2E_DEACTIVATED_EMAIL', 'E2E_DEACTIVATED_PASSWORD'],
};

/** The e-mail and password of a test person, or null when their environment variables are not set. */
export function accountOf(who: Person): { email: string; password: string } | null {
  const [e, p] = ENV_NAMES[who];
  return process.env[e] && process.env[p] ? { email: process.env[e]!, password: process.env[p]! } : null;
}

const tokens = new Map<Person, string>();
/** Signs a test person in with Supabase (no browser) and returns the access token, kept for the run. @throws when the account is not set up. */
export async function tokenOf(who: Person): Promise<string> {
  const cached = tokens.get(who);
  if (cached) return cached;
  const account = accountOf(who);
  if (!account) throw new Error(`Set ${ENV_NAMES[who].join(' and ')} to use the ${who} test account.`);
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase address and key not found: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in web/.env.');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(account) });
  if (!res.ok) throw new Error(`Supabase sign-in of the ${who} account failed (${res.status}).`);
  const token = ((await res.json()) as { access_token: string }).access_token;
  tokens.set(who, token);
  return token;
}

export type Verb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/** Calls the API as a test person (their token), or with no sign-in at all (`null`). The path starts with '/'; a failed status never throws. */
export function call(request: APIRequestContext, as: string | null, method: Verb, path: string, data?: unknown, headers: Record<string, string> = {}) {
  return request.fetch(`${API}${path}`, { method, headers: { ...(as ? { Authorization: `Bearer ${as}` } : {}), ...headers }, ...(data === undefined ? {} : { data }), failOnStatusCode: false });
}

/** Whether tests that issue quotations (using real quotation numbers) are allowed; whether the one that really sends e-mail is. */
export const ALLOW_ISSUE = process.env.E2E_ISSUE === '1' || process.env.E2E_SEND === '1';
export const ALLOW_SEND = process.env.E2E_SEND === '1';
export const ISSUE_REASON = 'Set E2E_ISSUE=1 to run this: it issues quotations and so uses up real quotation numbers (use a test database).';

/** A test buyer (export, USD, CIF) made through the API. `over` changes any field. */
export async function makeBuyer(request: APIRequestContext, token: string, over: Record<string, unknown> = {}): Promise<{ id: string; company: string }> {
  const person = fakeBuyer();
  const company = (over.company_name as string | undefined) ?? person.company_name;
  const res = await call(request, token, 'POST', '/buyers', { type: 'export', company_name: company, country: 'UAE', city: 'Dubai', contact_name: person.contact_name, designation: person.designation, phone: person.phone, email: 'e2e-buyer@example.com', default_currency: 'USD', default_incoterm: 'CIF', default_port: 'Jebel Ali', ...over });
  if (res.status() !== 201) throw new Error(`Could not make a test buyer: ${res.status()} ${await res.text()}`);
  return { id: ((await res.json()) as { id: string }).id, company };
}

/** A test grade of Cumin Seeds that can be quoted (active, with GST %). `gst` is the percent. */
export async function makeProduct(request: APIRequestContext, token: string, gst = '5', over: Record<string, unknown> = {}): Promise<{ id: string; grade: string }> {
  const grade = (over.grade as string | undefined) ?? testName(`GST${gst}`);
  const res = await call(request, token, 'POST', '/products', { name: 'Cumin Seeds', status: 'active', gst_rate: gst, unit: 'MT', ref_rate_usd: '2850', packing_options: ['25 kg PP Bag'], ...over, grade });
  if (res.status() !== 201) throw new Error(`Could not make a test product: ${res.status()} ${await res.text()}`);
  return { id: ((await res.json()) as { id: string }).id, grade };
}

/** Archives test records again (buyers and products are never deleted; quotations cannot be removed). Records already gone are ignored. */
export async function cleanUp(request: APIRequestContext, token: string, records: { buyers?: string[]; products?: string[] }): Promise<void> {
  for (const id of records.buyers ?? []) await call(request, token, 'DELETE', `/buyers/${id}`);
  for (const id of records.products ?? []) await call(request, token, 'PATCH', `/products/${id}`, { archived: true });
}

/** A valid, unused 24-character id: well formed but nothing is stored under it. */
export const ghostId = () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
