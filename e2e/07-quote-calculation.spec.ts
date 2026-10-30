/**
 * The quotation form's live calculation: type quantities and rates and the totals panel beside the form shows what the API works out
 * (export and domestic, freight, insurance, discount, GST, round-off, the rupee value at today's dollar rate, margin from a rupee cost).
 * No money is ever calculated in the browser, so every number checked here comes from POST /quotes/calculate. Nothing is saved: these tests
 * only type into the form. They make test buyers and products through the API (archived at the end) and use the dollar rate 83.45
 * (the earlier rate is put back). The domestic tests need the company's GST state code saved in Settings.
 */
import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';
import { expectTotal, fillLine, line, newQuoteFor, pickIncoterm, summary } from './quote-form';
import { call, cleanUp, makeBuyer, makeProduct, tokenOf } from './qa';

test.describe.configure({ mode: 'serial' });

let token = '';
let rateBefore: string | null = null;
let exportBuyer = { id: '', company: '' };
let sameState = { id: '', company: '' };
let otherState = { id: '', company: '' };
let gst0 = { id: '', grade: '' };
let gst5 = { id: '', grade: '' };
let companyState = '';
const toClean: { buyers: string[]; products: string[] } = { buyers: [], products: [] };

test.beforeAll(async ({ request }) => {
  token = await tokenOf('admin');
  gst0 = await makeProduct(request, token, '0');
  gst5 = await makeProduct(request, token, '5');
  exportBuyer = await makeBuyer(request, token);
  toClean.products.push(gst0.id, gst5.id);
  toClean.buyers.push(exportBuyer.id);
  companyState = (await (await call(request, token, 'GET', '/settings')).json()).company?.state_code ?? '';
  if (companyState) {
    const domestic = { type: 'domestic', country: null, default_incoterm: null, default_port: null, default_currency: 'INR', state: 'Test state', city: 'Test city' };
    sameState = await makeBuyer(request, token, { ...domestic, state_code: companyState });
    otherState = await makeBuyer(request, token, { ...domestic, state_code: companyState === '27' ? '29' : '27' });
    toClean.buyers.push(sameState.id, otherState.id);
  }
  rateBefore = (await (await call(request, token, 'GET', '/fx-rate')).json()).rate;
  expect((await call(request, token, 'PUT', '/fx-rate', { rate: '83.45' })).status()).toBe(200);
});
test.afterAll(async ({ request }) => {
  if (rateBefore) await call(request, token, 'PUT', '/fx-rate', { rate: rateBefore });
  await cleanUp(request, token, toClean);
});

test.describe('export quotation (USD)', () => {
  test('before anything is typed the total is zero and the form says what is missing', async ({ page }) => {
    await page.goto('/quotes/new');
    await expect(summary(page)).toContainText('USD 0.00');
    await expect(summary(page)).toContainText('add products');
    await expect(page.getByRole('button', { name: 'Finalise and send' })).toBeDisabled();
    await expect(page.getByText(/Complete \d+ items? to continue/)).toBeVisible();
  });

  test('quantity x rate gives the total, worked out by the API, with no GST', async ({ page }) => {
    const problems = collectProblems(page);
    await newQuoteFor(page, exportBuyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade, quantity: '10', rate: '2900' });
    await expectTotal(page, 'USD 29,000.00');
    await expect(summary(page)).toContainText('Subtotal');
    await expect(summary(page).getByText('GST', { exact: true })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('the total follows every change of quantity and rate', async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade, quantity: '10', rate: '2900' });
    await expectTotal(page, 'USD 29,000.00');
    await fillLine(page, 1, { quantity: '12.5' });
    await expectTotal(page, 'USD 36,250.00');
    await fillLine(page, 1, { rate: '2650.50' });
    await expectTotal(page, 'USD 33,131.25');
  });

  test('freight and insurance appear only for CIF and CFR, and add to the total', async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade, quantity: '10', rate: '2900' });
    await pickIncoterm(page, 'FOB');
    await expect(page.getByLabel('Freight (USD)')).toHaveCount(0);
    await expect(page.getByLabel('Insurance (USD)')).toHaveCount(0);
    await pickIncoterm(page, 'CIF');
    await page.getByLabel('Freight (USD)').fill('500');
    await page.getByLabel('Insurance (USD)').fill('100');
    await expectTotal(page, 'USD 29,600.00');
    await pickIncoterm(page, 'FOB');
    await expectTotal(page, 'USD 29,000.00'); // switching to FOB leaves the typed charges out
    await pickIncoterm(page, 'CFR');
    await expectTotal(page, 'USD 29,600.00');
  });

  test('a discount comes off the total', async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade, quantity: '10', rate: '2900' });
    await page.getByLabel('Discount (USD)').fill('1000');
    await expectTotal(page, 'USD 28,000.00');
    await page.getByLabel('Discount (USD)').fill('99999');
    await expectTotal(page, 'USD 0.00'); // a discount bigger than the goods is cut back, never a negative total
  });

  test("the total is also shown in rupees at today's dollar rate", async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade, quantity: '10', rate: '2900' });
    await expectTotal(page, '≈ ₹24,20,050.00 at ₹83.45 per US$1'); // 29,000 x 83.45, in lakh and crore grouping
  });

  test('two products add up, and removing one takes it off again', async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade, quantity: '10', rate: '2900' });
    await page.getByRole('button', { name: 'Add product' }).click();
    await expect(line(page, 2)).toBeVisible();
    await fillLine(page, 2, { product: 'Cumin Seeds', grade: gst5.grade, quantity: '2', rate: '1500' });
    await expectTotal(page, 'USD 32,000.00');
    await page.getByRole('button', { name: 'Remove product 2' }).click();
    await expect(line(page, 2)).toHaveCount(0);
    await expectTotal(page, 'USD 29,000.00');
  });

  test('quantity takes three decimals and rate two: extra digits are not typed', async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    const card = line(page, 1);
    await card.getByLabel(/^Quantity/).pressSequentially('1.23456');
    await expect(card.getByLabel(/^Quantity/)).toHaveValue('1.234');
    await card.getByLabel(/^Rate/).pressSequentially('99.999');
    await expect(card.getByLabel(/^Rate/)).toHaveValue('99.99');
    await card.getByLabel(/^Quantity/).fill('');
    await card.getByLabel(/^Quantity/).pressSequentially('1e5-x');
    await expect(card.getByLabel(/^Quantity/)).toHaveValue('15');
  });

  test('a margin from a rupee cost is worked out at the dollar rate, and shown only when cost is shown', async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade, quantity: '100', rate: '3' });
    await expectTotal(page, 'USD 300.00');
    await expect(summary(page)).not.toContainText('Margin');
    await page.getByRole('button', { name: 'Show cost' }).click();
    await fillLine(page, 1, { cost: '83.45' }); // Rs 83.45 = USD 1 at today's rate, so the margin is (3 - 1) x 100
    await expect(page.getByText('Total margin')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Total margin').locator('..')).toContainText('200.00');
    await expect(page.getByText('Internal only. Not printed on the quote.')).toBeVisible();
    await page.getByRole('button', { name: 'Hide cost' }).click();
    await expect(page.getByText('Total margin')).toHaveCount(0);
  });
});

test.describe('domestic quotation (INR with GST)', () => {
  test.beforeEach(() => { test.skip(!companyState, 'The company GST state code is not saved in Settings, so domestic GST cannot be tested.'); });

  test('same state: CGST + SGST on the line, total with GST', async ({ page }) => {
    await newQuoteFor(page, sameState.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst5.grade, quantity: '2', rate: '1000' });
    await expectTotal(page, 'INR 2,100.00');
    await expect(summary(page)).toContainText('GST');
    await expect(summary(page)).toContainText('100.00');
    await expect(page.getByText('CGST + SGST')).toBeVisible();
  });

  test('another state: IGST instead, same amount', async ({ page }) => {
    await newQuoteFor(page, otherState.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst5.grade, quantity: '2', rate: '1000' });
    await expectTotal(page, 'INR 2,100.00');
    await expect(page.getByText('IGST', { exact: true })).toBeVisible();
    await expect(page.getByText('CGST + SGST')).toHaveCount(0);
  });

  test('the total is rounded to the whole rupee and the round-off is shown', async ({ page }) => {
    await newQuoteFor(page, sameState.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst5.grade, quantity: '1', rate: '99.81' });
    await expectTotal(page, 'INR 105.00'); // 99.81 + 4.99 GST = 104.80
    await expect(summary(page)).toContainText('Round off');
    await expect(summary(page)).toContainText('0.20');
  });

  test('a domestic quote is in rupees only, and shows the dollar value', async ({ page }) => {
    await newQuoteFor(page, sameState.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst5.grade, quantity: '1', rate: '8345' });
    await expectTotal(page, '≈ US$');
    await expect(page.getByLabel('Currency')).toBeDisabled();
    await expect(page.getByLabel('Freight (INR)')).toHaveCount(0);
  });
});

test.describe('checks before saving', () => {
  test('saving an empty form shows what to fix and sends nothing', async ({ page }) => {
    const sent: string[] = [];
    page.on('request', (r) => { if (/\/quotes$/.test(r.url()) && r.method() === 'POST') sent.push(r.url()); });
    await page.goto('/quotes/new');
    await page.getByRole('button', { name: 'Save draft' }).first().click();
    await expect(page.getByText('Please fix the highlighted fields.')).toBeVisible();
    await expect(page.getByText('Choose a buyer').first()).toBeVisible();
    expect(sent).toEqual([]);
  });

  test('a product line without quantity or rate says so', async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade });
    await page.getByRole('button', { name: 'Save draft' }).first().click();
    await expect(page.getByText('Enter a quantity')).toBeVisible();
    await expect(page.getByText('Enter a rate')).toBeVisible();
  });

  test('"Finalise and send" opens only when the checklist is complete', async ({ page }) => {
    await newQuoteFor(page, exportBuyer.company);
    await expect(page.getByRole('button', { name: 'Finalise and send' })).toBeDisabled();
    await fillLine(page, 1, { product: 'Cumin Seeds', grade: gst0.grade, quantity: '1', rate: '10' });
    await pickIncoterm(page, 'FOB');
    await page.getByLabel('Port of loading').fill('Mundra');
    await page.getByLabel('Payment terms').selectOption('100% advance');
    await expect(page.getByRole('button', { name: 'Finalise and send' })).toBeEnabled();
  });
});
