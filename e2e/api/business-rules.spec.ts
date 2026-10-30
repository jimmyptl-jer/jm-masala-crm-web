/**
 * QA, API: the business rules of buyers, inquiries and products, each tried with good and bad input: unique names, codes that are never
 * reused or changed, archive instead of delete, GST number and state code, "lost needs a reason", quantity rules, who can be quoted.
 * Every record these tests make has a name starting "E2E" and is archived again at the end. (The "last administrator cannot be removed"
 * rule is covered by the API unit tests, not here: trying it against a real system could remove a real administrator.)
 */
import { expect, test } from '@playwright/test';
import { call, cleanUp, makeBuyer, makeProduct, testName, tokenOf } from '../qa';

test.describe.configure({ mode: 'serial' });
let token = '';
const toClean: { buyers: string[]; products: string[] } = { buyers: [], products: [] };
test.beforeAll(async () => { token = await tokenOf('admin'); });
test.afterAll(async ({ request }) => { await cleanUp(request, token, toClean); });

const newBuyer = async (request: Parameters<typeof call>[0], over: Record<string, unknown> = {}) => { const b = await makeBuyer(request, token, over); toClean.buyers.push(b.id); return b; };
const post = (request: Parameters<typeof call>[0], path: string, body: unknown) => call(request, token, 'POST', path, body);

test.describe('buyers', () => {
  test('a company name is unique, whatever the letter case, and the message names the field', async ({ request }) => {
    const first = await newBuyer(request);
    for (const name of [first.company, first.company.toUpperCase(), first.company.toLowerCase()]) {
      const res = await post(request, '/buyers', { type: 'export', company_name: name, country: 'UAE' });
      expect(res.status(), name).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('duplicate_buyer');
      expect(body.error.fields.company_name).toBeTruthy();
    }
  });

  test('an archived buyer frees its name for a new buyer, and the old one can be restored only if the name is free', async ({ request }) => {
    const first = await newBuyer(request);
    expect((await call(request, token, 'DELETE', `/buyers/${first.id}`)).status()).toBe(200);
    const again = await post(request, '/buyers', { type: 'export', company_name: first.company, country: 'UAE' });
    expect(again.status()).toBe(201);
    toClean.buyers.push((await again.json()).id);
    const restore = await call(request, token, 'PATCH', `/buyers/${first.id}`, { archived: false });
    expect(restore.status()).toBe(409);
  });

  test('buyer codes are BUY-0001 style, always new, and cannot be changed', async ({ request }) => {
    const a = await (await post(request, '/buyers', { type: 'export', company_name: testName('Code A'), country: 'UAE' })).json();
    const b = await (await post(request, '/buyers', { type: 'export', company_name: testName('Code B'), country: 'UAE' })).json();
    toClean.buyers.push(a.id, b.id);
    for (const code of [a.buyer_code, b.buyer_code]) expect(code).toMatch(/^BUY-\d{4,}$/);
    expect(Number(b.buyer_code.slice(4))).toBeGreaterThan(Number(a.buyer_code.slice(4)));
    const patched = await (await call(request, token, 'PATCH', `/buyers/${a.id}`, { buyer_code: 'BUY-9999', city: 'Sharjah' })).json(); // a real field is sent too: a body with only unknown fields is refused ("send at least one field")
    expect(patched.buyer_code).toBe(a.buyer_code);
    await call(request, token, 'DELETE', `/buyers/${b.id}`);
    const c = await (await post(request, '/buyers', { type: 'export', company_name: testName('Code C'), country: 'UAE' })).json();
    toClean.buyers.push(c.id);
    expect(c.buyer_code).not.toBe(b.buyer_code); // the number of an archived buyer is never reused
  });

  test('required and malformed fields are refused with one message per field', async ({ request }) => {
    const res = await post(request, '/buyers', { type: 'sideways', company_name: '', email: 'not-an-email', phone: 'x'.repeat(200) });
    expect(res.status()).toBe(400);
    const fields = (await res.json()).error.fields;
    for (const key of ['type', 'company_name', 'email', 'phone']) expect(fields[key], key).toBeTruthy();
  });

  test('the GST number must start with the state code; a domestic GST number needs the state code', async ({ request }) => {
    const mismatch = await post(request, '/buyers', { type: 'domestic', company_name: testName('GST mismatch'), state: 'Gujarat', state_code: '24', gstin: '27AAAAA0000A1Z5' });
    expect(mismatch.status()).toBe(400);
    expect((await mismatch.json()).error.fields.gstin).toMatch(/state code/i);
    const missing = await post(request, '/buyers', { type: 'domestic', company_name: testName('GST no state'), gstin: '24AAAAA0000A1Z5' });
    expect(missing.status()).toBe(400);
    expect((await missing.json()).error.fields.state_code).toBeTruthy();
    const good = await post(request, '/buyers', { type: 'domestic', company_name: testName('GST ok'), state: 'Gujarat', state_code: '24', gstin: '24AAAAA0000A1Z5' });
    expect(good.status()).toBe(201);
    toClean.buyers.push((await good.json()).id);
  });

  test('a lost buyer must say why', async ({ request }) => {
    const res = await post(request, '/buyers', { type: 'export', company_name: testName('Lost'), country: 'UAE', stage: 'lost' });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields.lost_reason).toBeTruthy();
    const ok = await post(request, '/buyers', { type: 'export', company_name: testName('Lost ok'), country: 'UAE', stage: 'lost', lost_reason: 'price' });
    expect(ok.status()).toBe(201);
    toClean.buyers.push((await ok.json()).id);
  });

  test('a domestic buyer is always in rupees with no Incoterm', async ({ request }) => {
    const b = await (await post(request, '/buyers', { type: 'domestic', company_name: testName('Domestic'), state: 'Gujarat', state_code: '24', default_currency: 'USD', default_incoterm: 'CIF' })).json();
    toClean.buyers.push(b.id);
    expect(b.default_currency).toBe('INR');
    expect(b.default_incoterm).toBeNull();
  });

  test('archiving hides a buyer from the default list, and "archived=all" shows it; nothing is ever deleted', async ({ request }) => {
    const b = await newBuyer(request);
    expect((await call(request, token, 'DELETE', `/buyers/${b.id}`)).status()).toBe(200);
    const visible = (await (await call(request, token, 'GET', '/buyers')).json()).data.map((x: { id: string }) => x.id);
    expect(visible).not.toContain(b.id);
    const all = (await (await call(request, token, 'GET', '/buyers?archived=all')).json()).data.map((x: { id: string }) => x.id);
    expect(all).toContain(b.id);
    expect((await call(request, token, 'GET', `/buyers/${b.id}`)).status()).toBe(200);
  });

  test('an archived buyer cannot be given a new quotation', async ({ request }) => {
    const b = await newBuyer(request);
    const p = await makeProduct(request, token, '0');
    toClean.products.push(p.id);
    await call(request, token, 'DELETE', `/buyers/${b.id}`);
    const res = await post(request, '/quotes/calculate', { buyer_id: b.id, lines: [{ product_id: p.id, quantity: '1', rate: '10' }] });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields.buyer_id).toMatch(/archived/i);
  });

  test('searching finds a buyer by company, contact, city or country, ignoring letter case', async ({ request }) => {
    const b = await newBuyer(request, { contact_name: 'Zainab Qureshi', city: 'Zanzibar City' });
    for (const q of [b.company.slice(4, 12).toLowerCase(), 'zainab qure', 'ZANZIBAR']) {
      const found = (await (await call(request, token, 'GET', `/buyers?q=${encodeURIComponent(q)}`)).json()).data.map((x: { id: string }) => x.id);
      expect(found, q).toContain(b.id);
    }
  });
});

test.describe('inquiries', () => {
  const line = (over: Record<string, unknown> = {}) => ({ product_name: 'Cumin Seeds', quantity: '10', unit: 'MT', ...over });

  test('an inquiry needs a buyer and at least one product, and gets an INQ code', async ({ request }) => {
    const b = await newBuyer(request);
    const none = await post(request, '/inquiries', { buyer_id: b.id, products: [] });
    expect(none.status()).toBe(400);
    expect((await none.json()).error.fields.products).toBeTruthy();
    const noBuyer = await post(request, '/inquiries', { products: [line()] });
    expect(noBuyer.status()).toBe(400);
    expect((await noBuyer.json()).error.fields.buyer_id).toBeTruthy();
    const ok = await post(request, '/inquiries', { buyer_id: b.id, products: [line(), line({ product_name: 'Fennel Seeds', quantity: '2.5', unit: 'KG' })] });
    expect(ok.status()).toBe(201);
    const body = await ok.json();
    expect(body.inquiry_code).toMatch(/^INQ-\d{4,}$/);
    expect(body.products).toHaveLength(2);
    expect(body.status).toBe('new');
    await call(request, token, 'DELETE', `/inquiries/${body.id}`);
  });

  test('quantities must be above zero with at most three decimals; only catalogue products and the three units are accepted', async ({ request }) => {
    const b = await newBuyer(request);
    const bad: [string, Record<string, unknown>][] = [
      ['quantity', line({ quantity: '0' })], ['quantity', line({ quantity: '-1' })], ['quantity', line({ quantity: '1.2345' })], ['quantity', line({ quantity: 'ten' })],
      ['product_name', line({ product_name: 'Black Pepper' })], ['unit', line({ unit: 'TON' })],
    ];
    for (const [field, l] of bad) {
      const res = await post(request, '/inquiries', { buyer_id: b.id, products: [l] });
      expect(res.status(), JSON.stringify(l)).toBe(400);
      expect(Object.keys((await res.json()).error.fields).join(), JSON.stringify(l)).toContain(field);
    }
  });

  test('an unknown or archived buyer is refused, and an inquiry can be archived but not deleted', async ({ request }) => {
    const ghost = await post(request, '/inquiries', { buyer_id: '0'.repeat(24), products: [line()] });
    expect(ghost.status()).toBe(400);
    const b = await newBuyer(request);
    const i = await (await post(request, '/inquiries', { buyer_id: b.id, products: [line()] })).json();
    expect((await call(request, token, 'DELETE', `/inquiries/${i.id}`)).status()).toBe(200);
    expect((await call(request, token, 'GET', `/inquiries/${i.id}`)).status()).toBe(200);
    expect((await (await call(request, token, 'GET', '/inquiries')).json()).data.map((x: { id: string }) => x.id)).not.toContain(i.id);
    await call(request, token, 'DELETE', `/buyers/${b.id}`);
    const toArchived = await post(request, '/inquiries', { buyer_id: b.id, products: [line()] });
    expect(toArchived.status()).toBe(400);
  });

  test('changing the product list replaces it, and the status must be one of the five', async ({ request }) => {
    const b = await newBuyer(request);
    const i = await (await post(request, '/inquiries', { buyer_id: b.id, products: [line(), line({ product_name: 'Turmeric' })] })).json();
    const replaced = await (await call(request, token, 'PATCH', `/inquiries/${i.id}`, { products: [line({ product_name: 'Sesame Seeds' })] })).json();
    expect(replaced.products.map((p: { product_name: string }) => p.product_name)).toEqual(['Sesame Seeds']);
    expect((await call(request, token, 'PATCH', `/inquiries/${i.id}`, { status: 'maybe' })).status()).toBe(400);
    expect((await call(request, token, 'PATCH', `/inquiries/${i.id}`, {})).status()).toBe(400);
    expect((await call(request, token, 'PATCH', `/inquiries/${i.id}`, { status: 'reviewing' })).status()).toBe(200);
    await call(request, token, 'DELETE', `/inquiries/${i.id}`);
  });
});

test.describe('products', () => {
  test('the same product and grade cannot exist twice, whatever the letter case', async ({ request }) => {
    const p = await makeProduct(request, token, '5');
    toClean.products.push(p.id);
    for (const grade of [p.grade, p.grade.toUpperCase()]) {
      const res = await post(request, '/products', { name: 'Cumin Seeds', grade, status: 'draft' });
      expect(res.status(), grade).toBe(409);
      expect((await res.json()).error.code).toBe('duplicate_product');
    }
  });

  test('GST % must be 0 to 100 and an active product needs it', async ({ request }) => {
    const grade = testName('GST rules');
    for (const gst of ['-1', '101', 'abc', '5.123']) {
      const res = await post(request, '/products', { name: 'Cumin Seeds', grade: `${grade} ${gst}`, status: 'draft', gst_rate: gst });
      expect(res.status(), gst).toBe(400);
    }
    const active = await post(request, '/products', { name: 'Cumin Seeds', grade: `${grade} active`, status: 'active' });
    expect(active.status()).toBe(400);
    expect((await active.json()).error.fields.gst_rate).toBeTruthy();
    const zero = await post(request, '/products', { name: 'Cumin Seeds', grade: `${grade} zero`, status: 'active', gst_rate: '0' });
    expect(zero.status()).toBe(201);
    toClean.products.push((await zero.json()).id);
  });

  test('the category follows the product name and cannot be set by hand', async ({ request }) => {
    const res = await post(request, '/products', { name: 'Turmeric Powder', grade: testName('Category'), status: 'draft', category: 'Hacked' });
    const p = await res.json();
    toClean.products.push(p.id);
    expect(p.category).toBe('Ground Spices');
  });

  test('packing options are trimmed, de-duplicated and limited', async ({ request }) => {
    const withBlank = await post(request, '/products', { name: 'Cumin Seeds', grade: testName('Packing'), status: 'draft', packing_options: ['25 kg PP bag', ''] });
    expect(withBlank.status()).toBe(400); // an empty option makes the whole list invalid
    expect((await withBlank.json()).error.fields.packing_options).toBeTruthy();
    const ok = await (await post(request, '/products', { name: 'Cumin Seeds', grade: testName('Packing ok'), status: 'draft', packing_options: ['25 kg PP bag', ' 25 KG PP BAG ', '500 g pouch'] })).json();
    toClean.products.push(ok.id);
    expect(ok.packing_options).toEqual(['25 kg PP bag', '500 g pouch']);
    const tooMany = await post(request, '/products', { name: 'Cumin Seeds', grade: testName('Packing many'), status: 'draft', packing_options: Array.from({ length: 21 }, (_, i) => `Pack ${i}`) });
    expect(tooMany.status()).toBe(400);
  });
});
