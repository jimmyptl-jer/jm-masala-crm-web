/**
 * Product grades and packaging: the 55 draft grade records loaded by `npm run seed:grades` (13 products, 4 to 5 grades each, a product code
 * such as SPC-CUM, a list of packaging options, nothing verified filled in) and the rule that matters most: a DRAFT grade can never be put
 * on a quotation; it only becomes available when someone fills in its GST % and makes it Active. The tests read the seeded records and
 * never change them; anything they change, they make themselves (a test grade, archived at the end).
 */
import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';
import { fillLine, newQuoteFor } from './quote-form';
import { call, cleanUp, makeBuyer, tokenOf } from './qa';

const CODES: Record<string, string> = {
  'Cumin Seeds': 'SPC-CUM', 'Coriander Seeds': 'SPC-COR', 'Fennel Seeds': 'SPC-FEN', 'Fenugreek Seeds': 'SPC-FGR', 'Mustard Seeds': 'SPC-MUS', 'Sesame Seeds': 'SPC-SES', 'Ajwain Seeds': 'SPC-AJW',
  'Psyllium Husk (Isabgol)': 'SPC-PSY', Turmeric: 'SPC-TUR', 'Turmeric Powder': 'SPC-TUP', 'Red Chili Powder': 'SPC-RCP', 'Dry Ginger Slices': 'SPC-DGS', 'Dry Ginger Powder': 'SPC-DGP',
};
type P = { id: string; name: string; grade: string | null; status: string; product_code: string | null; gst_rate: string | null; packing_options: string[]; archived: boolean; hs_code: string | null; purity: string | null; moisture: string | null; unit: string };

test.describe.configure({ mode: 'serial' });
let token = '';
let products: P[] = [];
const toClean: { buyers: string[]; products: string[] } = { buyers: [], products: [] };
let buyer = { id: '', company: '' };

test.beforeAll(async ({ request }) => {
  token = await tokenOf('admin');
  products = (await (await call(request, token, 'GET', '/products?archived=false')).json()).data;
  buyer = await makeBuyer(request, token);
  toClean.buyers.push(buyer.id);
});
test.afterAll(async ({ request }) => { await cleanUp(request, token, toClean); });

const graded = () => products.filter((p) => p.grade && p.status === 'draft' && p.product_code);

test.describe('the seeded catalogue (data)', () => {
  test('all 13 products have a code, and every code is used by the right product', async () => {
    for (const [name, code] of Object.entries(CODES)) {
      const mine = products.filter((p) => p.name === name);
      expect(mine.length, name).toBeGreaterThan(0);
      expect(mine.every((p) => p.product_code === code), `${name} has code ${code} on every record`).toBe(true);
    }
  });

  test('there are at least 55 graded draft records, 4 or more for every product', async () => {
    expect(graded().length).toBeGreaterThanOrEqual(55);
    for (const name of Object.keys(CODES)) expect(graded().filter((p) => p.name === name).length, name).toBeGreaterThanOrEqual(4);
  });

  test('the grades in the proposal are there, spelled as agreed (and no "Custom" prompts were loaded)', async () => {
    const has = (name: string, grade: string) => products.some((p) => p.name === name && p.grade === grade);
    for (const [name, grade] of [
      ['Cumin Seeds', 'Singapore 99 — Machine Clean'], ['Cumin Seeds', 'Singapore 99 — Sortex'], ['Coriander Seeds', 'Eagle+ Sortex'], ['Fennel Seeds', 'Green fennel'], ['Mustard Seeds', 'Yellow mustard'],
      ['Sesame Seeds', 'Hulled sesame'], ['Psyllium Husk (Isabgol)', 'Psyllium husk powder'], ['Turmeric', 'Nizamabad'], ['Turmeric Powder', 'Curcumin-based specification'],
      ['Red Chili Powder', 'Byadgi chili powder'], ['Dry Ginger Slices', 'Thin-cut slices'], ['Dry Ginger Powder', 'Premium aroma specification'],
    ] as const) expect(has(name, grade), `${name} / ${grade}`).toBe(true);
    expect(products.filter((p) => /^custom/i.test(p.grade ?? ''))).toEqual([]);
  });

  test('nothing unverified was filled in: no GST, HS code, purity or moisture on a seeded draft', async () => {
    for (const p of graded()) {
      expect(p.gst_rate, `${p.name} / ${p.grade}`).toBeNull();
      expect([p.hs_code, p.purity, p.moisture]).toEqual([null, null, null]);
    }
  });

  test('every grade has its packaging options: bulk and retail sizes, each name short and readable', async () => {
    for (const p of graded()) {
      expect(p.packing_options.length, `${p.name} / ${p.grade}`).toBeGreaterThanOrEqual(5);
      expect(p.packing_options.some((x) => /^\d+ kg /.test(x)), `${p.name} bulk`).toBe(true);
      expect(p.packing_options.some((x) => /^\d+ g pouch$/.test(x)), `${p.name} retail`).toBe(true);
      for (const x of p.packing_options) expect(x.length).toBeLessThanOrEqual(80);
    }
  });
});

test.describe('on the Products screen', () => {
  test('searching a grade finds it and marks it Draft', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto('/products');
    await page.getByLabel('Search products').fill('Singapore 99');
    const rows = page.locator('tbody tr, [role="row"], li').filter({ hasText: 'Singapore 99' });
    await expect(rows.first()).toBeVisible();
    await expect(page.getByText('Singapore 99 — Machine Clean').first()).toBeVisible();
    await expect(page.getByText('Singapore 99 — Sortex').first()).toBeVisible();
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('searching by another grade name finds the right product', async ({ page }) => {
    await page.goto('/products');
    await page.getByLabel('Search products').fill('Byadgi');
    await expect(page.getByText('Red Chili Powder').first()).toBeVisible();
    await page.getByLabel('Search products').fill('Nizamabad');
    await expect(page.getByText('Turmeric', { exact: true }).first()).toBeVisible();
    await page.getByLabel('Search products').fill('zzz no such grade');
    await expect(page.getByText('No products match your search')).toBeVisible();
  });
});

test.describe('draft grades and quotations', () => {
  test('a draft grade is not offered on a quotation', async ({ page }) => {
    await newQuoteFor(page, buyer.company);
    await page.getByRole('group', { name: 'Product 1', exact: true }).getByLabel('Product', { exact: true }).selectOption('Cumin Seeds');
    const grades = page.getByRole('group', { name: 'Product 1', exact: true }).getByLabel('Grade', { exact: true });
    const options = await grades.locator('option').allTextContents();
    for (const draftGrade of ['Singapore 99 — Machine Clean', 'Singapore 99 — Sortex', 'Europe Quality', 'FAQ / Standard Quality']) expect(options.join('|'), draftGrade).not.toContain(draftGrade);
  });

  test('the API also refuses a draft grade on a quotation, naming the line', async ({ request }) => {
    const draft = graded().find((p) => p.name === 'Cumin Seeds')!;
    const res = await call(request, token, 'POST', '/quotes/calculate', { buyer_id: buyer.id, lines: [{ product_id: draft.id, quantity: '1', rate: '10' }] });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields['lines.0.product_id']).toMatch(/draft/i);
  });

  test('a grade cannot be made Active without its GST %; with it, it becomes available on quotations', async ({ page, request }) => {
    const grade = `E2E activate ${Date.now().toString(36)}`;
    const created = await call(request, token, 'POST', '/products', { name: 'Cumin Seeds', grade, status: 'draft', unit: 'MT', packing_options: ['25 kg PP bag', '500 g pouch'], product_code: 'spc-cum' });
    expect(created.status()).toBe(201);
    const p = await created.json();
    toClean.products.push(p.id);
    expect(p.product_code).toBe('SPC-CUM'); // capitals are applied for you

    const refused = await call(request, token, 'PATCH', `/products/${p.id}`, { status: 'active' });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error.fields.gst_rate).toBeTruthy();

    await newQuoteFor(page, buyer.company);
    const card = page.getByRole('group', { name: 'Product 1', exact: true });
    await card.getByLabel('Product', { exact: true }).selectOption('Cumin Seeds');
    expect(await card.getByLabel('Grade', { exact: true }).locator('option').allTextContents()).not.toContain(grade);

    expect((await call(request, token, 'PATCH', `/products/${p.id}`, { status: 'active', gst_rate: '5' })).status()).toBe(200);
    await newQuoteFor(page, buyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade });
    await expect(card.getByLabel('Grade', { exact: true })).toContainText(grade);
  });

  test("the grade's packaging options are the choices for Packing on the line", async ({ page, request }) => {
    const grade = `E2E packing ${Date.now().toString(36)}`;
    const created = await call(request, token, 'POST', '/products', { name: 'Cumin Seeds', grade, status: 'active', gst_rate: '0', unit: 'MT', packing_options: ['25 kg PP bag', '500 g pouch'] });
    const p = await created.json();
    toClean.products.push(p.id);
    await newQuoteFor(page, buyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade });
    const packing = page.getByRole('group', { name: 'Product 1', exact: true }).getByLabel('Packing', { exact: true });
    const options = await packing.locator('option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['25 kg PP bag', '500 g pouch']));
  });

  test('an archived grade disappears from quotations and from the list, but can be shown again', async ({ page, request }) => {
    const grade = `E2E archive ${Date.now().toString(36)}`;
    const p = await (await call(request, token, 'POST', '/products', { name: 'Cumin Seeds', grade, status: 'active', gst_rate: '0', unit: 'MT' })).json();
    toClean.products.push(p.id);
    expect((await call(request, token, 'PATCH', `/products/${p.id}`, { archived: true })).status()).toBe(200);
    const res = await call(request, token, 'POST', '/quotes/calculate', { buyer_id: buyer.id, lines: [{ product_id: p.id, quantity: '1', rate: '10' }] });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.fields['lines.0.product_id']).toMatch(/archived/i);
    await page.goto('/products');
    await page.getByLabel('Search products').fill(grade);
    await expect(page.getByText('No products match your search')).toBeVisible();
    await page.getByLabel('Show archived products').check();
    await expect(page.getByText(grade).first()).toBeVisible();
  });

  test('a product code must be capital letters and digits, and can be cleared', async ({ request }) => {
    const grade = `E2E code ${Date.now().toString(36)}`;
    const p = await (await call(request, token, 'POST', '/products', { name: 'Turmeric', grade, status: 'draft', product_code: 'SPC-TUR' })).json();
    toClean.products.push(p.id);
    for (const bad of ['not a code!', 'SPC TUR', '<script>', 'A'.repeat(40)]) {
      const res = await call(request, token, 'PATCH', `/products/${p.id}`, { product_code: bad });
      expect(res.status(), bad).toBe(400);
      expect((await res.json()).error.fields.product_code, bad).toBeTruthy();
    }
    const cleared = await call(request, token, 'PATCH', `/products/${p.id}`, { product_code: '' });
    expect((await cleared.json()).product_code).toBeNull();
  });

  test('a name outside the 13 catalogue products, and the old Psyllium name, are refused', async ({ request }) => {
    const grade = `E2E name ${Date.now().toString(36)}`;
    for (const name of ['Black Pepper', 'Curry Leaf', 'Psyllium', 'cumin', '']) {
      const res = await call(request, token, 'POST', '/products', { name, grade, status: 'draft' });
      expect(res.status(), name).toBe(name === 'cumin' ? 201 : 400);
      if (res.status() === 201) toClean.products.push((await res.json()).id);
    }
  });
});
