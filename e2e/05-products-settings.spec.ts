/** Products (the 13-product catalogue), settings (users) and the API behind the screens. */
import { expect, test } from '@playwright/test';
import { api, collectProblems } from './helpers';

const CATALOGUE = ['Cumin Seeds', 'Coriander Seeds', 'Fennel Seeds', 'Fenugreek Seeds', 'Mustard Seeds', 'Sesame Seeds', 'Ajwain Seeds', 'Psyllium Husk (Isabgol)', 'Turmeric', 'Turmeric Powder', 'Red Chili Powder', 'Dry Ginger Slices', 'Dry Ginger Powder'];

test('the Products page shows all 13 catalogue products and marks the drafts', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/products');
  for (const name of CATALOGUE) await expect(page.getByText(name, { exact: true }).first(), name).toBeVisible();
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Black Pepper')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('a product opens its edit page with a Status choice (draft or active)', async ({ page }) => {
  await page.goto(`/products/${encodeURIComponent('Sesame Seeds')}/edit`);
  const status = page.getByLabel('Status', { exact: true });
  await expect(status).toBeVisible();
  await expect(status.locator('option')).toHaveText(['Active', 'Draft (not offered on quotations yet)']);
});

test('the product API refuses products outside the catalogue and the old Psyllium name', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Black Pepper', 'Psyllium']) {
    const res = await api(page, 'POST', '/products', { name, gst_rate: '5' });
    expect(res.status(), name).toBe(400);
    expect((await res.json()).error.fields.name).toBeTruthy();
  }
  const products = (await (await api(page, 'GET', '/products')).json()).data as { name: string; category: string }[];
  expect(new Set(products.map((p) => p.name))).toEqual(new Set(CATALOGUE));
  expect(products.every((p) => p.category)).toBe(true);
});

test('Settings > Users lists the people with access and their roles', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/settings');
  await page.getByRole('button', { name: /^Users/ }).click();
  await expect(page.getByText('jimmyptl46@gmail.com')).toBeVisible();
  await expect(page.getByText('jimmyptl25@gmail.com')).toBeVisible();
  await expect(page.getByText('Admin', { exact: true }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('the API behind the screens answers for the signed-in administrator', async ({ page }) => {
  await page.goto('/');
  expect((await (await api(page, 'GET', '/me')).json()).role).toBe('admin');
  for (const [path, min] of [['/buyers', 6], ['/inquiries', 3], ['/quotes', 6], ['/products', 13], ['/users', 2]] as const) {
    const res = await api(page, 'GET', path);
    expect(res.status(), path).toBe(200);
    expect((await res.json()).data.length, path).toBeGreaterThanOrEqual(min);
  }
});
