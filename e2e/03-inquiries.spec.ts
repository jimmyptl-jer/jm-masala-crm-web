/** Inquiries: the demo inquiries, filters, and the whole life of one inquiry (create with two products, view, edit, save, archive). */
import { expect, test } from '@playwright/test';
import { fakeBuyerMessage, fakeNote } from './fake';
import { api, collectProblems, expectText } from './helpers';

test('the list shows the demo inquiries with their codes, products and statuses', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/inquiries');
  for (const col of ['Inquiry ID', 'Date', 'Buyer', 'Product', 'Grade / purity', 'Quantity', 'Destination', 'Trade terms', 'Source', 'Status', 'Assigned to', 'Next follow-up', 'Actions']) {
    await expect(page.locator('thead th', { hasText: col }).first(), col).toBeVisible();
  }
  const rows = page.locator('tbody tr');
  await expectText(rows.filter({ hasText: 'Demo Spice Importers LLC' }), ['INQ-', 'Cumin Seeds', '+1 more', 'Jebel Ali', 'Quoted']);
  await expectText(rows.filter({ hasText: 'Sample Foods GmbH' }), ['Cumin Seeds', 'Hamburg', 'New']);
  await expectText(rows.filter({ hasText: 'Demo Masala Traders' }), ['Coriander Seeds', 'Reviewing']);
  expect(problems).toEqual([]);
});

test('filters narrow the list by status, product and search text', async ({ page }) => {
  await page.goto('/inquiries');
  const rows = page.locator('tbody tr');
  await page.getByLabel('Status', { exact: true }).selectOption('reviewing');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Demo Masala Traders');
  await page.getByLabel('Status', { exact: true }).selectOption('');
  await page.getByLabel('Product', { exact: true }).selectOption('Coriander Seeds');
  await expect(rows).toHaveCount(1);
  await page.getByLabel('Product', { exact: true }).selectOption('');
  await page.getByPlaceholder(/Search by inquiry/).fill('hamburg');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Sample Foods GmbH');
});

test('the form checks its input before it saves', async ({ page }) => {
  await page.goto('/inquiries/new');
  await page.getByRole('button', { name: 'Save inquiry' }).click();
  await expect(page.getByText('Choose a buyer.')).toBeVisible();
  await expect(page.getByText('Choose a product.')).toBeVisible();
  await expect(page.getByText('Enter a quantity above zero.')).toBeVisible();
  await expect(page).toHaveURL(/\/inquiries\/new$/);
});

test('an inquiry with two products can be created, edited, saved and archived', async ({ page }) => {
  const problems = collectProblems(page);
  const message = fakeBuyerMessage([{ name: 'cumin seeds', qty: '500 kg' }, { name: 'turmeric', qty: '2 MT' }], 'Jebel Ali');
  const note = fakeNote();
  let id: string | undefined;
  try {
    // --- create
    await page.goto('/inquiries/new');
    await page.getByLabel('Buyer', { exact: true }).selectOption({ label: 'Demo Spice Importers LLC' });
    await page.getByLabel('Product', { exact: true }).nth(0).selectOption('Cumin Seeds');
    await page.getByLabel('Quantity', { exact: true }).nth(0).fill('500');
    await page.getByLabel(/^Grade/).nth(0).fill('Europe Quality');
    await page.getByRole('button', { name: 'Add product' }).click();
    await page.getByLabel('Product', { exact: true }).nth(1).selectOption('Turmeric');
    await page.getByLabel('Quantity', { exact: true }).nth(1).fill('2');
    await page.getByLabel('Unit', { exact: true }).nth(1).selectOption('MT');
    await page.getByLabel('Destination country').fill('UAE');
    await page.getByLabel('Destination port').fill('Jebel Ali');
    await page.getByLabel('Preferred Incoterm').selectOption('CIF');
    await page.getByLabel('Buyer’s original message').fill(message);
    const created = page.waitForResponse((r) => /\/inquiries$/.test(r.url()) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save inquiry' }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string; inquiry_code: string };
    id = body.id;
    expect(body.inquiry_code).toMatch(/^INQ-\d{4}$/);

    // --- the detail page shows everything that was entered
    await expect(page).toHaveURL(new RegExp(`/inquiries/${id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${body.inquiry_code} · Demo Spice Importers LLC`);
    await expectText(page.getByRole('region', { name: 'Requested products' }), ['Cumin Seeds', 'Europe Quality', '500 KG', 'Turmeric', '2 MT']);
    await expect(page.getByText('Jebel Ali').first()).toBeVisible();
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page.getByText('No quotation has been made from this inquiry yet.')).toBeVisible();

    // --- edit: change the quantity, the status, the follow-up date and the notes, then save
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit inquiry');
    await page.getByLabel('Quantity', { exact: true }).nth(0).fill('750');
    await page.getByLabel('Status', { exact: true }).selectOption('reviewing');
    await page.getByLabel('Next follow-up').fill('2026-12-01');
    await page.getByLabel('Internal notes').fill(note);
    const saved = page.waitForResponse((r) => r.url().endsWith(`/inquiries/${id}`) && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save inquiry' }).click();
    expect((await saved).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/inquiries/${id}$`));
    await expect(page.getByRole('region', { name: 'Requested products' })).toContainText('750 KG');
    await expect(page.getByText(note)).toBeVisible();

    // --- the stored inquiry has the changes, and the list shows the new status
    expect(await (await api(page, 'GET', `/inquiries/${id}`)).json()).toMatchObject({ status: 'reviewing', next_followup: '2026-12-01', notes: note });
    await page.goto('/inquiries');
    await expectText(page.locator('tbody tr').filter({ hasText: body.inquiry_code }), ['Demo Spice Importers LLC', 'Reviewing']);

    // --- archive from the detail page
    await page.goto(`/inquiries/${id}`);
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('This inquiry is archived.')).toBeVisible();
    await page.goto('/inquiries');
    await expect(page.locator('tbody tr').filter({ hasText: body.inquiry_code })).toHaveCount(0);
    expect(problems).toEqual([]);
  } finally {
    if (id) await api(page, 'DELETE', `/inquiries/${id}`);
  }
});

test('"Create quotation" from an inquiry opens a new quotation for that buyer', async ({ page }) => {
  await page.goto('/inquiries');
  await page.locator('tbody tr').filter({ hasText: 'Demo Spice Importers LLC' }).getByRole('link', { name: /Create quotation/ }).click();
  await expect(page).toHaveURL(/\/quotes\/new\?buyer=[0-9a-f]{24}&inquiry=[0-9a-f]{24}$/);
});
