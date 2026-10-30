/**
 * Helpers that drive the quotation form (/quotes/new): choose a buyer, fill a product line, pick the Incoterm, read the totals panel.
 * The labels are the ones in web/src/strings/quoteForm.ts; if a label changes there, change it here.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** The sticky totals panel on the right of the form ("Quotation summary"): total, subtotal, GST, rupee value, margin. */
export const summary = (page: Page): Locator => page.getByLabel('Quotation summary');

/** Opens a new quotation and picks the buyer by company name. */
export async function newQuoteFor(page: Page, company: string): Promise<void> {
  await page.goto('/quotes/new');
  await page.getByLabel('Buyer', { exact: true }).click();
  const picker = page.getByRole('dialog');
  await picker.locator('input').first().fill(company);
  await picker.getByRole('option').filter({ hasText: company }).click();
}

/** The card of product line n (1 is the first). */
export const line = (page: Page, n = 1): Locator => page.getByRole('group', { name: `Product ${n}`, exact: true });

/** Fills one product line: product name, the grade (by its label), quantity and rate. Leave `grade` out to keep the default. */
export async function fillLine(page: Page, n: number, v: { product?: string; grade?: string; quantity?: string; rate?: string; cost?: string }): Promise<void> {
  const card = line(page, n);
  if (v.product) await card.getByLabel('Product', { exact: true }).selectOption(v.product);
  if (v.grade) await card.getByLabel('Grade', { exact: true }).selectOption({ label: v.grade });
  if (v.quantity !== undefined) await card.getByLabel(/^Quantity/).fill(v.quantity);
  if (v.rate !== undefined) await card.getByLabel(/^Rate/).fill(v.rate);
  if (v.cost !== undefined) await card.getByLabel(/^Your cost/).fill(v.cost);
}

/** Chooses an Incoterm (FOB, CIF, CFR, EXW) in the Terms card. */
export const pickIncoterm = (page: Page, incoterm: 'FOB' | 'CIF' | 'CFR' | 'EXW') => page.getByRole('radio', { name: incoterm, exact: true }).click();

/** Waits for the live total to show `text` (the API works it out about half a second after typing stops). */
export const expectTotal = (page: Page, text: string) => expect(summary(page)).toContainText(text, { timeout: 15_000 });
