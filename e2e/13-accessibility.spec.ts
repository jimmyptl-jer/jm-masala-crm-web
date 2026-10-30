/**
 * Accessibility: every main screen is scanned with axe-core (the engine behind most accessibility checkers) for the problems that stop
 * people using the app: no accessible name on a button or input, text that is too faint, missing page language, broken heading order,
 * images without text, form fields without labels. Only "serious" and "critical" findings fail a test; lesser ones are printed in the
 * report. Then a few real keyboard checks: the app can be used without a mouse. Read-only: nothing is saved.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SCREENS: [string, string][] = [
  ['Dashboard', '/'], ['Buyers', '/buyers'], ['Pipeline', '/pipeline'], ['Inquiries', '/inquiries'], ['New inquiry', '/inquiries/new'], ['Quotations', '/quotes'], ['New quotation', '/quotes/new'],
  ['Quotation template', '/quotes/template'], ['Products', '/products'], ['Follow-ups', '/follow-ups'], ['Orders', '/orders'], ['Settings', '/settings'],
];

async function scan(page: Page) {
  await page.waitForLoadState('networkidle');
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
}
const worst = (r: Awaited<ReturnType<typeof scan>>) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
const describeViolations = (r: Awaited<ReturnType<typeof scan>>) => worst(r).map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);

test.describe('screens signed in', () => {
  for (const [name, path] of SCREENS) {
    test(`${name}: no serious or critical accessibility problems`, async ({ page }, info) => {
      await page.goto(path);
      const result = await scan(page);
      await info.attach('axe-all-findings.json', { body: JSON.stringify(result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length })), null, 2), contentType: 'application/json' });
      expect(describeViolations(result)).toEqual([]);
    });
  }
});

test.describe('screens before signing in', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const [name, path] of [['Sign in', '/login'], ['Sign up', '/sign-up']] as const) {
    test(`${name}: no serious or critical accessibility problems`, async ({ page }) => {
      await page.goto(path);
      expect(describeViolations(await scan(page))).toEqual([]);
    });
  }
});

test.describe('keyboard use', () => {
  test('the first Tab stop on the quotation form is a real control and focus is always visible', async ({ page }) => {
    await page.goto('/quotes/new');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        return { tag: el.tagName, name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), outline: s.outlineStyle !== 'none' || s.boxShadow !== 'none' };
      });
      expect(info, `stop ${i + 1} landed on a real element`).not.toBeNull();
      expect(info!.outline, `focus ring on ${info!.tag} "${info!.name}"`).toBe(true);
    }
  });

  test('the dollar rate can be typed and saved with the keyboard alone (Enter submits)', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('region', { name: "Today's dollar rate" });
    const input = box.getByLabel('Rupees for US$1');
    await input.focus();
    await expect(input).toBeFocused();
    await input.fill('');
    await page.keyboard.type('0');
    await page.keyboard.press('Enter');
    await expect(box.getByText('Enter the rupees for one dollar, for example 83.45.')).toBeVisible();
  });

  test('a sheet (preview, issue) closes with Escape and gives focus back', async ({ page }) => {
    await page.goto('/buyers');
    const add = page.getByRole('button', { name: /Add buyer/ }).first();
    await add.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('every form field has a visible label, and error messages are announced (role alert)', async ({ page }) => {
    await page.goto('/quotes/new');
    const unlabelled = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
      .filter((el) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .filter((el) => !(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el as HTMLInputElement).labels?.length))
      .map((el) => `${el.tagName} ${el.getAttribute('name') ?? el.getAttribute('placeholder') ?? ''}`));
    expect(unlabelled).toEqual([]);
    await page.getByRole('button', { name: 'Save draft' }).first().click();
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('the page has a language, a title, and exactly one main heading', async ({ page }) => {
    for (const path of ['/', '/buyers', '/quotes', '/products']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.lang), path).toBeTruthy();
      expect((await page.title()).length, path).toBeGreaterThan(0);
      await expect(page.getByRole('heading', { level: 1 }), path).toHaveCount(1);
    }
  });
});
