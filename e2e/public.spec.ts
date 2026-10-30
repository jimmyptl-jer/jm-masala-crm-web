/** Everything a visitor who is not signed in can see and do: sign-in, sign-up, the (closed) setup page and the API's public surface. */
import { expect, test } from '@playwright/test';
import { API, creds, signIn } from './helpers';

test.describe('sign-in', () => {
  test('a visitor is sent to the login screen', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
  });

  test('empty fields and a wrong password are rejected with clear messages', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await page.getByLabel('Email').fill(creds().email);
    await page.getByLabel('Password', { exact: true }).fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText(/incorrect/i);
    await expect(page).toHaveURL(/\/login/);
  });

  test('the right password opens the dashboard for the signed-in person', async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
  });
});

test.describe('sign-up and setup pages', () => {
  test('the sign-up page checks the form before it creates anything', async ({ page }) => {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your full name.')).toBeVisible();
    await page.getByLabel('Full name').fill('E2E Nobody');
    await page.getByLabel('E-mail').fill('not-an-email');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByLabel('Repeat the password').fill('different');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter a valid e-mail address.')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
    await expect(page.getByText('The two passwords do not match.')).toBeVisible();
  });

  test('the sign-up page links back to sign-in', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('the one-time administrator page is closed now that an administrator exists', async ({ page }) => {
    await page.goto('/jm-masala-crm-create-admin-user');
    await expect(page.getByRole('heading', { name: 'Setup is already done' })).toBeVisible();
  });
});

test.describe('the API from outside', () => {
  test('health is public, everything else needs a sign-in, setup is closed', async ({ request }) => {
    const health = await request.get(API.replace('/api/v1', '') + '/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    for (const path of ['/me', '/buyers', '/inquiries', '/quotes', '/products', '/users']) expect((await request.get(`${API}${path}`)).status(), path).toBe(401);
    expect(await (await request.get(`${API}/setup/status`)).json()).toEqual({ open: false });
    expect((await request.get(`${API}/buyers`, { headers: { Authorization: 'Bearer not-a-real-token' } })).status()).toBe(401);
  });
});
