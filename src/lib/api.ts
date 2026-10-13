/**
 * HTTP client for the quotes API: every screen talks to the backend through `api` (get / post / put / patch /
 * del / upload / download), plus the helpers `qs` (query strings), `pdfUrl` (signed PDF link) and the error
 * class `ApiError`.
 * API: all routes under the base URL (VITE_API_URL, default '/api/v1', see the route list in api/src/routes).
 * Responses are JSON; this file adds no react-query keys (callers such as lib/hooks.ts own those).
 * Auth: each request carries `Authorization: Bearer <Supabase access token>`. When AUTH_BYPASS is true
 * (lib/config.ts, build-time VITE_AUTH_BYPASS='true') no token is sent and a 401 does not sign the user out,
 * because the API must be running with AUTH_BYPASS=true as well and ignores tokens.
 * Errors: a non-2xx answer becomes an ApiError built from the API's { error: { code, message, fields? } }.
 * Used by lib/hooks.ts, auth/AuthProvider.tsx, pages/*, components/*.
 */

import { AUTH_BYPASS, SIMPLE_AUTH, TOKEN_KEY, AUTH_LOST_EVENT } from './config';
import { supabase } from './supabase';

// API base URL without a trailing slash; the same-origin '/api/v1' is used unless VITE_API_URL is set.
const BASE = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');

/**
 * The API's error envelope: { error: { code, message, fields? } }.
 * Thrown by every `api.*` call on a non-2xx answer.
 * Fields: `status` HTTP status (400, 401, 403, 404, 409 ...); `code` the API's machine code such as
 * 'validation_error', 'not_found' or 'no_profile' ('error' when the body had none); `message` readable
 * text (a generic "Request failed (status)" when the body had none); `fields` optional map of input name ->
 * message for validation errors (keys can be dotted, e.g. 'lines.0.quantity'), which forms show under the
 * matching inputs.
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

/**
 * Gets the bearer token for the current Supabase session.
 * @returns the access token, or null when AUTH_BYPASS is on or nobody is signed in (no header is sent then).
 * Side effects: none (Supabase refreshes the token itself when needed).
 */
async function token(): Promise<string | null> {
  if (AUTH_BYPASS) return null; // the API ignores tokens in bypass mode
  if (SIMPLE_AUTH) { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * The one place that calls fetch for JSON and form requests; `api.get` etc. are thin wrappers.
 * @param method — HTTP method.
 * @param path — path after the base URL, starting with '/', query string included (see qs()).
 * @param body — object sent as JSON, or a FormData when `isForm`; undefined sends no body.
 * @param isForm — true for multipart uploads: the body is sent as-is and no Content-Type is set, so the
 *   browser adds the multipart boundary itself.
 * @returns the parsed JSON body typed as T; undefined for 204 No Content; null when a 2xx answer is not JSON.
 * @throws ApiError for any non-2xx answer. On a 401 (and not in AUTH_BYPASS mode) the Supabase session is
 *   signed out first, so the app falls back to the login screen. Network failures throw fetch's TypeError.
 */
async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  // Token for this request (null in bypass mode or when signed out).
  const t = await token();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  // 204 No Content (e.g. deleting a draft) has no body to parse.
  if (res.status === 204) return undefined as T;
  // Parse only JSON answers; a body that is not valid JSON becomes null instead of throwing.
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    if (res.status === 401 && !AUTH_BYPASS) {
      // token rejected: drop the session so the app shows the login screen
      if (SIMPLE_AUTH) {
        try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
        window.dispatchEvent(new Event(AUTH_LOST_EVENT));
      } else await supabase.auth.signOut();
    }
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? `Request failed (${res.status})`, e?.fields);
  }
  return data as T;
}

/**
 * The typed API client. Every method returns a Promise of the parsed response and throws ApiError on failure
 * (see request()). `T` is the response type the caller expects; it is not checked at run time.
 */
export const api = {
  /** GET. @param path — e.g. `/buyers${qs({ q })}`. @returns the JSON body as T. */
  get: <T>(path: string) => request<T>('GET', path),
  /** POST with a JSON body. @param body — object to send; defaults to {} so body-less posts send JSON. */
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  /** PUT, replaces a resource (settings, a quote draft). @param body — the full object to send. */
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  /** PATCH, changes only the fields present in the body. @param body — the fields to change. */
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  /** DELETE. @returns nothing by default (204), or the JSON body as T when the route returns one. */
  del: <T = void>(path: string) => request<T>('DELETE', path),
  /**
   * multipart upload (Excel import, logo, product packaging image).
   * @param path — upload route, e.g. `/products/${id}/image`. @param file — sent as the form field `file`.
   * @param fields — optional extra text fields sent with the file (e.g. { name, kind } for marketing files).
   * @returns the JSON body as T (the saved record or an import report).
   */
  upload: <T>(path: string, file: File, fields: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('file', file);
    return request<T>('POST', path, fd, true);
  },
  /**
   * Authenticated file download (xlsx). A plain link cannot send the bearer token.
   * @param path — download route, e.g. '/quotes/export.xlsx'. @param filename — name offered to the user.
   * @throws ApiError when the server answers with an error (default message 'Download failed').
   * Side effects: fetches the file, then clicks a temporary link to the in-memory blob so the browser saves
   * it; the blob URL is released after 10 s. Unlike request(), a 401 here does not sign the user out.
   */
  async download(path: string, filename: string): Promise<void> {
    const t = await token();
    const res = await fetch(`${BASE}${path}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Download failed');
    }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

/**
 * Query-string builder that skips empty values.
 * @param params — name -> value. undefined, null and '' are left out; false and 0 are kept (sent as 'false' /
 *   '0'); values are URL-encoded.
 * @returns '?a=1&b=2', or '' when nothing is left, so it can be appended straight to a path.
 */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/**
 * Signed PDF link for a revision (valid 30 days).
 * Calls GET /quotes/:id/revisions/:rev/pdf?json=1 (json=1 asks for { url, expires_at }, not a redirect).
 * @param quoteId — quote uuid. @param rev — revision number (0 = original, 1 = R1, ...).
 * @returns { url, expires_at } where expires_at is an ISO timestamp.
 * @throws ApiError, e.g. 404 not_found or 409 pdf_not_ready (the PDF is not generated yet or failed).
 * Used by components/quote/shared.tsx, which caches the answer in react-query.
 */
export const pdfUrl = (quoteId: string, rev: number) =>
  api.get<{ url: string; expires_at: string }>(`/quotes/${quoteId}/revisions/${rev}/pdf?json=1`);
