/**
 * Today's dollar rate: the box at the top of the dashboard. Anyone signed in can set it; the API uses it for the rupee value and the margin
 * of every quotation. The tests set the shared rate to a known value and put the earlier one back at the end.
 */
import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';
import { call, tokenOf } from './qa';

let token = '';
let before: string | null = null;
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  token = await tokenOf('admin');
  before = (await (await call(request, token, 'GET', '/fx-rate')).json()).rate;
});
test.afterAll(async ({ request }) => { if (before) await call(request, token, 'PUT', '/fx-rate', { rate: before }); });

const box = (page: import('@playwright/test').Page) => page.getByRole('region', { name: "Today's dollar rate" });

test('the box is the first thing on the dashboard, above the greeting, and says what it is', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  await expect(box(page)).toBeVisible();
  await expect(box(page)).toContainText("Today's dollar rate");
  const boxY = (await box(page).boundingBox())!.y;
  const headingY = (await page.getByRole('heading', { level: 1 }).boundingBox())!.y;
  expect(boxY).toBeLessThan(headingY);
  await expect(box(page).getByLabel('Rupees for US$1')).toBeVisible();
  await expect(box(page).getByRole('button', { name: 'Update rate' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('setting the rate shows it big with who set it, and stores it with four decimals', async ({ page, request }) => {
  await page.goto('/');
  await box(page).getByLabel('Rupees for US$1').fill('83.45');
  const saved = page.waitForResponse((r) => r.url().endsWith('/fx-rate') && r.request().method() === 'PUT');
  await box(page).getByRole('button', { name: 'Update rate' }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('Dollar rate updated')).toBeVisible();
  await expect(box(page)).toContainText('₹83.45');
  await expect(box(page)).toContainText('per US$1');
  await expect(box(page)).toContainText(/Set by .+ on /);
  const stored = await (await call(request, token, 'GET', '/fx-rate')).json();
  expect(stored).toMatchObject({ rate: '83.4500', is_today: true });
});

test('the rate is still there after a reload and after leaving the page', async ({ page }) => {
  await page.goto('/');
  await expect(box(page)).toContainText('₹83.45');
  await page.goto('/quotes');
  await page.goto('/');
  await expect(box(page)).toContainText('₹83.45');
});

test('a blank, zero or impossible rate is refused on the spot with a clear message', async ({ page }) => {
  await page.goto('/');
  const input = box(page).getByLabel('Rupees for US$1');
  const posts: string[] = [];
  page.on('request', (r) => { if (r.url().endsWith('/fx-rate') && r.method() === 'PUT') posts.push(r.url()); });
  for (const value of ['', '0', '0.0000']) {
    await input.fill(value);
    await box(page).getByRole('button', { name: 'Update rate' }).click();
    await expect(box(page).getByText('Enter the rupees for one dollar, for example 83.45.')).toBeVisible();
  }
  expect(posts).toEqual([]);
});

test('the field only takes numbers with up to four decimals', async ({ page }) => {
  await page.goto('/');
  const input = box(page).getByLabel('Rupees for US$1');
  await input.fill('');
  await input.pressSequentially('abc-8x3.4567891');
  await expect(input).toHaveValue('83.4567');
  await input.fill('');
  await input.pressSequentially('84,5'); // some phone keyboards type a comma
  await expect(input).toHaveValue('84.5');
});

test('changing the rate twice in a row works, and the latest value is the one shown', async ({ page }) => {
  await page.goto('/');
  await box(page).getByLabel('Rupees for US$1').fill('90');
  await box(page).getByRole('button', { name: 'Update rate' }).click();
  await expect(box(page)).toContainText('₹90');
  await box(page).getByLabel('Rupees for US$1').fill('83.45');
  await box(page).getByRole('button', { name: 'Update rate' }).click();
  await expect(box(page)).toContainText('₹83.45');
});
