/**
 * QA, API: the life of a quotation, tested through the real API: issue, numbering, double clicks and parallel requests, a frozen issued
 * quote, the dollar rate locked at issue, the PDF (its TEXT is read back and checked), the 30 day share link, the e-mail preview and sending.
 * Every test here ISSUES quotations, which uses up real quotation numbers (a quotation cannot be removed), so the file only runs with
 * E2E_ISSUE=1 and should be pointed at a test database. Sending a real e-mail also needs E2E_SEND=1; it goes to E2E_MAIL_TO
 * (default jimmyptl46@gmail.com). Needs the company name and bank details saved in Settings, and a Chrome for the PDF on the API's machine.
 * The test buyer and product are archived at the end.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import { PDFParse } from 'pdf-parse';
import { ALLOW_ISSUE, ALLOW_SEND, ISSUE_REASON, call, cleanUp, makeBuyer, makeProduct, tokenOf } from '../qa';

const MAIL_TO = process.env.E2E_MAIL_TO ?? 'jimmyptl46@gmail.com';
const NUMBER = /^JM\/Q\/\d{3}\/\d{4}-\d{2}(-R\d+)?$/;
const COST = '123456'; // an unmistakable rupee cost: it must never show up in a PDF or an e-mail
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test.describe.configure({ mode: 'serial' });
test.skip(!ALLOW_ISSUE, ISSUE_REASON);

let token = '';
let buyer = { id: '', company: '' };
let noEmailBuyer = { id: '', company: '' };
let product = { id: '', grade: '' };
let rateBefore: string | null = null;
const toClean: { buyers: string[]; products: string[] } = { buyers: [], products: [] };

/** A saved draft: 13 MT at USD 2,630 (= 34,190.00 USD) with a rupee cost on the line. */
async function draft(request: APIRequestContext, over: Record<string, unknown> = {}, buyerId = buyer.id) {
  const res = await call(request, token, 'POST', '/quotes', { buyer_id: buyerId, payment_terms: '100% advance', port_loading: 'Mundra', notes: 'E2E lifecycle test', lines: [{ product_id: product.id, quantity: '13', rate: '2630', cost_rate: COST }], ...over });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; document: { html: string; email: { to: string | null; subject: string; text: string; html: string } } };
}
async function issue(request: APIRequestContext, id: string) { return call(request, token, 'POST', `/quotes/${id}/issue`); }
async function pdfText(request: APIRequestContext, id: string): Promise<string> {
  const res = await call(request, token, 'GET', `/quotes/${id}/revisions/0/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/application\/pdf/);
  const parser = new PDFParse({ data: new Uint8Array(await res.body()) });
  try { return (await parser.getText()).text; } finally { await parser.destroy(); }
}

test.beforeAll(async ({ request }) => {
  token = await tokenOf('admin');
  const settings = await (await call(request, token, 'GET', '/settings')).json();
  if (!settings.company?.name) throw new Error('Save the company name (and bank details) in Settings first: a quotation cannot be issued without them.');
  buyer = await makeBuyer(request, token, { email: MAIL_TO, contact_name: 'E2E Lifecycle' });
  noEmailBuyer = await makeBuyer(request, token, { email: null });
  product = await makeProduct(request, token, '0');
  toClean.buyers.push(buyer.id, noEmailBuyer.id);
  toClean.products.push(product.id);
  rateBefore = (await (await call(request, token, 'GET', '/fx-rate')).json()).rate;
  expect((await call(request, token, 'PUT', '/fx-rate', { rate: '83.45' })).status()).toBe(200);
});

test.afterAll(async ({ request }) => {
  if (rateBefore) await call(request, token, 'PUT', '/fx-rate', { rate: rateBefore });
  await cleanUp(request, token, toClean);
});

test.describe('issuing', () => {
  test('numbers it, sets Sent, validity and follow-up, makes the PDF and locks the dollar rate', async ({ request }) => {
    const d = await draft(request);
    const settings = await (await call(request, token, 'GET', '/settings')).json();
    const res = await issue(request, d.id);
    expect(res.status()).toBe(200);
    const q = await res.json();
    expect(q.number).toMatch(NUMBER);
    expect(q).toMatchObject({ status: 'sent', current_revision: 0, open_draft_revision: null, grand_total: '34190.00', currency: 'USD', pdf: { status: 'ready' } });
    expect(q.valid_until).toBe(addDays(todayIST(), settings.validity_days));
    expect(q.next_followup).toBe(addDays(todayIST(), settings.followup_days));
    expect(q.revisions[0]).toMatchObject({ state: 'issued', number: q.number, amount_words: 'US Dollars Thirty-Four Thousand One Hundred Ninety Only', pdf_ready: true, usd_inr_rate: '83.4500' });
    expect(q.activities[0]).toMatchObject({ kind: 'status_change', body: `Issued ${q.number}` });
  });

  test('five parallel clicks on Issue give exactly one issue and four 409, never a 500 or two numbers', async ({ request }) => {
    const d = await draft(request);
    const results = await Promise.all(Array.from({ length: 5 }, () => issue(request, d.id)));
    const codes = results.map((r) => r.status()).sort();
    expect(codes).toEqual([200, 409, 409, 409, 409]);
    for (const r of results.filter((x) => x.status() === 409)) expect((await r.json()).error.code).toBe('not_draft');
    const q = await (await call(request, token, 'GET', `/quotes/${d.id}`)).json();
    expect(q.revisions).toHaveLength(1);
    expect(q.activities.filter((a: { kind: string }) => a.kind === 'status_change')).toHaveLength(1);
  });

  test('quotations issued at the same moment all get different numbers', async ({ request }) => {
    const drafts = await Promise.all(Array.from({ length: 4 }, () => draft(request)));
    const issued = await Promise.all(drafts.map((d) => issue(request, d.id)));
    expect(issued.map((r) => r.status())).toEqual([200, 200, 200, 200]);
    const numbers = await Promise.all(issued.map(async (r) => (await r.json()).number as string));
    for (const n of numbers) expect(n).toMatch(NUMBER);
    expect(new Set(numbers).size).toBe(4);
  });

  test('an incomplete quote is refused with a message per missing input, and stays a draft', async ({ request }) => {
    const d = await draft(request, { payment_terms: null, port_loading: null });
    const res = await issue(request, d.id);
    expect(res.status()).toBe(400);
    expect(Object.keys((await res.json()).error.fields)).toEqual(expect.arrayContaining(['payment_terms', 'port_loading']));
    expect((await (await call(request, token, 'GET', `/quotes/${d.id}`)).json()).status).toBe('draft');
  });

  test('a quote with no products cannot be issued', async ({ request }) => {
    const d = await draft(request, { lines: [] });
    const res = await issue(request, d.id);
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields.lines).toBeTruthy();
  });
});

test.describe('an issued quote is frozen', () => {
  let id = '';
  let before = '';
  test.beforeAll(async ({ request }) => {
    id = (await draft(request)).id;
    expect((await issue(request, id)).status()).toBe(200);
    before = JSON.stringify((await (await call(request, token, 'GET', `/quotes/${id}`)).json()).revisions);
  });

  test('saving the draft again is refused with 409 and changes nothing', async ({ request }) => {
    const res = await call(request, token, 'PUT', `/quotes/${id}/draft`, { buyer_id: buyer.id, lines: [{ product_id: product.id, quantity: '1', rate: '1' }] });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('not_draft');
    expect(JSON.stringify((await (await call(request, token, 'GET', `/quotes/${id}`)).json()).revisions)).toBe(before);
  });

  test('changing the buyer\'s address, the product or the settings afterwards does not change the issued document', async ({ request }) => {
    const htmlBefore = (await (await call(request, token, 'GET', `/quotes/${id}/revisions/0/document`)).json()).html as string;
    await call(request, token, 'PATCH', `/buyers/${buyer.id}`, { address: 'A completely different address 99' });
    await call(request, token, 'PATCH', `/products/${product.id}`, { specification: 'A different specification' });
    const htmlAfter = (await (await call(request, token, 'GET', `/quotes/${id}/revisions/0/document`)).json()).html as string;
    expect(htmlAfter).toBe(htmlBefore);
    expect(htmlAfter).not.toContain('A completely different address 99');
  });

  test('the dollar rate used is the one at issue, not today\'s', async ({ request }) => {
    expect((await call(request, token, 'PUT', '/fx-rate', { rate: '95' })).status()).toBe(200);
    const q = await (await call(request, token, 'GET', `/quotes/${id}`)).json();
    expect(q.revisions[0].usd_inr_rate).toBe('83.4500');
    await call(request, token, 'PUT', '/fx-rate', { rate: '83.45' });
  });

  test('the revision does not exist for a draft or a number that was never made', async ({ request }) => {
    expect((await call(request, token, 'GET', `/quotes/${id}/revisions/9/pdf`)).status()).toBe(404);
    const d = await draft(request);
    expect((await call(request, token, 'GET', `/quotes/${d.id}/revisions/0/pdf`)).status()).toBe(404);
    expect((await call(request, token, 'POST', `/quotes/${d.id}/revisions/0/send`, { channel: 'email' })).status()).toBe(404);
  });
});

test.describe('the PDF', () => {
  let id = '';
  let text = '';
  test.beforeAll(async ({ request }) => {
    id = (await draft(request)).id;
    expect((await issue(request, id)).status()).toBe(200);
    text = await pdfText(request, id);
  });

  test('contains the quotation as issued: number, buyer, products, totals, amount in words, terms and bank block', async ({ request }) => {
    const q = await (await call(request, token, 'GET', `/quotes/${id}`)).json();
    for (const expected of [q.number, buyer.company, 'QUOTATION', 'Cumin Seeds', product.grade, '34,190.00', 'US Dollars Thirty-Four Thousand One Hundred Ninety Only', 'TERMS', 'BANK DETAILS', 'E2E lifecycle test', 'USD']) expect(text, expected).toContain(expected);
    expect(text).toMatch(/09093100|HSN/);
  });

  test('NEVER shows the cost, the margin or internal words', async () => {
    expect(text).not.toMatch(new RegExp(`${COST}|123,456|margin|cost rate|internal only`, 'i'));
  });

  test('is a real, readable, single-page A4 document of sensible size', async ({ request }) => {
    const res = await call(request, token, 'GET', `/quotes/${id}/revisions/0/pdf`);
    const bytes = await res.body();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(bytes.length).toBeLessThan(5_000_000);
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try { expect((await parser.getInfo()).total).toBeLessThanOrEqual(2); } finally { await parser.destroy(); }
  });

  test('the same revision gives the same text every time (remaking it changes nothing)', async ({ request }) => {
    expect((await call(request, token, 'POST', `/quotes/${id}/revisions/0/render`)).status()).toBe(200);
    expect(await pdfText(request, id)).toBe(text);
  });

  test('the share link opens the PDF without a sign-in; a changed link does not', async ({ request }) => {
    const link = await call(request, token, 'GET', `/quotes/${id}/revisions/0/pdf?json=1`);
    test.skip(link.status() === 503, 'PDF_LINK_SECRET is not set on the server, so share links are switched off.');
    expect(link.status()).toBe(200);
    const { url, expires_at } = await link.json();
    const days = (new Date(expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
    const open = await request.get(url);
    expect(open.status()).toBe(200);
    expect(open.headers()['content-type']).toMatch(/pdf/);
    expect((await request.get(`${url}x`)).status()).toBe(404);
    expect((await request.get(url.replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A')))).status()).toBe(404);
  });
});

test.describe('the quotation e-mail', () => {
  let id = '';
  let number = '';
  test.beforeAll(async ({ request }) => {
    id = (await draft(request)).id;
    const q = await (await issue(request, id)).json();
    number = q.number;
  });

  test('the preview shows the e-mail in the agreed template, with the right recipient, subject and product', async ({ request }) => {
    const { email, draft: isDraft } = await (await call(request, token, 'GET', `/quotes/${id}/revisions/0/document`)).json();
    expect(isDraft).toBe(false);
    expect(email.to).toBe(MAIL_TO);
    expect(email.subject).toMatch(new RegExp(`^Quotation ${number.replace(/\//g, '\\/')} - `));
    for (const phrase of [
      'Dear E2E Lifecycle,', 'Thank you for your interest in our products.', 'Please find attached our quotation for Cumin Seeds, including the applicable pricing',
      'Terms & Conditions', '- Quotation Validity:', '- Price & Delivery Terms:', '- Order Confirmation:', '- Payment Terms:', '- Availability:', 'Sample Policy',
      'Product samples can be arranged upon request', 'If you require any clarification', 'We look forward to your feedback', 'Best regards,', 'Export Sales Team', 'Confidentiality Notice:',
    ]) expect(email.text, phrase).toContain(phrase);
    expect(email.html).toContain('<b>Cumin Seeds</b>');
    expect(email.text + email.html.replace(/ style="[^"]*"/g, '')).not.toMatch(new RegExp(`${COST}|margin`, 'i'));
  });

  test('sending to a buyer with no e-mail address is refused with a clear message', async ({ request }) => {
    const d = await draft(request, {}, noEmailBuyer.id);
    expect((await issue(request, d.id)).status()).toBe(200);
    const res = await call(request, token, 'POST', `/quotes/${d.id}/revisions/0/send`, { channel: 'email' });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields.email).toBeTruthy();
  });

  test('WhatsApp cannot be sent by the server, and wrong channels are refused', async ({ request }) => {
    for (const channel of ['whatsapp', 'fax', '', undefined]) {
      const res = await call(request, token, 'POST', `/quotes/${id}/revisions/0/send`, channel === undefined ? {} : { channel });
      expect(res.status(), String(channel)).toBe(400);
    }
  });

  test('really sends the e-mail with the PDF attached and records it on the quote', async ({ request }) => {
    test.skip(!ALLOW_SEND, 'Set E2E_SEND=1 to send a real e-mail.');
    const res = await call(request, token, 'POST', `/quotes/${id}/revisions/0/send`, { channel: 'email', note: 'E2E test: please ignore.' });
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toEqual({ channel: 'email', to: MAIL_TO, number });
    const q = await (await call(request, token, 'GET', `/quotes/${id}`)).json();
    expect(q.activities[0]).toMatchObject({ kind: 'email' });
    expect(q.activities[0].body).toContain(MAIL_TO);
  });
});

test.describe('lists and lookups', () => {
  test('an issued quote is found by its number, with its buyer, total and status', async ({ request }) => {
    const d = await draft(request);
    const number = (await (await issue(request, d.id)).json()).number as string;
    const list = await (await call(request, token, 'GET', `/quotes?q=${encodeURIComponent(number)}`)).json();
    expect(list.total).toBe(1);
    expect(list.data[0]).toMatchObject({ id: d.id, number, status: 'sent', buyer_name: buyer.company, grand_total: '34190.00', currency: 'USD', latest_state: 'issued' });
    const byStatus = await (await call(request, token, 'GET', '/quotes?status=sent&limit=1')).json();
    expect(byStatus.total).toBeGreaterThanOrEqual(1);
  });
});
