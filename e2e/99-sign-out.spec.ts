/** Runs last: signing out ends the session (Supabase signs out everywhere, which is why this file is the last one). */
import { expect, test } from '@playwright/test';

test('signing out returns to the login screen and protects the pages again', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/buyers');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
