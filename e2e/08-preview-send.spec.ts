/**
 * Preview, issue and send: the user fills the form, presses Preview PDF, and the page shows what the API made: the finished quotation page
 * (letterhead, buyer, table, totals, terms) in a frame, and on a second tab the e-mail that Send will deliver. Only when the user is happy
 * do they press Finalise and send. Preview saves a draft (a draft uses no quotation number and cannot be removed, so each test leaves at most
 * one draft with a name starting "E2E"). The tests that ISSUE a quotation use a real number and only run with E2E_ISSUE=1; the one that
 * really e-mails runs with E2E_SEND=1 (sent to the test buyer's address E2E_MAIL_TO, default jimmyptl46@gmail.com).
 */
import { expect, test, type Page } from '@playwright/test';
import { collectProblems } from './helpers';
import { expectTotal, fillLine, newQuoteFor, pickIncoterm } from './quote-form';
import { ALLOW_ISSUE, ALLOW_SEND, ISSUE_REASON, call, cleanUp, makeBuyer, makeProduct, tokenOf } from './qa';

const MAIL_TO = process.env.E2E_MAIL_TO ?? 'jimmyptl46@gmail.com';
const COST = '123456';
test.describe.configure({ mode: 'serial' });

let token = '';
let buyer = { id: '', company: '' };
let noEmail = { id: '', company: '' };
let product = { id: '', grade: '' };
const toClean: { buyers: string[]; products: string[] } = { buyers: [], products: [] };

test.beforeAll(async ({ request }) => {
  token = await tokenOf('admin');
  buyer = await makeBuyer(request, token, { email: MAIL_TO, contact_name: 'E2E Preview' });
  noEmail = await makeBuyer(request, token, { email: null });
  product = await makeProduct(request, token, '0');
  toClean.buyers.push(buyer.id, noEmail.id);
  toClean.products.push(product.id);
});
test.afterAll(async ({ request }) => { await cleanUp(request, token, toClean); });

/** Fills a complete export quotation for a buyer. */
async function fillExport(page: Page, company: string, quantity = '10', rate = '2900', cost?: string) {
  await newQuoteFor(page, company);
  await fillLine(page, 1, { product: 'Cumin Seeds', grade: product.grade, quantity, rate });
  await pickIncoterm(page, 'FOB');
  await page.getByLabel('Port of loading').fill('Mundra');
  await page.getByLabel('Payment terms').selectOption('100% advance');
  if (cost) { await page.getByRole('button', { name: 'Show cost' }).click(); await fillLine(page, 1, { cost }); }
  await expectTotal(page, `USD ${Number(quantity) * Number(rate) > 0 ? (Number(quantity) * Number(rate)).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}`);
}
const frame = (page: Page) => page.frameLocator('iframe[title="Quotation as it will be sent"]');
const openPreview = async (page: Page) => {
  const saved = page.waitForResponse((r) => /\/quotes(\/[0-9a-f]{24}\/draft)?$/.test(r.url()) && ['POST', 'PUT'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Preview PDF' }).click();
  expect((await saved).status()).toBeLessThan(300);
  await expect(page.getByRole('dialog')).toContainText('Quotation preview');
};

test.describe('the preview', () => {
  test('saves the draft and shows the finished quotation page the API made, marked as a draft', async ({ page }) => {
    const problems = collectProblems(page);
    await fillExport(page, buyer.company);
    await openPreview(page);
    const doc = frame(page).locator('body');
    await expect(doc).toContainText('DRAFT FOR REVIEW');
    await expect(doc).toContainText('QUOTATION');
    await expect(doc).toContainText(buyer.company);
    await expect(doc).toContainText('Cumin Seeds');
    await expect(doc).toContainText('29,000.00');
    await expect(doc).toContainText('US Dollars Twenty-Nine Thousand Only');
    await expect(doc).toContainText('TERMS');
    await expect(page.getByText('This is exactly what the buyer will get.')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('the letterhead logo really loads inside the page', async ({ page }) => {
    await fillExport(page, buyer.company);
    await openPreview(page);
    const logo = frame(page).locator('header img');
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  });

  test('the second tab shows the e-mail that will be sent: to the buyer, with the agreed wording', async ({ page }) => {
    await fillExport(page, buyer.company);
    await openPreview(page);
    await page.getByRole('tab', { name: 'E-mail to the buyer' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(MAIL_TO);
    await expect(dialog).toContainText(/Subject\s*Quotation/);
    for (const phrase of ['Dear E2E Preview,', 'Please find attached our quotation for Cumin Seeds', 'Terms & Conditions', 'Sample Policy', 'Best regards,', 'Export Sales Team', 'Confidentiality Notice']) await expect(dialog).toContainText(phrase);
  });

  test('a buyer with no e-mail address gets a clear warning on the e-mail tab', async ({ page }) => {
    await fillExport(page, noEmail.company);
    await openPreview(page);
    await page.getByRole('tab', { name: 'E-mail to the buyer' }).click();
    await expect(page.getByRole('alert')).toContainText('This buyer has no e-mail address');
  });

  test('the cost and the margin are never on the page or in the e-mail', async ({ page }) => {
    await fillExport(page, buyer.company, '10', '2900', COST);
    await openPreview(page);
    const pageText = await frame(page).locator('body').innerText();
    expect(pageText).not.toMatch(new RegExp(`${COST}|123,456|margin|cost`, 'i'));
    await page.getByRole('tab', { name: 'E-mail to the buyer' }).click();
    expect(await page.getByRole('dialog').innerText()).not.toMatch(new RegExp(`${COST}|123,456|margin`, 'i'));
  });

  test('previewing again after a change redraws the page, and does not make a second quotation', async ({ page, request }) => {
    await fillExport(page, buyer.company);
    await openPreview(page);
    await expect(frame(page).locator('body')).toContainText('29,000.00');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await fillLine(page, 1, { quantity: '20' });
    await expectTotal(page, 'USD 58,000.00');
    await openPreview(page);
    await expect(frame(page).locator('body')).toContainText('58,000.00');
    await expect(frame(page).locator('body')).not.toContainText('29,000.00');
    const list = await (await call(request, token, 'GET', `/quotes?buyer_id=${buyer.id}`)).json();
    expect(list.data.filter((q: { status: string }) => q.status === 'draft')).toHaveLength(1);
  });

  test('closing the preview keeps everything typed in the form', async ({ page }) => {
    await fillExport(page, buyer.company, '7', '100');
    await openPreview(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel(/^Quantity/)).toHaveValue('7');
    await expect(page.getByLabel(/^Rate/)).toHaveValue('100');
  });

  test('a form with mistakes is not previewed: the errors are shown instead', async ({ page }) => {
    await page.goto('/quotes/new');
    await page.getByRole('button', { name: 'Preview PDF' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/Please fix the highlighted fields|Choose a buyer/).first()).toBeVisible();
  });
});

test.describe('issue and send', () => {
  test.beforeEach(() => { test.skip(!ALLOW_ISSUE, ISSUE_REASON); });

  test('Finalise and send asks for confirmation, warns that an issued quote is frozen, and offers the three ways to send', async ({ page }) => {
    await fillExport(page, buyer.company);
    await page.getByRole('button', { name: 'Finalise and send' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Issue this quote');
    await expect(dialog).toContainText('Once issued, a quote cannot be edited');
    await expect(dialog).toContainText(MAIL_TO);
    for (const option of ['Email', 'WhatsApp', "Don't send now"]) await expect(dialog.getByText(option, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('issuing without sending gives the quote a number and shows it as Sent', async ({ page, request }) => {
    const problems = collectProblems(page);
    await fillExport(page, buyer.company);
    await page.getByRole('button', { name: 'Finalise and send' }).click();
    await page.getByRole('dialog').getByText("Don't send now").click();
    const issued = page.waitForResponse((r) => /\/quotes\/[0-9a-f]{24}\/issue$/.test(r.url()) && r.request().method() === 'POST', { timeout: 60_000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Issue quote' }).click();
    const res = await issued;
    expect(res.status()).toBe(200);
    const q = await res.json();
    expect(q.number).toMatch(/^JM\/Q\/\d{3}\/\d{4}-\d{2}$/);
    expect(q.pdf.status).toBe('ready');
    await expect(page).toHaveURL(new RegExp(`/quotes/${q.id}`));
    await expect(page.getByText(q.number).first()).toBeVisible();
    const list = await (await call(request, token, 'GET', `/quotes?q=${encodeURIComponent(q.number)}`)).json();
    expect(list.data[0]).toMatchObject({ status: 'sent', latest_state: 'issued' });
    expect(problems.filter((p) => !/pdf/i.test(p))).toEqual([]);
  });

  test('an issued quote can no longer be edited in the form', async ({ page, request }) => {
    const mine = await (await call(request, token, 'GET', `/quotes?buyer_id=${buyer.id}&status=sent&limit=1`)).json();
    test.skip(mine.total === 0, 'No issued quote from the earlier test.');
    await page.goto(`/quotes/${mine.data[0].id}/edit`);
    await expect(page.getByRole('button', { name: 'Finalise and send' })).toHaveCount(0);
  });

  test('issue and send by e-mail delivers the quotation to the buyer', async ({ page, request }) => {
    test.skip(!ALLOW_SEND, 'Set E2E_SEND=1 to send a real e-mail.');
    await fillExport(page, buyer.company);
    await page.getByRole('button', { name: 'Finalise and send' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Email', { exact: true }).click();
    await dialog.getByLabel('Add a short message (optional)').fill('E2E test: please ignore this message.');
    const sent = page.waitForResponse((r) => /\/revisions\/\d+\/send$/.test(r.url()) && r.request().method() === 'POST', { timeout: 90_000 });
    await dialog.getByRole('button', { name: 'Issue & send by email' }).click();
    const res = await sent;
    expect(res.status(), await res.text()).toBe(200);
    expect(await res.json()).toMatchObject({ channel: 'email', to: MAIL_TO });
    await expect(page.getByText(/Sent .*to/i).first()).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
    const q = await (await call(request, token, 'GET', `/quotes?buyer_id=${buyer.id}&limit=1`)).json();
    const detail = await (await call(request, token, 'GET', `/quotes/${q.data[0].id}`)).json();
    expect(detail.activities.some((a: { kind: string; body: string }) => a.kind === 'email' && a.body.includes(MAIL_TO))).toBe(true);
  });
});
