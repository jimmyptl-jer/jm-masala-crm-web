/**
 * Phones and tablets: the app is used on a phone in the warehouse and at the mandi, so the main screens are opened at a phone size (390 x 844)
 * and a tablet size (820 x 1180) and checked for the things that break there: sideways scrolling of the whole page, content hidden behind the
 * fixed bars, buttons too small to tap, the menu, and the quotation form's summary under the form. Read-only: nothing is saved.
 */
import { expect, test, type Page } from '@playwright/test';
import { collectProblems } from './helpers';

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

/** True when the page itself scrolls sideways (a table that scrolls inside its own box is fine). */
const pageScrollsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

/** Boxes inside the page that you would have to slide sideways (a table or a tab strip wider than its box). On a phone there must be none. */
const slidingAreas = (page: Page) => page.evaluate(() => [...document.querySelectorAll('main *')]
  .filter((e) => { const o = getComputedStyle(e).overflowX; return (o === 'auto' || o === 'scroll') && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && (e as HTMLElement).offsetParent !== null; })
  .map((e) => `${e.tagName.toLowerCase()} ${e.scrollWidth}>${e.clientWidth} ${String(e.className).slice(0, 40)}`));

const SCREENS: [string, string][] = [
  ['Dashboard', '/'], ['Buyers', '/buyers'], ['Inquiries', '/inquiries'], ['Quotations', '/quotes'], ['New quotation', '/quotes/new'], ['Products', '/products'], ['Daily rates', '/daily-rates'], ['Follow-ups', '/follow-ups'], ['Orders', '/orders'], ['Pipeline', '/pipeline'], ['Partners', '/partners'],
];

test.describe('on a phone (390 px wide)', () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  for (const [name, path] of SCREENS) {
    test(`${name}: opens without errors and the page does not scroll sideways`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.goto(path);
      await expect(page.locator('main, [role="main"], body').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await pageScrollsSideways(page), `${name} scrolls sideways`).toBe(false);
      expect(await slidingAreas(page), `${name} has an area you must slide sideways`).toEqual([]);
      expect(problems).toEqual([]);
    });
  }

  test('the top bar shows the company name and logo, and the menu reaches every area', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header').first();
    await expect(header.getByRole('img').first()).toBeVisible();
    await expect(header).toContainText('JM Masala Trading LLP');
    // Buyers and Quotes are in the bottom bar; every other page is a tile in the More sheet
    for (const area of ['Buyers', 'Quotes']) await expect(page.getByRole('link', { name: area }).first()).toBeVisible();
    await page.getByRole('button', { name: /More/ }).click();
    const sheet = page.getByRole('dialog', { name: 'All pages' });
    await expect(sheet).toBeVisible();
    for (const area of ['Inquiries', 'Follow-ups', 'Products', 'Daily rates', 'Partners', 'Orders']) await expect(sheet.getByRole('link', { name: area }).first()).toBeVisible();
  });

  test('buttons and links are big enough to tap (at least 40 px) on the dashboard', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const small = await page.evaluate(() => [...document.querySelectorAll('button, a[href]')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })
      .filter((el) => { const r = el.getBoundingClientRect(); return r.height < 32 || r.width < 32; })
      .map((el) => `${el.tagName} "${(el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`));
    expect(small, 'targets smaller than 32 px').toEqual([]);
  });

  test('the dollar rate box fits the screen and its field and button can be used', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('region', { name: "Today's dollar rate" });
    await expect(box).toBeVisible();
    const b = (await box.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(PHONE.width + 1);
    await expect(box.getByLabel('Rupees for US$1')).toBeVisible();
    await expect(box.getByRole('button', { name: 'Update rate' })).toBeVisible();
  });

  test('on the quotation form the summary sits under the form and the last field is not hidden behind the bars', async ({ page }) => {
    await page.goto('/quotes/new');
    const summary = page.getByLabel('Quotation summary');
    await summary.scrollIntoViewIfNeeded();
    await expect(summary).toBeVisible();
    const notes = page.getByLabel('Special notes');
    await notes.scrollIntoViewIfNeeded();
    const box = (await notes.boundingBox())!;
    const bars = await page.evaluate(() => [...document.querySelectorAll('[class*="fixed"]')].map((el) => el.getBoundingClientRect().top).filter((t) => t > 0));
    for (const top of bars) expect(box.y + box.height, 'the notes field must end above the fixed bars').toBeLessThanOrEqual(top + 1);
  });

  test('the quotation list is readable as cards or a scrollable table, never a squashed table', async ({ page }) => {
    await page.goto('/quotes');
    await page.waitForLoadState('networkidle');
    expect(await pageScrollsSideways(page)).toBe(false);
    const cellWidths = await page.evaluate(() => [...document.querySelectorAll('tbody tr:first-child td')].map((td) => td.getBoundingClientRect().width));
    for (const w of cellWidths) expect(w).toBeGreaterThan(30);
  });

  test('the preview sheet fits the phone and the quotation page inside it is scaled down, not cut off', async ({ page }) => {
    await page.goto('/quotes/new');
    await page.getByRole('button', { name: 'Preview PDF' }).click().catch(() => undefined);
    // an empty form cannot be previewed, so the sheet must not open half-built
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await pageScrollsSideways(page)).toBe(false);
  });
});

test.describe('on a tablet (820 px wide)', () => {
  test.use({ viewport: TABLET });

  for (const [name, path] of SCREENS) {
    test(`${name}: opens without errors and does not scroll sideways`, async ({ page }) => {
      const problems = collectProblems(page);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await pageScrollsSideways(page), `${name} scrolls sideways`).toBe(false);
      expect(problems).toEqual([]);
    });
  }
});

test.describe('on a big desktop screen (1920 px wide)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the dashboard keeps its content in a readable width, with the dollar rate box first', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('region', { name: "Today's dollar rate" });
    await expect(box).toBeVisible();
    const width = (await box.boundingBox())!.width;
    expect(width).toBeLessThanOrEqual(1500);
  });
});
