/**
 * The summary tiles at the top of Buyers, Inquiries and Partners are buttons: each one shows exactly what its number counts. These tests only
 * read: they click a tile and check the filters, the list or the page that opens.
 */
import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';

test('Buyers: Total Buyers clears the filters, Active Countries lists the countries, the quote tiles open the quotations', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/buyers');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // Total Buyers: filters off, every active buyer
  await page.getByLabel('Country', { exact: true }).selectOption({ index: 1 });
  await page.getByRole('button', { name: /^Total Buyers:/ }).click();
  await expect(page.getByLabel('Country', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('active');

  // Active Countries: a list with the number of buyers, a click filters the directory by that country
  await page.getByRole('button', { name: /^Active Countries:/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Active countries');
  const first = sheet.getByRole('button').filter({ hasText: /\d+ buyers?$/ }).first();
  const country = (await first.locator('span').first().innerText()).trim();
  await first.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Country', { exact: true })).toHaveValue(country);
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // the quotation tiles open the quotations, already filtered
  await page.getByRole('button', { name: /^Quotations Sent:/ }).click();
  await expect(page).toHaveURL(/\/quotes\?status=sent$/);
  await page.goto('/buyers');
  await page.getByRole('button', { name: /^Won Deals:/ }).click();
  await expect(page).toHaveURL(/\/quotes\?status=won$/);
  expect(problems).toEqual([]);
});

test('Inquiries: each tile shows the inquiries it counts', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/inquiries');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  const status = page.getByLabel('Status', { exact: true });

  await page.getByRole('button', { name: /^New enquiries:|^New:/ }).first().click();
  await expect(status).toHaveValue('new');
  for (const row of await page.locator('tbody tr').all()) await expect(row).toContainText('New');

  await page.getByRole('button', { name: /^Quoted:/ }).first().click();
  await expect(status).toHaveValue('quoted');
  for (const row of await page.locator('tbody tr').all()) await expect(row).toContainText('Quoted');

  await page.getByRole('button', { name: /^Open inquiries:|^Open:/ }).first().click();
  await expect(status).toHaveValue('');
  for (const row of await page.locator('tbody tr').all()) await expect(row).toContainText(/New|Reviewing/);

  await page.getByRole('button', { name: /^Follow-ups due:|^Due follow-ups:|^Due:/ }).first().click();
  await expect(page.getByRole('button', { name: 'Due follow-ups', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(problems).toEqual([]);
});

test('Partners: the tiles filter the directory', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/partners');
  await expect(page.getByText(/match your view/)).toBeVisible();
  await page.getByRole('button', { name: /^Suppliers:/ }).click();
  await expect(page.getByLabel('Role', { exact: true })).toHaveValue('supplier');
  await page.getByRole('button', { name: /^Under review:/ }).click();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('under_review');
  await expect(page.getByLabel('Role', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: /^Logistics:/ }).click();
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: /^Partners:/ }).click();
  await expect(page.getByLabel('Role', { exact: true })).toHaveValue('');
  expect(problems).toEqual([]);
});
