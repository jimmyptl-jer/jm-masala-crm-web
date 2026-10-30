/**
 * Daily rates and grades: the Daily rates tab of the Products page (every grade with its USD and INR price per kg, edited in place, saved
 * together, with a day-by-day history), the product form (rates per kg inside the grades table, no Reference pricing step) and deleting a
 * grade. The test grade is a Cumin Seeds grade named "E2E ..." and is deleted again at the end (nothing has ever used it).
 */
import { expect, test } from '@playwright/test';
import { api, collectProblems } from './helpers';

const stamp = () => Date.now().toString(36).toUpperCase();

test('the Products page has a Products tab and a Daily rates tab that lists every grade', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/products');
  const tabs = page.getByRole('tablist', { name: 'Products sections' });
  await expect(tabs.getByRole('tab', { name: 'Products' })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Daily rates' }).click();
  await expect(page).toHaveURL(/\/products\?tab=daily-rates$/);
  const table = page.getByRole('region', { name: 'Daily rates' });
  for (const col of ['Grade', 'USD per kg', 'INR per kg', 'Rate set', 'Actions']) await expect(table.locator('thead th', { hasText: col }).first(), col).toBeVisible();
  await expect(table.locator('tbody tr').first()).toBeVisible();
  await expect(table.getByRole('link', { name: 'Add product' })).toBeVisible();
  await page.goto('/products?tab=daily-rates'); // the address opens the tab directly
  await expect(tabs.getByRole('tab', { name: 'Daily rates' })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Products' }).click();
  await expect(page).toHaveURL(/\/products$/);
  expect(problems).toEqual([]);
});

test('a grade\'s rate per kg can be changed on the tab, saved with the others, and its history is kept', async ({ page }) => {
  const problems = collectProblems(page);
  const grade = `E2E ${stamp()}`;
  await page.goto('/');
  const created = await api(page, 'POST', '/products', { name: 'Cumin Seeds', grade, status: 'active', gst_rate: '0', unit: 'MT', ref_rate_usd: '3.20', ref_rate_inr: '260' });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id as string;
  try {
    await page.goto('/products?tab=daily-rates');
    const table = page.getByRole('region', { name: 'Daily rates' });
    await table.getByPlaceholder('Search a product or grade…').fill(grade);
    const row = table.locator('tbody tr').filter({ hasText: grade });
    await expect(row).toHaveCount(1);
    const usd = row.getByLabel(/^USD per kg for/);
    const inr = row.getByLabel(/^INR per kg for/);
    await expect(usd).toHaveValue('3.20');
    await expect(inr).toHaveValue('260.00');
    const save = page.getByRole('button', { name: /^Save/ });
    await expect(save).toBeDisabled(); // nothing changed yet

    await usd.fill('3.45');
    await inr.fill('280');
    await expect(page.getByRole('button', { name: 'Save 1 rate' })).toBeEnabled();
    const saved = page.waitForResponse((r) => r.url().endsWith('/daily-rates') && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save 1 rate' }).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect((await response.json()).data).toHaveLength(1);
    await expect(page.getByRole('button', { name: 'Save rates' })).toBeDisabled();
    await expect(usd).toHaveValue('3.45');

    // stored, with today's date
    const stored = await (await api(page, 'GET', `/products/${id}`)).json();
    expect(stored).toMatchObject({ ref_rate_usd: '3.45', ref_rate_inr: '280.00' });
    expect(stored.rate_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // the history shows the day's rates and who set them
    await row.getByRole('button', { name: /^History/ }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toContainText('Rate history');
    await expect(sheet).toContainText('USD 3.45');
    await expect(sheet).toContainText('INR 280.00');
    await expect(sheet).toContainText('Jimmy Patel');
    await page.keyboard.press('Escape');

    // the product page shows the same rate (per kg)
    await page.goto('/products/Cumin%20Seeds');
    await page.getByRole('tab', { name: 'Grades' }).click();
    const gradeRow = page.locator('tbody tr').filter({ hasText: grade });
    await expect(gradeRow).toContainText('USD 3.45');
    await expect(gradeRow).toContainText('per kg');
    expect(problems).toEqual([]);
  } finally {
    await api(page, 'DELETE', `/products/${id}?permanent=1`);
  }
});

test('discarding edits on the tab leaves the saved rates alone', async ({ page }) => {
  const grade = `E2E ${stamp()}`;
  await page.goto('/');
  const id = (await (await api(page, 'POST', '/products', { name: 'Cumin Seeds', grade, status: 'active', gst_rate: '0', unit: 'MT', ref_rate_usd: '3.20', ref_rate_inr: '260' })).json()).id as string;
  try {
    await page.goto('/products?tab=daily-rates');
    const table = page.getByRole('region', { name: 'Daily rates' });
    await table.getByPlaceholder('Search a product or grade…').fill(grade);
    const usd = table.locator('tbody tr').filter({ hasText: grade }).getByLabel(/^USD per kg for/);
    await usd.fill('9.99');
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(usd).toHaveValue('3.20');
    expect((await (await api(page, 'GET', `/products/${id}`)).json()).ref_rate_usd).toBe('3.20');
  } finally {
    await api(page, 'DELETE', `/products/${id}?permanent=1`);
  }
});

test('the product form has the rate per kg in the grades table and no Reference pricing step', async ({ page }) => {
  await page.goto('/products/Cumin%20Seeds/edit');
  await expect(page.getByRole('heading', { name: /Grades? & specifications/ })).toBeVisible();
  await expect(page.getByLabel('USD per kg 1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('INR per kg 1', { exact: true })).toBeVisible();
  await expect(page.getByText('Reference pricing')).toHaveCount(0);
  await expect(page.getByText('Indicative only')).toHaveCount(0);
  // the HS (export) and HSN (domestic) codes are product details shared by every grade: two inputs at the top, no columns in the grades table
  await expect(page.getByLabel(/^HS code \(export\)/)).toHaveCount(1);
  await expect(page.getByLabel(/^HSN code \(domestic\)/)).toHaveCount(1);
  await expect(page.locator('thead th', { hasText: /HS|HSN/ })).toHaveCount(0);
  await expect(page.getByText('The HS and HSN codes are the same for every grade of this product.')).toBeVisible();
  const steps = page.getByRole('navigation', { name: 'Product form sections' }).getByRole('listitem');
  await expect(steps).toHaveCount(4);
});

test('a saved grade can be deleted from the product form when no quotation used it', async ({ page }) => {
  const problems = collectProblems(page);
  const grade = `E2E ${stamp()}`;
  await page.goto('/');
  const id = (await (await api(page, 'POST', '/products', { name: 'Cumin Seeds', grade, status: 'active', gst_rate: '0', unit: 'MT', ref_rate_usd: '3.20', ref_rate_inr: '260' })).json()).id as string;
  try {
    await page.goto('/products/Cumin%20Seeds/edit');
    const row = page.locator('tbody tr').filter({ has: page.locator(`input[value="${grade}"]`) });
    await expect(row).toHaveCount(1);
    page.once('dialog', (d) => { expect(d.message()).toContain(grade); void d.accept(); });
    const deleted = page.waitForResponse((r) => r.url().includes(`/products/${id}?permanent=1`) && r.request().method() === 'DELETE');
    await row.getByRole('button', { name: /^Delete grade/ }).click();
    const response = await deleted;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, product: null });
    await expect(page.locator(`input[value="${grade}"]`)).toHaveCount(0);
    expect((await api(page, 'GET', `/products/${id}`)).status()).toBe(404);
    expect(problems.filter((p) => !p.includes('404'))).toEqual([]);
  } finally {
    await api(page, 'DELETE', `/products/${id}?permanent=1`); // already gone: harmless 404
  }
});

test('the Daily rates page lists product by product with the grades below each product', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Daily rates/ }).click();
  await expect(page).toHaveURL(/\/daily-rates$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Daily rates');
  const bands = page.locator('tbody th[scope="colgroup"]');
  await expect(bands.first()).toBeVisible();
  const first = bands.first();
  await expect(first).toContainText(/\d+ grades?/);
  // the grade rows follow their product's band: the row after the band is a grade row with two rate inputs
  const body = first.locator('xpath=ancestor::tbody');
  await expect(body.locator('tr').nth(1).getByLabel(/^USD per kg for/)).toBeVisible();
  await expect(body.locator('tr').nth(1).getByLabel(/^INR per kg for/)).toBeVisible();
  expect(problems).toEqual([]);
});

test('the dashboard has a Daily rates tab, and each card opens its own tab with the details', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Dashboard sections' });
  await expect(tabs.getByRole('tab', { name: /^Chase list/ })).toHaveAttribute('aria-selected', 'true');
  for (const [card, tab, heading] of [
    [/^Show Overdue/, /^Overdue/, 'Overdue follow-ups'],
    [/^Show New enquiries/, /^New enquiries/, 'New enquiries'],
    [/^Show Going cold/, /^Going cold/, 'Going cold'],
    [/^Show Chase today/, /^Chase list/, 'Chase list'],
  ] as const) {
    await page.getByRole('button', { name: card }).click();
    await expect(tabs.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel').getByRole('heading', { name: heading })).toBeVisible();
  }
  await tabs.getByRole('tab', { name: 'Daily rates' }).click();
  const panel = page.getByRole('tabpanel');
  await expect(panel.getByRole('heading', { name: 'Daily rates' })).toBeVisible();
  await expect(panel.locator('tbody th[scope="colgroup"]').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('Daily rates and the product form are one record: a change in either shows in the other, the product page and the history', async ({ page }) => {
  test.setTimeout(150_000);
  const problems = collectProblems(page);
  const grade = `E2E ${stamp()}`;
  await page.goto('/');
  const created = await api(page, 'POST', '/products', { name: 'Cumin Seeds', grade, status: 'active', gst_rate: '0', unit: 'MT', ref_rate_usd: '3.20', ref_rate_inr: '260' });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id as string;
  const formRow = () => page.locator('tbody tr').filter({ has: page.locator(`input[value="${grade}"]`) });
  try {
    // 1. change the rates on the Daily rates tab ...
    await page.goto('/products?tab=daily-rates');
    const table = page.getByRole('region', { name: 'Daily rates' });
    await table.getByPlaceholder('Search a product or grade…').fill(grade);
    const row = table.locator('tbody tr').filter({ hasText: grade });
    await row.getByLabel(/^USD per kg for/).fill('4.10');
    await row.getByLabel(/^INR per kg for/).fill('300');
    const put = page.waitForResponse((r) => r.url().endsWith('/daily-rates') && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save 1 rate' }).click();
    expect((await put).status()).toBe(200);

    // ... they are in the product form, on the product page and on the dashboard / Daily rates page
    await page.goto('/products/Cumin%20Seeds/edit');
    await expect(formRow()).toHaveCount(1);
    await expect(formRow().getByLabel(/^USD per kg \d+$/)).toHaveValue('4.10');
    await expect(formRow().getByLabel(/^INR per kg \d+$/)).toHaveValue('300.00');

    // 2. change them in the product form ...
    await formRow().getByLabel(/^USD per kg \d+$/).fill('4.25');
    await formRow().getByLabel(/^INR per kg \d+$/).fill('310');
    const saved = page.waitForResponse((r) => r.url().endsWith(`/products/${id}`) && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: 'Save product' }).click();
    expect((await saved).status()).toBe(200);
    await expect(page).toHaveURL(/\/products/);

    // ... they are on the Daily rates tab, on the Daily rates page and in the history (one row for today, the latest value)
    for (const path of ['/products?tab=daily-rates', '/daily-rates']) {
      await page.goto(path);
      const t2 = page.getByRole('region', { name: 'Daily rates' });
      await t2.getByPlaceholder('Search a product or grade…').fill(grade);
      const r2 = t2.locator('tbody tr').filter({ hasText: grade });
      await expect(r2.getByLabel(/^USD per kg for/), path).toHaveValue('4.25');
      await expect(r2.getByLabel(/^INR per kg for/), path).toHaveValue('310.00');
    }
    const history = await (await api(page, 'GET', `/products/${id}/rate-history`)).json();
    expect(history.data).toHaveLength(1);
    expect(history.data[0]).toMatchObject({ ref_rate_usd: '4.25', ref_rate_inr: '310.00' });
    await page.goto('/products/Cumin%20Seeds');
    await page.getByRole('tab', { name: 'Grades' }).click();
    await expect(page.locator('tbody tr').filter({ hasText: grade })).toContainText('USD 4.25');
    expect(problems).toEqual([]);
  } finally {
    await api(page, 'DELETE', `/products/${id}?permanent=1`);
  }
});
