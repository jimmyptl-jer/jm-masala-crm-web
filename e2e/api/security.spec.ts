/**
 * QA, API: security and robustness. What an attacker, a broken client or a curious user can send, and what the API must never do:
 * crash (any 5xx), leak internals, accept more than it should, let another website read it, or run what was typed as code or a query.
 * The tests that need no sign-in always run; the others need the administrator test account (E2E_EMAIL / E2E_PASSWORD).
 * KNOWN DEFECT (found by writing these): a request body over 1 MB is answered 500 instead of 413; the test for it fails until that is fixed.
 */
import { expect, test } from '@playwright/test';
import { API, call, cleanUp, ghostId, makeBuyer, makeProduct, testName, tokenOf } from '../qa';

const BASE_ORIGIN = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:5173').origin;
const ROOT = API.replace('/api/v1', '');

test.describe('without a sign-in', () => {
  test('another website cannot read the API (CORS): only the app\'s own address is allowed', async ({ request }) => {
    const ok = await request.fetch(`${API}/buyers`, { method: 'OPTIONS', headers: { Origin: BASE_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
    expect(ok.headers()['access-control-allow-origin']).toBe(BASE_ORIGIN);
    for (const evil of ['https://evil.example', 'http://localhost:9999', 'null', `${BASE_ORIGIN}.evil.example`]) {
      const res = await request.fetch(`${API}/buyers`, { method: 'OPTIONS', headers: { Origin: evil, 'Access-Control-Request-Method': 'GET' } });
      expect(res.headers()['access-control-allow-origin'], evil).toBeUndefined();
    }
  });

  test('every answer carries the security headers and does not announce the server software', async ({ request }) => {
    for (const url of [`${ROOT}/health`, `${API}/me`, `${API}/no-such-route`]) {
      const h = (await request.get(url)).headers();
      expect(h['x-content-type-options'], url).toBe('nosniff');
      expect(h['strict-transport-security'], url).toBeTruthy();
      expect(h['x-frame-options'], url).toBeTruthy();
      expect(h['x-powered-by'], url).toBeUndefined();
    }
  });

  test('malformed JSON is a clear 400, never a 500, and nothing about the server leaks', async ({ request }) => {
    for (const body of ['{bad', '{"a":', '[1,2', 'undefined', '\u0000']) {
      const res = await request.post(`${API}/buyers`, { headers: { 'Content-Type': 'application/json' }, data: body, failOnStatusCode: false });
      expect(res.status(), body).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_json');
      expect(await res.text()).not.toMatch(/SyntaxError|\bat \w+|node_modules|\.ts:\d+/);
    }
  });

  test('a body over 1 MB is refused with 413 Payload Too Large (not a 500)', async ({ request }) => {
    const res = await request.post(`${API}/buyers`, { headers: { 'Content-Type': 'application/json' }, data: JSON.stringify({ notes: 'x'.repeat(1_300_000) }), failOnStatusCode: false });
    expect(res.status()).toBe(413);
  });

  test('odd content types and empty bodies never crash the server', async ({ request }) => {
    for (const [type, data] of [['text/plain', 'hello'], ['application/x-www-form-urlencoded', 'a=1&b=2'], ['application/xml', '<a/>'], ['application/json', '']] as const) {
      const res = await request.post(`${API}/quotes/calculate`, { headers: { 'Content-Type': type }, data, failOnStatusCode: false });
      expect(res.status(), type).toBeLessThan(500);
    }
  });

  test('a tampered, unsigned or truncated sign-in token is refused', async ({ request }) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const fakes = [
      `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'x', role: 'authenticated', aud: 'authenticated', exp: 9_999_999_999 })}.`,
      `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'x', role: 'authenticated', aud: 'authenticated', exp: 9_999_999_999 })}.AAAA`,
      'eyJhbGciOiJFUzI1NiJ9', '..', 'Bearer', ' ',
    ];
    for (const t of fakes) expect((await call(request, t, 'GET', '/me')).status(), t.slice(0, 30)).toBe(401);
  });

  test('Authorization headers in the wrong form are refused', async ({ request }) => {
    for (const value of ['Basic YWRtaW46YWRtaW4=', 'Bearer', 'bearer abc', 'Token abc', '']) {
      const res = await request.get(`${API}/me`, { headers: { Authorization: value }, failOnStatusCode: false });
      expect(res.status(), value).toBe(401);
    }
  });
});

test.describe('signed in as the administrator', () => {
  let token = '';
  const toClean: { buyers: string[]; products: string[] } = { buyers: [], products: [] };
  test.beforeAll(async () => { token = await tokenOf('admin'); });
  test.afterAll(async ({ request }) => { await cleanUp(request, token, toClean); });

  test('query strings with database operators are ignored or refused, never run (no 5xx, no extra rows)', async ({ request }) => {
    const plain = await (await call(request, token, 'GET', '/buyers')).json();
    for (const q of ['q[$ne]=x', 'q[$regex]=.*', 'stage[$ne]=won', 'type[$gt]=', 'archived[$ne]=true', 'limit[$gt]=0', '__proto__[x]=1', 'q=%00', 'q=%7B%22%24ne%22%3A1%7D']) {
      const res = await call(request, token, 'GET', `/buyers?${q}`);
      expect(res.status(), q).toBeLessThan(500);
      if (res.status() === 200) expect((await res.json()).data.length, q).toBeLessThanOrEqual(plain.data.length);
    }
    for (const q of ['q[$ne]=x', 'status[$ne]=draft', 'limit=-5', 'limit=abc', 'offset=-1']) expect((await call(request, token, 'GET', `/quotes?${q}`)).status(), q).toBeLessThan(500);
  });

  test('operators and objects in a request body are refused (400), not stored or executed', async ({ request }) => {
    for (const body of [{ company_name: { $ne: null } }, { company_name: ['a'], type: 'export' }, { company_name: 'x', type: { $gt: '' } }, { company_name: 'x', email: { $regex: '.*' }, type: 'export' }]) {
      const res = await call(request, token, 'POST', '/buyers', body);
      expect(res.status(), JSON.stringify(body)).toBe(400);
    }
  });

  test('a prototype-pollution attempt changes nothing', async ({ request }) => {
    const buyer = await makeBuyer(request, token);
    toClean.buyers.push(buyer.id);
    const res = await call(request, token, 'PATCH', `/buyers/${buyer.id}`, JSON.parse('{"__proto__":{"role":"admin","isAdmin":true},"constructor":{"prototype":{"x":1}},"notes":"polluted?"}'));
    expect(res.status()).toBeLessThan(500);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect((await call(request, token, 'GET', '/me')).status()).toBe(200);
  });

  test('fields a client must not set are ignored: buyer code, ids, dates, archive state on create', async ({ request }) => {
    const created = await call(request, token, 'POST', '/buyers', { type: 'export', company_name: testName('Mass'), country: 'UAE', buyer_code: 'BUY-HACK', id: ghostId(), _id: ghostId(), created_at: '2000-01-01', archived: true, opted_out_at: '2000-01-01' });
    expect(created.status()).toBe(201);
    const body = await created.json();
    toClean.buyers.push(body.id);
    expect(body.buyer_code).toMatch(/^BUY-\d{4}$/);
    expect(body.buyer_code).not.toBe('BUY-HACK');
    expect(body.archived).toBe(false);
    expect(body.opted_out_at).toBeNull();
    const patched = await (await call(request, token, 'PATCH', `/buyers/${body.id}`, { buyer_code: 'BUY-HACK', id: ghostId(), notes: 'ok' })).json();
    expect(patched.buyer_code).toBe(body.buyer_code);
    expect(patched.id).toBe(body.id);
  });

  test('a user cannot make a product or quote field they should not: category, status rules and cost on the wrong place', async ({ request }) => {
    const product = await makeProduct(request, token, '5');
    toClean.products.push(product.id);
    const res = await call(request, token, 'PATCH', `/products/${product.id}`, { category: 'Hacked', status: 'active', gst_rate: null });
    expect(res.status()).toBeLessThan(500);
    const stored = await (await call(request, token, 'GET', `/products/${product.id}`)).json();
    expect(stored.category).toBe('Whole Spices');
    expect(stored.gst_rate).not.toBeNull();
  });

  test('ids that are not real ids give a 404, never a 500', async ({ request }) => {
    for (const id of ['%00', '..%2f..%2fetc', 'a'.repeat(5000), "'; DROP TABLE buyers;--", '%7B%24ne%3Anull%7D', '123', '0'.repeat(24), 'g'.repeat(24)]) {
      for (const path of [`/buyers/${id}`, `/inquiries/${id}`, `/products/${id}`, `/quotes/${id}`, `/quotes/${id}/revisions/0/pdf`]) {
        const res = await call(request, token, 'GET', path);
        expect(res.status(), path.slice(0, 60)).toBe(404);
      }
    }
  });

  test('very long text and absurd numbers are refused with a message, not stored and not a crash', async ({ request }) => {
    const long = await call(request, token, 'POST', '/buyers', { type: 'export', company_name: 'x'.repeat(10_000), country: 'UAE' });
    expect(long.status()).toBe(400);
    expect(Object.keys((await long.json()).error.fields)).toContain('company_name');
    const product = await makeProduct(request, token, '0');
    toClean.products.push(product.id);
    for (const quantity of ['1e12', '999999999999999999999', '1.7976931348623157e308', 'Infinity', 'NaN', '0x10']) {
      const res = await call(request, token, 'POST', '/quotes/calculate', { type: 'export', lines: [{ product_id: product.id, quantity, rate: '10' }] });
      expect(res.status(), quantity).toBe(400);
    }
  });

  test('text typed by a user is shown as text, never as code, in the quotation page and the e-mail', async ({ request }) => {
    const script = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const buyer = await makeBuyer(request, token, { company_name: `${testName('XSS')} ${script}`, contact_name: script, address: script });
    const product = await makeProduct(request, token, '0');
    toClean.buyers.push(buyer.id);
    toClean.products.push(product.id);
    const created = await call(request, token, 'POST', '/quotes', { buyer_id: buyer.id, notes: script, payment_terms: script, lines: [{ product_id: product.id, quantity: '1', rate: '10', packing: script }] });
    expect(created.status()).toBe(201);
    const { document } = await created.json();
    for (const text of [document.html, document.email.html]) {
      expect(text).not.toContain('<script>alert');
      expect(text).not.toContain('<img src=x');
      expect(text).toContain('&lt;script&gt;');
    }
  });

  test('unicode, emoji and right-to-left text are stored and returned unchanged', async ({ request }) => {
    const name = `${testName('Unicode')} ઉંઝા मसाला 🌶️ مرحبا`;
    const buyer = await makeBuyer(request, token, { company_name: name, city: 'ઊંઝા' });
    toClean.buyers.push(buyer.id);
    const stored = await (await call(request, token, 'GET', `/buyers/${buyer.id}`)).json();
    expect(stored.company_name).toBe(name);
    expect(stored.city).toBe('ઊંઝા');
  });

  test('no answer ever contains a password, a secret or a connection string', async ({ request }) => {
    const answers: string[] = [];
    for (const path of ['/me', '/users', '/settings', '/buyers', '/products', '/quotes', '/send-channels', '/fx-rate']) answers.push(await (await call(request, token, 'GET', path)).text());
    const all = answers.join('\n');
    expect(all).not.toMatch(/mongodb(\+srv)?:\/\/|SMTP_PASS|PDF_LINK_SECRET|app password|service_role|sb_secret|-----BEGIN/i);
  });
});
