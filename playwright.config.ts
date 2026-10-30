/**
 * End-to-end tests: a real Chrome drives the real web app against the real API and Supabase sign-in. Needs the web app (E2E_BASE_URL,
 * default http://localhost:5173) and the API (E2E_API_URL, default http://localhost:3000/api/v1) running, and E2E_EMAIL / E2E_PASSWORD:
 * an administrator's Supabase sign-in (use a test account).
 *   npm run e2e         opens a visible Chrome window and runs every test in it, slowed down a little (E2E_SLOWMO, default 250 ms)
 *   npm run e2e:fast    the same tests, headless and at full speed
 *   npm run e2e:report  opens the HTML report with a screenshot per test
 * The quotation test that really e-mails a quotation to the buyer only runs when E2E_SEND=1 (it uses up a quotation number and sends an
 * e-mail each time). Tests that create buyers, inquiries and products archive them again at the end (quotations cannot be removed).
 */
import { defineConfig } from '@playwright/test';

const visible = process.argv.includes('--headed');

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  outputDir: 'e2e-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    channel: 'chrome',
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? (visible ? 250 : 0)) },
    viewport: { width: 1366, height: 800 },
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'public', testMatch: /public\.spec\.ts/ },
    // black-box tests of the API itself, no browser page: permissions, money rules, security, the PDF, speed (e2e/api/)
    { name: 'api', testMatch: /api[\\/].*\.spec\.ts/ },
    { name: 'app', testIgnore: [/auth\.setup\.ts/, /public\.spec\.ts/, /api[\\/].*\.spec\.ts/], dependencies: ['setup', 'public'], use: { storageState: 'e2e/.auth/state.json' } },
  ],
});
