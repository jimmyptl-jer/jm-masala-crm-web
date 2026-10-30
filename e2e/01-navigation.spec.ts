/** The app shell: every menu entry opens its page, with no errors, no failed API calls and the signed-in person shown. */
import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';

const PAGES: [path: string, heading: string | RegExp][] = [
  ['/', /Good (morning|afternoon|evening)/],
  ['/pipeline', 'Buyer pipeline'],
  ['/buyers', 'Buyers'],
  ['/inquiries', 'Inquiries'],
  ['/quotes', 'Quotations'],
  ['/follow-ups', 'Follow-ups'],
  ['/products', 'Products & Pricing'],
  ['/orders', 'Orders'],
  ['/settings', 'Settings'],
  ['/quotes/template', 'Quotation template'],
  ['/inquiries/new', 'New inquiry'],
  ['/partners', 'Partners & Suppliers'],
];

const newButton = (page: import('@playwright/test').Page) => page.getByRole('button', { name: '+ New', exact: true });

test('every page opens without errors', async ({ page }) => {
  const problems = collectProblems(page);
  for (const [path, heading] of PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first(), path).toContainText(heading);
  }
  expect(problems).toEqual([]);
});

test('the menu shows who is signed in and links to each area', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const label of ['Dashboard', 'Buyer Pipeline', 'Buyers', 'Inquiries', 'Quotations', 'Follow-ups', 'Products & Pricing', 'Partners & Suppliers', 'Orders']) {
    await expect(nav.getByRole('link', { name: new RegExp(`^${label.replace('&', '\\&')}`) }), label).toBeVisible();
  }
  await expect(page.getByText('Jimmy Patel').first()).toBeVisible();
  await nav.getByRole('link', { name: /^Inquiries/ }).click();
  await expect(page).toHaveURL(/\/inquiries$/);
  await nav.getByRole('link', { name: /^Buyers/ }).click();
  await expect(page).toHaveURL(/\/buyers$/);
});

test('the "+ New" menu offers a quotation, a buyer, an inquiry and a partner, and each one works', async ({ page }) => {
  await page.goto('/');
  await newButton(page).click();
  await expect(page.getByRole('menuitem')).toHaveText(['New quotation', 'Add buyer', 'New inquiry', 'Add partner']);
  await page.getByRole('menuitem', { name: 'New inquiry' }).click();
  await expect(page).toHaveURL(/\/inquiries\/new$/);
  await newButton(page).click();
  await page.getByRole('menuitem', { name: 'New quotation' }).click();
  await expect(page).toHaveURL(/\/quotes\/new$/);
  await newButton(page).click();
  await page.getByRole('menuitem', { name: 'Add buyer' }).click();
  await expect(page).toHaveURL(/\/buyers/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await newButton(page).click();
  await page.getByRole('menuitem', { name: 'Add partner' }).click();
  await expect(page).toHaveURL(/\/partners/);
  await expect(page.getByRole('dialog')).toContainText('Add partner');
});
