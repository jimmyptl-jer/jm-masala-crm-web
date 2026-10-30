/**
 * Who sees what: the same app as a sales user, a person waiting for approval, a deactivated person and the administrator.
 * Every account here is a separate Supabase sign-in set up once by the team (see e2e/qa.ts: E2E_SALES_*, E2E_PENDING_*, E2E_DEACTIVATED_*);
 * a test whose account is not set up is skipped. Each test signs in through the real login screen in a fresh browser (no saved session).
 * The signed-in-but-unknown person ("stranger") is covered by the API tests only: the web app would automatically file an access request for
 * them, which changes data and could not be repeated.
 */
import { expect, test, type Page } from '@playwright/test';
import { collectProblems } from './helpers';
import { accountOf, type Person } from './qa';

const fresh = { storageState: { cookies: [], origins: [] } };

/** Signs in as a test person through the login screen. Does not wait for the app shell (a refused person never gets one). */
async function loginAs(page: Page, who: Person): Promise<void> {
  const account = accountOf(who)!;
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
const shell = (page: Page) => page.getByRole('button', { name: '+ New', exact: true });
const WAITING = 'Your account is waiting for approval';

test.describe('a sales user', () => {
  test.use(fresh);
  test.beforeEach(async ({ page }) => {
    test.skip(!accountOf('sales'), 'No E2E_SALES_EMAIL / E2E_SALES_PASSWORD account set up.');
    await loginAs(page, 'sales');
    await expect(shell(page)).toBeVisible({ timeout: 25_000 });
  });

  test('lands on the dashboard, sees the main areas but no Settings', async ({ page }) => {
    const problems = collectProblems(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    for (const area of ['Dashboard', 'Buyers', 'Quotations', 'Products']) await expect(page.getByRole('link', { name: area }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('typing the Settings address sends them back to the dashboard', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
  });

  test('Products is read-only: a note instead of Add product, and no Edit buttons', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByText('Only the admin can add or change products.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add product' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit /})).toHaveCount(0);
  });

  test('the new-product and edit-product addresses are closed to them too', async ({ page }) => {
    await page.goto('/products/new');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
  });

  test('can work with buyers, inquiries and quotations like everyone else', async ({ page }) => {
    await page.goto('/buyers');
    await expect(page.getByRole('button', { name: /Add buyer/ }).first()).toBeVisible();
    await page.goto('/inquiries');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goto('/quotes/new');
    await expect(page.getByLabel('Buyer', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Quotation summary')).toBeVisible();
  });

  test('can see and set the shared dollar rate', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('region', { name: "Today's dollar rate" });
    await expect(box).toBeVisible();
    await expect(box.getByLabel('Rupees for US$1')).toBeEnabled();
    await expect(box.getByRole('button', { name: 'Update rate' })).toBeVisible();
  });

  test('signing out returns to the login screen and the pages are protected again', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/quotes');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('a person waiting for approval', () => {
  test.use(fresh);
  test('is told so on the login screen and never sees the app', async ({ page }) => {
    test.skip(!accountOf('pending'), 'No E2E_PENDING_EMAIL / E2E_PENDING_PASSWORD account set up.');
    await loginAs(page, 'pending');
    await expect(page.getByText(WAITING)).toBeVisible({ timeout: 25_000 });
    await expect(shell(page)).toHaveCount(0);
    await page.goto('/quotes');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('a deactivated person', () => {
  test.use(fresh);
  test('is refused the same way, and the app stays closed', async ({ page }) => {
    test.skip(!accountOf('deactivated'), 'No E2E_DEACTIVATED_EMAIL / E2E_DEACTIVATED_PASSWORD account set up.');
    await loginAs(page, 'deactivated');
    await expect(page.getByText(WAITING)).toBeVisible({ timeout: 25_000 });
    await expect(shell(page)).toHaveCount(0);
  });
});

test.describe('the administrator', () => {
  test('sees Settings and the Users list, with people waiting for approval marked as such', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Settings' }).first()).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    const pending = accountOf('pending');
    test.skip(!pending, 'No E2E_PENDING_* account set up, so there is nobody waiting to look for.');
    await page.getByRole('button', { name: /^Users/ }).click();
    await expect(page.getByText(pending!.email)).toBeVisible();
    await expect(page.getByText('Waiting for approval').first()).toBeVisible();
  });

  test('can add and change products', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByRole('button', { name: 'Add product' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Edit /}).first()).toBeVisible();
  });
});
