/** Shared helpers for the end-to-end tests: credentials, sign-in, the Supabase token, direct API calls and a problem collector. */
import { expect, type APIResponse, type Locator, type Page } from '@playwright/test';

export const API = (process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');

/** The test account (an administrator's Supabase sign-in), from E2E_EMAIL and E2E_PASSWORD. */
export function creds(): { email: string; password: string } {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error('Set E2E_EMAIL and E2E_PASSWORD (an administrator test account) before running the end-to-end tests.');
  return { email, password };
}

/** Signs in through the login screen and waits for the app shell. */
export async function signIn(page: Page): Promise<void> {
  const { email, password } = creds();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: '+ New', exact: true })).toBeVisible({ timeout: 25_000 });
}

/** The signed-in person's Supabase access token, read from the browser's storage (the page must have been opened once). */
export async function accessToken(page: Page): Promise<string> {
  if (page.url() === 'about:blank') await page.goto('/');
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      if (/^sb-.*-auth-token$/.test(key)) return (JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token: string }).access_token;
    }
    throw new Error('No Supabase session in the browser');
  });
}

/** Calls the API directly as the signed-in person (used for set-up, clean-up and checking the stored result). */
export async function api(page: Page, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, data?: unknown): Promise<APIResponse> {
  return page.request.fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${await accessToken(page)}` }, ...(data === undefined ? {} : { data }) });
}

/** Collects what should never happen while a page is used: uncaught errors, console errors and failed API calls (status 400 and up). */
export function collectProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`page error: ${String(e).slice(0, 160)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) problems.push(`console error: ${m.text().slice(0, 160)}`); });
  page.on('response', (r) => { if (r.url().startsWith(API) && r.status() >= 400) problems.push(`API ${r.status()} ${r.request().method()} ${r.url().replace(API, '')}`); });
  return problems;
}

/** A name that marks a record as created by a test, so it is easy to spot (and is archived again afterwards). */
export const testName = (what: string) => `E2E ${what} ${Date.now().toString(36).toUpperCase()}`;

/** Checks that one element contains every one of the texts (Playwright's toContainText with a list means one element per text, which is not what is wanted here). */
export async function expectText(locator: Locator, texts: string[]): Promise<void> {
  for (const text of texts) await expect(locator).toContainText(text);
}
