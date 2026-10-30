/**
 * Quotations: the demo quotes, and the whole life of one quotation: create a draft, edit it, then issue it and e-mail it to the buyer
 * (jimmyptl46@gmail.com). The first two steps are always run; the last one really sends an e-mail and uses up a quotation number, so it
 * only runs with E2E_SEND=1. The test buyer and the test product grade are archived afterwards; a saved quotation cannot be removed.
 */
import { expect, test, type Page } from '@playwright/test';
import { fakeBuyer } from './fake';
import { api, collectProblems, expectText } from './helpers';

const RECIPIENT = 'jimmyptl46@gmail.com';
const SEND = process.env.E2E_SEND === '1';

test('the quotation list shows the demo quotes with numbers, buyers, totals and statuses', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/quotes');
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  await expectText(rows.filter({ hasText: 'JM/Q/003/2026-27' }), ['Demo Spice Importers LLC', '36,925.00']);
  await expectText(rows.filter({ hasText: 'JM/Q/001/2026-27' }), ['Example Trading Co', 'Won']);
  await expectText(rows.filter({ hasText: 'JM/Q/004/2026-27' }), ['Demo Masala Traders', 'INR']);
  await expect(rows.filter({ hasText: 'Sample Kirana Mart' })).toContainText('Draft');
  expect(problems).toEqual([]);
});

test.describe.serial('a quotation: create, edit, issue and send', () => {
  const stamp = Date.now().toString(36).toUpperCase();
  const buyer = fakeBuyer({ email: RECIPIENT });
  const company = buyer.company_name;
  const grade = `E2E ${stamp}`;
  let buyerId = '';
  let productId = '';
  let quoteId = '';

  test.beforeAll(async ({ browser }) => {
    // a test buyer with the recipient's e-mail address and a test grade of Cumin Seeds that can be quoted (active, with GST %)
    const context = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
    const page = await context.newPage();
    await page.goto('/');
    const created = await api(page, 'POST', '/buyers', { type: 'export', company_name: company, country: buyer.country, city: buyer.city, contact_name: buyer.contact_name, designation: buyer.designation, phone: buyer.phone, email: RECIPIENT, default_currency: 'USD', default_incoterm: 'FOB' });
    expect(created.status()).toBe(201);
    buyerId = (await created.json()).id;
    const product = await api(page, 'POST', '/products', { name: 'Cumin Seeds', grade, status: 'active', gst_rate: '0', unit: 'MT', ref_rate_usd: '2850', packing_options: ['25 kg PP Bag'] });
    expect(product.status()).toBe(201);
    productId = (await product.json()).id;
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/state.json' });
    const page = await context.newPage();
    await page.goto('/');
    if (buyerId) await api(page, 'DELETE', `/buyers/${buyerId}`);
    if (productId) await api(page, 'PATCH', `/products/${productId}`, { archived: true });
    await context.close();
  });

  const quantity = (page: Page) => page.getByLabel(/^Quantity/);

  test('create a draft quotation for the buyer', async ({ page }) => {
    const problems = collectProblems(page);
    await page.goto('/quotes/new');
    await page.getByLabel('Buyer', { exact: true }).click();
    const picker = page.getByRole('dialog');
    await picker.locator('input').first().fill(company);
    await picker.getByRole('option').filter({ hasText: company }).click();
    await page.getByLabel('Port of loading').fill('Mundra');
    await page.getByLabel('Payment terms').selectOption('100% advance');
    await page.getByLabel('Product', { exact: true }).selectOption('Cumin Seeds');
    await page.getByLabel('Grade', { exact: true }).selectOption({ label: grade });
    await quantity(page).fill('10');
    await page.getByLabel(/^Rate/).fill('2900');
    await expect(page.getByText('29,000.00').first()).toBeVisible(); // 10 MT x USD 2,900, worked out by the API
    const saved = page.waitForResponse((r) => /\/quotes$/.test(r.url()) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save draft' }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    quoteId = (await response.json()).id;
    await expect(page).toHaveURL(new RegExp(`/quotes/${quoteId}/edit$`));
    const stored = await (await api(page, 'GET', `/quotes/${quoteId}`)).json();
    expect(stored).toMatchObject({ status: 'draft', grand_total: '29000.00', currency: 'USD' });
    expect(problems).toEqual([]);
  });

  test('edit the draft: more quantity and a note, then save', async ({ page }) => {
    await page.goto(`/quotes/${quoteId}/edit`);
    await expect(quantity(page)).toHaveValue('10.000');
    await quantity(page).fill('12');
    await page.getByLabel('Special notes').fill('E2E edit: quantity changed to 12 MT.');
    await expect(page.getByText('34,800.00').first()).toBeVisible(); // 12 MT x USD 2,900
    const saved = page.waitForResponse((r) => r.url().includes(`/quotes/${quoteId}/draft`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save draft' }).click();
    expect((await saved).status()).toBe(200);
    const stored = await (await api(page, 'GET', `/quotes/${quoteId}`)).json();
    expect(stored).toMatchObject({ status: 'draft', grand_total: '34800.00' });
    await page.reload();
    await expect(quantity(page)).toHaveValue('12.000');
    await expect(page.getByLabel('Special notes')).toHaveValue('E2E edit: quantity changed to 12 MT.');
  });

  test('the draft is in the quotation list under the buyer', async ({ page }) => {
    await page.goto('/quotes');
    await expectText(page.locator('tbody tr').filter({ hasText: company }), ['Draft', 'Cumin Seeds', '34,800.00']);
  });

  test('issue the quotation and e-mail it to jimmyptl46@gmail.com', async ({ page }) => {
    test.skip(!SEND, 'Set E2E_SEND=1 to really issue the quotation and send the e-mail (it uses up a quotation number).');
    const settings = await (await api(page, 'GET', '/settings')).json();
    test.skip(!settings.company?.name, 'Fill in the company details in Settings first: a quotation cannot be issued without them.');
    const problems = collectProblems(page);
    await page.goto(`/quotes/${quoteId}/edit`);
    await page.getByRole('button', { name: 'Finalise and send' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Issue this quote');
    await expect(sheet).toContainText(RECIPIENT);
    const issued = page.waitForResponse((r) => r.url().includes(`/quotes/${quoteId}/issue`) && r.request().method() === 'POST', { timeout: 60_000 });
    const sent = page.waitForResponse((r) => /\/revisions\/\d+\/send$/.test(r.url()) && r.request().method() === 'POST', { timeout: 90_000 });
    await sheet.getByRole('button', { name: 'Issue quote' }).click();
    const issue = await issued;
    expect(issue.status(), `issuing the quotation: ${await issue.text()}`).toBe(200);
    const mail = await sent;
    expect(mail.status(), `the e-mail was accepted for sending: ${await mail.text()}`).toBe(200);
    expect(await mail.json()).toMatchObject({ channel: 'email', to: RECIPIENT });
    const stored = await (await api(page, 'GET', `/quotes/${quoteId}`)).json();
    expect(stored.status).toBe('sent');
    expect(stored.number).toMatch(/^JM\/Q\/\d{3}\/\d{4}-\d{2}$/);
    expect(stored.grand_total).toBe('34800.00');
    await page.goto('/quotes');
    await expectText(page.locator('tbody tr').filter({ hasText: company }), [stored.number, 'Sent']);
    expect(problems).toEqual([]);
  });
});
