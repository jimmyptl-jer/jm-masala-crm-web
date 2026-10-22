/**
 * Client for the quotes API: every screen talks to the backend through `api` (get / post / put / patch /
 * del / upload / download), plus the helpers `qs` (query strings), `pdfUrl` (signed PDF link) and the error
 * class `ApiError`.
 * The real API is paused (see docs/ARCHITECTURE.md): `request` answers from the in-memory sample data in
 * lib/mock instead of calling the network. To bring the API back, replace `request` with a fetch call to the API (the old version is on the git branch backup/api-full).
 * Errors: a failed call throws an ApiError built from { error: { code, message, fields? } }.
 * Used by lib/hooks.ts, auth/AuthProvider.tsx, pages/*, components/*.
 */

import { mockRequest } from './mock';

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
 * The one place every JSON and form request goes through; `api.get` etc. are thin wrappers.
 * @param method — HTTP method. @param path — path starting with '/', query string included (see qs()).
 * @param body — object, or a FormData for uploads (the mock does not read files).
 * @returns the answer typed as T. @throws ApiError, e.g. 501 'needs_api' for anything the mock does not cover.
 */
async function request<T>(method: string, path: string, body?: unknown, _isForm = false): Promise<T> {
  return mockRequest<T>(method, path, body instanceof FormData ? undefined : body);
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
  async download(path: string, _filename: string): Promise<void> {
    throw new ApiError(501, 'needs_api', `Downloads are not available yet: ${path.split('?')[0]} needs the API, which is paused.`);
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
