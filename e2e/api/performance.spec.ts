/**
 * QA, API: speed and load smoke tests. Not a full load test: they catch the changes that make the app feel slow (a slow list, a slow
 * calculation, a heavy preview, a PDF that takes too long) and check that a burst of parallel requests is answered without errors.
 * Limits are generous so a normal run over the internet to a cloud database passes; scale them with E2E_SLOW_FACTOR (for example 2 on a
 * slow connection). The PDF timing issues a quotation, so it only runs with E2E_ISSUE=1 (see e2e/qa.ts).
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ALLOW_ISSUE, API, call, cleanUp, makeBuyer, makeProduct, tokenOf } from '../qa';

const FACTOR = Number(process.env.E2E_SLOW_FACTOR ?? 1);
test.describe.configure({ mode: 'serial' });

let token = '';
const toClean: { buyers: string[]; products: string[] } = { buyers: [], products: [] };
let buyer = '';
let product = '';

test.beforeAll(async ({ request }) => {
  token = await tokenOf('admin');
  const b = await makeBuyer(request, token);
  const p = await makeProduct(request, token, '5');
  buyer = b.id; product = p.id;
  toClean.buyers.push(b.id); toClean.products.push(p.id);
});
test.afterAll(async ({ request }) => { await cleanUp(request, token, toClean); });

/** Runs `fn` n times one after another and returns the sorted durations in ms. */
async function timings(n: number, fn: () => Promise<{ status(): number }>): Promise<number[]> {
  const ms: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const res = await fn();
    ms.push(performance.now() - t0);
    expect(res.status()).toBeLessThan(400);
  }
  return ms.sort((a, b) => a - b);
}
const p95 = (sorted: number[]) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
const calc = (request: APIRequestContext) => call(request, token, 'POST', '/quotes/calculate', { buyer_id: buyer, lines: [{ product_id: product, quantity: '10', rate: '2900' }] });

test.describe('response times (95th percentile of 20 calls)', () => {
  test('health check answers in under 500 ms', async ({ request }) => {
    expect(p95(await timings(20, () => request.get(`${API.replace('/api/v1', '')}/health`)))).toBeLessThan(500 * FACTOR);
  });

  test('the live total (POST /quotes/calculate) answers in under 1.5 s, so typing feels instant', async ({ request }) => {
    expect(p95(await timings(20, () => calc(request)))).toBeLessThan(1500 * FACTOR);
  });

  test('the buyer, product, inquiry and quote lists each answer in under 2.5 s', async ({ request }) => {
    for (const path of ['/buyers', '/products', '/inquiries', '/quotes?limit=50']) {
      expect(p95(await timings(10, () => call(request, token, 'GET', path))), path).toBeLessThan(2500 * FACTOR);
    }
  });

  test('settings, dollar rate and send channels (read on every screen) answer in under 1 s', async ({ request }) => {
    for (const path of ['/settings', '/fx-rate', '/send-channels', '/me']) expect(p95(await timings(10, () => call(request, token, 'GET', path))), path).toBeLessThan(1000 * FACTOR);
  });
});

test.describe('size of answers', () => {
  test('the lists stay small enough for a phone connection', async ({ request }) => {
    for (const [path, max] of [['/buyers', 2_000_000], ['/products', 1_000_000], ['/quotes?limit=50', 500_000]] as const) {
      const res = await call(request, token, 'GET', path);
      expect((await res.body()).length, path).toBeLessThan(max);
    }
  });

  test('the draft preview (page and e-mail) is small because the letterhead images are linked, not embedded', async ({ request }) => {
    const res = await call(request, token, 'POST', '/quotes', { buyer_id: buyer, payment_terms: 'Net 30 days', port_loading: 'Mundra', lines: [{ product_id: product, quantity: '1', rate: '10' }] });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.document.html.length).toBeLessThan(100_000);
    expect(body.document.html).not.toContain('data:image');
    expect(JSON.stringify(body).length).toBeLessThan(250_000);
  });
});

test.describe('a burst of parallel requests', () => {
  test('30 live totals at once are all answered correctly, with no error', async ({ request }) => {
    const t0 = performance.now();
    const results = await Promise.all(Array.from({ length: 30 }, () => calc(request)));
    const seconds = (performance.now() - t0) / 1000;
    for (const r of results) expect(r.status()).toBe(200);
    const totals = new Set(await Promise.all(results.map(async (r) => (await r.json()).grand_total)));
    expect([...totals]).toEqual(['29000.00']); // 10 MT x USD 2,900, export so no GST: every parallel answer must be the same
    expect(seconds).toBeLessThan(20 * FACTOR);
  });

  test('mixed reads from many people at once do not fail', async ({ request }) => {
    const paths = ['/buyers', '/products', '/quotes?limit=20', '/settings', '/fx-rate', '/me', '/inquiries'];
    const results = await Promise.all(Array.from({ length: 28 }, (_, i) => call(request, token, 'GET', paths[i % paths.length]!)));
    for (const r of results) expect(r.status()).toBe(200);
  });
});

test.describe('PDF speed', () => {
  test.skip(!ALLOW_ISSUE, 'Set E2E_ISSUE=1 to run this: it issues quotations and so uses up real quotation numbers.');

  test('a quotation is issued with its PDF in under 20 s, and remaking it takes under 10 s', async ({ request }) => {
    const created = await (await call(request, token, 'POST', '/quotes', { buyer_id: buyer, payment_terms: '100% advance', port_loading: 'Mundra', lines: [{ product_id: product, quantity: '10', rate: '2900' }] })).json();
    const t0 = performance.now();
    const issued = await call(request, token, 'POST', `/quotes/${created.id}/issue`);
    expect(issued.status()).toBe(200);
    expect(performance.now() - t0).toBeLessThan(20_000 * FACTOR);
    const t1 = performance.now();
    expect((await call(request, token, 'POST', `/quotes/${created.id}/revisions/0/render`)).status()).toBe(200);
    expect(performance.now() - t1).toBeLessThan(10_000 * FACTOR);
  });

  test('four PDFs made at the same time all succeed (the browser is shared and queued)', async ({ request }) => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const c = await (await call(request, token, 'POST', '/quotes', { buyer_id: buyer, payment_terms: '100% advance', port_loading: 'Mundra', lines: [{ product_id: product, quantity: '1', rate: '10' }] })).json();
      ids.push(c.id);
      expect((await call(request, token, 'POST', `/quotes/${c.id}/issue`)).status()).toBe(200);
    }
    const results = await Promise.all(ids.map((id) => call(request, token, 'POST', `/quotes/${id}/revisions/0/render`)));
    for (const r of results) expect(r.status()).toBe(200);
  });
});
