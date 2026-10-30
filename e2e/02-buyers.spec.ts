/** Buyers: the demo buyers, search, and the whole life of a buyer: add, edit, save, and delete (archive). */
import { expect, test } from '@playwright/test';
import { fakeBuyer, fakePerson } from './fake';
import { api, collectProblems, expectText } from './helpers';

const DEMO_BUYERS = ['Demo Masala Traders', 'Demo Spice Importers LLC', 'Example Trading Co', 'Sample Foods GmbH', 'Sample Kirana Mart', 'Sample Wholesale Ltd'];
const newButton = (page: import('@playwright/test').Page) => page.getByRole('button', { name: '+ New', exact: true });

test('the buyer table shows the demo buyers, their readable codes and the agreed columns', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/buyers');
  for (const col of ['Buyer ID', 'Company', 'Country / city', 'Contact person', 'Phone / WhatsApp', 'Buyer type', 'Interested products', 'Lead source', 'Status', 'Assigned to', 'Last contacted', 'Next follow-up', 'Quotations', 'Actions']) {
    await expect(page.locator('thead th', { hasText: col }).first(), col).toBeVisible();
  }
  for (const name of DEMO_BUYERS) await expect(page.locator('tbody tr', { hasText: name }), name).toBeVisible();
  const codes = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
  expect(codes.length).toBeGreaterThanOrEqual(6);
  for (const code of codes) expect(code.trim()).toMatch(/^BUY-\d{4}$/);
  expect(problems).toEqual([]);
});

test('searching narrows the list; clearing brings it back', async ({ page }) => {
  await page.goto('/buyers');
  const search = page.getByPlaceholder(/Search buyers/);
  await search.fill('dubai');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('Demo Spice Importers LLC');
  await search.fill('zzzz-no-such-buyer');
  await expect(page.getByText('No buyers match these filters')).toBeVisible();
  await search.fill('');
  await expect(page.locator('tbody tr').first()).toBeVisible();
});

test('a buyer can be added, edited, saved and deleted (archived)', async ({ page }) => {
  const problems = collectProblems(page);
  const buyer = fakeBuyer();
  const company = buyer.company_name;
  const newContact = fakePerson().name;
  let id: string | undefined;
  try {
    // --- add, from the "+ New" menu
    await page.goto('/buyers');
    await newButton(page).click();
    await page.getByRole('menuitem', { name: 'Add buyer' }).click();
    const addDialog = page.getByRole('dialog', { name: 'Add buyer' });
    await expect(addDialog).toBeVisible();
    await addDialog.getByLabel('Company name').fill(company);
    await addDialog.getByLabel('Country').fill(buyer.country);
    await addDialog.getByLabel('City').fill(buyer.city);
    await addDialog.getByLabel('Contact person').fill(buyer.contact_name);
    const added = page.waitForResponse((r) => /\/buyers$/.test(r.url()) && r.request().method() === 'POST');
    await addDialog.getByRole('button', { name: 'Save buyer' }).click();
    const created = await added;
    expect(created.status()).toBe(201);
    const body = (await created.json()) as { id: string; buyer_code: string };
    id = body.id;
    expect(body.buyer_code).toMatch(/^BUY-\d{4}$/);
    await expect(addDialog).toBeHidden();

    // --- it is in the list with its code, city and contact
    await page.getByPlaceholder(/Search buyers/).fill(company);
    const row = page.locator('tbody tr', { hasText: company });
    await expect(row).toHaveCount(1);
    await expectText(row, [body.buyer_code, buyer.city, buyer.contact_name]);

    // --- edit: open the buyer, press Edit, change two fields, save
    await row.locator('td').nth(2).click();
    const drawer = page.getByRole('dialog', { name: company });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Edit', exact: true }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit buyer' });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel('City').fill('Sharjah');
    await editDialog.getByLabel('Contact person').fill(newContact);
    const edited = page.waitForResponse((r) => r.url().endsWith(`/buyers/${id}`) && r.request().method() === 'PATCH');
    await editDialog.getByRole('button', { name: 'Save buyer' }).click();
    expect((await edited).status()).toBe(200);
    await expect(editDialog).toBeHidden();

    // --- the change is stored and shown
    const stored = await (await api(page, 'GET', `/buyers/${id}`)).json();
    expect(stored).toMatchObject({ city: 'Sharjah', contact_name: newContact, company_name: company });
    await page.goto('/buyers');
    await page.getByPlaceholder(/Search buyers/).fill(company);
    await expectText(page.locator('tbody tr', { hasText: company }), ['Sharjah', newContact]);

    // --- delete (archive) from the buyer's own page, with the confirmation
    await page.goto(`/buyers/${id}`);
    await page.getByRole('button', { name: 'Archive buyer' }).click();
    await expect(page.getByText('Archive this buyer?')).toBeVisible();
    await page.getByRole('button', { name: 'Yes, archive' }).click();
    await expect(page.getByText('Buyer archived').first()).toBeVisible();
    expect((await (await api(page, 'GET', `/buyers/${id}`)).json()).archived).toBe(true);
    await page.goto('/buyers');
    await page.getByPlaceholder(/Search buyers/).fill(company);
    await expect(page.getByText('No buyers match these filters')).toBeVisible();
    expect(problems).toEqual([]);
  } finally {
    if (id) await api(page, 'DELETE', `/buyers/${id}`);
  }
});

test('"Add buyer" opens the form every time, also when already on the Buyers page', async ({ page }) => {
  await page.goto('/buyers');
  for (let round = 1; round <= 3; round++) {
    await newButton(page).click();
    await page.getByRole('menuitem', { name: 'Add buyer' }).click();
    await expect(page.getByRole('dialog'), `round ${round}`).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog'), `round ${round} closed`).toBeHidden();
  }
});

test('the form refuses a buyer without a company name', async ({ page }) => {
  await page.goto('/buyers?new=1');
  const dialog = page.getByRole('dialog', { name: 'Add buyer' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Save buyer' }).click();
  await expect(dialog.getByText(/required/i).first()).toBeVisible();
});
