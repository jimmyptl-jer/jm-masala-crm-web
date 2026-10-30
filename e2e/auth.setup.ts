/** Signs in once and saves the browser session, which the "app" tests then reuse. */
import { test as setup } from '@playwright/test';
import { signIn } from './helpers';

setup('sign in and save the session', async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: 'e2e/.auth/state.json' });
});
