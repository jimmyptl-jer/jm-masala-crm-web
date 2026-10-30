/**
 * Partners & Suppliers: the directory page, the add form's checks, and the whole life of one partner (add with two roles, open the profile,
 * add a contact, a service with a rate and a document that expires soon, log an activity, edit, filter, archive and restore). The test partner
 * is archived afterwards (partners are never deleted). Rates are shown because the test account is an administrator; that a sales user never
 * receives them is proved by the API tests (api/test/partners.test.ts).
 */
import { expect, test } from '@playwright/test';
import { fakePartner } from './fake';
import { api, collectProblems, expectText } from './helpers';

test('the partners page is in the menu and shows the directory with its filters and columns', async ({ page }) => {
  const problems = collectProblems(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Partners & Suppliers/ }).click();
  await expect(page).toHaveURL(/\/partners$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Partners & Suppliers');
  await expect(page.getByLabel('Role', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Status', { exact: true })).toBeVisible();
  await expect(page.getByText(/match your view/)).toBeVisible(); // the list has loaded
  const empty = page.getByText('No partners yet');
  if (await empty.isVisible()) return expect(problems).toEqual([]); // a fresh database has none; the lifecycle test below adds one
  for (const col of ['Partner ID', 'Company', 'Roles', 'Primary contact', 'Phone / WhatsApp', 'City / State', 'Products / services', 'Last interaction', 'Status', 'Actions']) {
    await expect(page.locator('thead th', { hasText: col }).first(), col).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test('the add form checks its input before it saves', async ({ page }) => {
  await page.goto('/partners?new=1');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Add partner');
  await sheet.getByRole('button', { name: 'Save partner' }).click();
  await expect(sheet.getByText('Enter the company name.')).toBeVisible();
  await expect(sheet.getByText('Choose at least one role.')).toBeVisible();
  await expect(page).toHaveURL(/\/partners$/); // the "new" flag is taken off the address and nothing was saved
});

test('a partner with two roles can be added, filled in, logged, edited, archived and restored', async ({ page }) => {
  const problems = collectProblems(page);
  const p = fakePartner();
  const expires = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  let id: string | undefined;
  const sheet = page.getByRole('dialog');
  try {
    // --- add
    await page.goto('/partners');
    await page.getByRole('button', { name: 'Add partner' }).first().click();
    await sheet.getByLabel('Company name').fill(p.company_name);
    await sheet.getByRole('button', { name: 'Supplier', exact: true }).click();
    await sheet.getByRole('button', { name: 'Processor', exact: true }).click();
    await sheet.getByLabel(/^City/).fill(p.city);
    await sheet.getByLabel(/^State/).fill(p.state);
    await sheet.getByLabel(/^Phone/).fill(p.phone);
    const created = page.waitForResponse((r) => /\/partners$/.test(r.url()) && r.request().method() === 'POST');
    await sheet.getByRole('button', { name: 'Save partner' }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string; partner_code: string };
    id = body.id;
    expect(body.partner_code).toMatch(/^PTY-\d{4}$/);

    // --- the profile opens with the roles and the status
    await expect(page).toHaveURL(new RegExp(`/partners/${id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.company_name);
    await expectText(page.locator('header.card'), [body.partner_code, 'Supplier', 'Processor', 'Active']);

    // --- a contact (the first one is the primary contact)
    await page.getByRole('button', { name: 'Add contact' }).click();
    await sheet.getByLabel('Name', { exact: true }).fill(p.contact_name);
    await sheet.getByLabel(/^Designation/).fill(p.designation);
    await sheet.getByLabel(/^Phone/).fill(p.phone);
    const contactSaved = page.waitForResponse((r) => r.url().endsWith(`/partners/${id}`) && r.request().method() === 'PATCH');
    await sheet.getByRole('button', { name: 'Save contact' }).click();
    expect((await contactSaved).status()).toBe(200);
    await expectText(page.getByRole('region', { name: 'Contacts' }), [p.contact_name, p.designation, 'Primary']);

    // --- a service with a rate (administrator) and a document that expires in 10 days
    await page.getByRole('button', { name: 'Add service' }).first().click();
    await sheet.getByLabel('Role', { exact: true }).selectOption('supplier');
    await sheet.getByLabel(/^Service\s*(\(optional\))?$/).fill(`${p.offering} sourcing`);
    await sheet.getByLabel(/^Products supplied/).fill(p.offering);
    await sheet.getByLabel(/^Lead time/).fill('10');
    await sheet.getByLabel(/^Rate(?! unit)/).fill('2850');
    await sheet.getByLabel('Currency').selectOption('USD');
    await sheet.getByLabel(/^Rate unit/).selectOption('per_ton');
    await sheet.getByLabel(/^Payment terms/).fill('30% advance');
    await sheet.getByRole('button', { name: 'Add document' }).click();
    await sheet.getByLabel('Document', { exact: true }).fill('FSSAI licence');
    await sheet.getByLabel(/^Expires on/).fill(expires);
    const serviceSaved = page.waitForResponse((r) => r.url().endsWith(`/partners/${id}`) && r.request().method() === 'PATCH');
    await sheet.getByRole('button', { name: 'Save service' }).click();
    expect((await serviceSaved).status()).toBe(200);
    const services = page.getByRole('region', { name: 'Services' });
    await expectText(services, [`${p.offering} sourcing`, 'USD 2,850.00 per ton', '30% advance', 'FSSAI licence', 'Expires soon']);

    // --- log an activity
    await page.getByRole('button', { name: 'Log activity' }).first().click();
    await sheet.getByLabel('What happened').selectOption('meeting');
    await sheet.getByLabel('Note', { exact: true }).fill('Visited the godown and agreed the first lot.');
    const logged = page.waitForResponse((r) => r.url().endsWith(`/partners/${id}/activities`) && r.request().method() === 'POST');
    await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await logged).status()).toBe(201);
    await expectText(page.getByRole('region', { name: 'Activity' }), ['Meeting', 'Visited the godown and agreed the first lot.']);

    // --- edit the company: a new status
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await sheet.getByLabel('Status', { exact: true }).selectOption('under_review');
    const edited = page.waitForResponse((r) => r.url().endsWith(`/partners/${id}`) && r.request().method() === 'PATCH');
    await sheet.getByRole('button', { name: 'Save partner' }).click();
    expect((await edited).status()).toBe(200);
    await expect(page.locator('header.card')).toContainText('Under review');

    // --- the stored partner has everything
    const stored = await (await api(page, 'GET', `/partners/${id}`)).json();
    expect(stored).toMatchObject({ status: 'under_review', roles: ['supplier', 'processor'], city: p.city, activity_count: 1 });
    expect(stored.contacts).toHaveLength(1);
    expect(stored.services[0]).toMatchObject({ rate_amount: '2850.00', rate_unit: 'per_ton', documents: [{ name: 'FSSAI licence', expires_at: expires }] });

    // --- the list shows it, and the role filter finds it
    await page.goto('/partners');
    await page.getByPlaceholder(/Search by name/).fill(p.company_name);
    const row = page.locator('tbody tr').filter({ hasText: p.company_name });
    await expectText(row, [body.partner_code, 'Supplier', 'Processor', p.contact_name, p.city, 'Under review']);
    await page.getByLabel('Role', { exact: true }).selectOption('processor');
    await expect(row).toHaveCount(1);
    await page.getByLabel('Role', { exact: true }).selectOption('transporter');
    await expect(row).toHaveCount(0);

    // --- archive, then restore
    await page.goto(`/partners/${id}`);
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('This partner is archived.')).toBeVisible();
    await page.goto('/partners');
    await page.getByPlaceholder(/Search by name/).fill(p.company_name);
    await expect(page.locator('tbody tr').filter({ hasText: p.company_name })).toHaveCount(0);
    await page.goto(`/partners/${id}`);
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.getByText('This partner is archived.')).toHaveCount(0);
    expect(problems).toEqual([]);
  } finally {
    if (id) await api(page, 'DELETE', `/partners/${id}`); // partners are archived, never deleted
  }
});

test('a second partner with the same company name is refused', async ({ page }) => {
  const p = fakePartner();
  let id: string | undefined;
  try {
    await page.goto('/partners');
    const first = await api(page, 'POST', '/partners', { company_name: p.company_name, roles: ['supplier'] });
    expect(first.status()).toBe(201);
    id = (await first.json()).id;
    await page.getByRole('button', { name: 'Add partner' }).first().click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Company name').fill(p.company_name.toUpperCase());
    await sheet.getByRole('button', { name: 'Supplier', exact: true }).click();
    await sheet.getByRole('button', { name: 'Save partner' }).click();
    await expect(sheet.getByText('This company is already in your partner list.')).toBeVisible();
  } finally {
    if (id) await api(page, 'DELETE', `/partners/${id}`);
  }
});
