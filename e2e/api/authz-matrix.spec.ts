/**
 * QA, API: the permissions matrix. Every route is called by every kind of visitor and the answer is checked against the rule:
 *   no token / bad token       -> 401 unauthorized on everything behind the sign-in
 *   valid sign-in, no CRM user -> 403 forbidden
 *   pending or deactivated     -> 403 account_inactive on every route
 *   sales user                 -> everything except the admin-only routes (403 forbidden there)
 *   administrator              -> everything
 * "Allowed" means the request got past the permission check; the bodies are deliberately EMPTY or INVALID so an allowed call is refused by
 * validation (400) or finds nothing (404) and never changes data. Accounts that are not set up (see e2e/qa.ts) skip their checks.
 */
import { expect, test } from '@playwright/test';
import { API, accountOf, call, ghostId, tokenOf, type Verb } from '../qa';

interface Route { verb: Verb; path: string; adminOnly?: boolean; body?: object }
const ID = ghostId();

/** Every route behind the sign-in. `body` is sent with POST / PUT / PATCH; it is invalid on purpose where an accepted body would write. */
const PROTECTED: Route[] = [
  { verb: 'GET', path: '/me' },
  { verb: 'GET', path: '/buyers' }, { verb: 'POST', path: '/buyers' }, { verb: 'GET', path: `/buyers/${ID}` }, { verb: 'PATCH', path: `/buyers/${ID}` }, { verb: 'DELETE', path: `/buyers/${ID}` },
  { verb: 'GET', path: '/inquiries' }, { verb: 'POST', path: '/inquiries' }, { verb: 'GET', path: `/inquiries/${ID}` }, { verb: 'PATCH', path: `/inquiries/${ID}` }, { verb: 'DELETE', path: `/inquiries/${ID}` },
  { verb: 'GET', path: '/partners' }, { verb: 'POST', path: '/partners' }, { verb: 'GET', path: `/partners/${ID}` }, { verb: 'PATCH', path: `/partners/${ID}` }, { verb: 'DELETE', path: `/partners/${ID}` },
  { verb: 'POST', path: `/partners/${ID}/activities` },
  { verb: 'GET', path: '/products' }, { verb: 'GET', path: `/products/${ID}` },
  { verb: 'POST', path: '/products', adminOnly: true }, { verb: 'PATCH', path: `/products/${ID}`, adminOnly: true }, { verb: 'DELETE', path: `/products/${ID}`, adminOnly: true },
  { verb: 'GET', path: '/quotes' }, { verb: 'POST', path: '/quotes/calculate' }, { verb: 'POST', path: '/quotes' }, { verb: 'GET', path: `/quotes/${ID}` }, { verb: 'PUT', path: `/quotes/${ID}/draft` },
  { verb: 'POST', path: `/quotes/${ID}/issue` }, { verb: 'GET', path: `/quotes/${ID}/revisions/0/document` }, { verb: 'POST', path: `/quotes/${ID}/revisions/0/render` },
  { verb: 'GET', path: `/quotes/${ID}/revisions/0/pdf` }, { verb: 'POST', path: `/quotes/${ID}/revisions/0/send` },
  { verb: 'GET', path: '/settings' },
  // an accepted body would replace the company settings, so the body is one the validator refuses
  { verb: 'PUT', path: '/settings', adminOnly: true, body: { validity_days: 0 } },
  { verb: 'GET', path: '/fx-rate' }, { verb: 'PUT', path: '/fx-rate', body: { rate: 'not a number' } }, { verb: 'GET', path: '/send-channels' },
  { verb: 'GET', path: '/users', adminOnly: true }, { verb: 'PATCH', path: `/users/${ID}`, adminOnly: true },
];
const sendsBody = (r: Route) => r.verb === 'POST' || r.verb === 'PUT' || r.verb === 'PATCH';
const bodyOf = (r: Route) => (sendsBody(r) ? r.body ?? {} : undefined);
const NOT_REFUSED = [401, 403];

for (const route of PROTECTED) {
  test.describe(`${route.verb} ${route.path.replace(ID, ':id')}`, () => {
    test('401 for no token and for a bad token', async ({ request }) => {
      for (const token of [null, 'not.a.token']) {
        const res = await call(request, token, route.verb, route.path, bodyOf(route));
        expect(res.status(), String(token)).toBe(401);
        expect((await res.json()).error.code).toBe('unauthorized');
      }
    });

    test('403 forbidden for a valid sign-in that has no CRM account', async ({ request }) => {
      test.skip(!accountOf('stranger'), 'No E2E_STRANGER_* account set up.');
      const res = await call(request, await tokenOf('stranger'), route.verb, route.path, bodyOf(route));
      expect(res.status()).toBe(403);
      expect((await res.json()).error.code).toBe('forbidden');
    });

    test('403 account_inactive for a pending user and for a deactivated user', async ({ request }) => {
      test.skip(!accountOf('pending') && !accountOf('deactivated'), 'No E2E_PENDING_* or E2E_DEACTIVATED_* account set up.');
      for (const who of ['pending', 'deactivated'] as const) {
        if (!accountOf(who)) continue;
        const res = await call(request, await tokenOf(who), route.verb, route.path, bodyOf(route));
        expect(res.status(), who).toBe(403);
        expect((await res.json()).error.code, who).toBe('account_inactive');
      }
    });

    test(route.adminOnly ? 'a sales user is refused (403), an administrator is allowed' : 'a sales user and an administrator are both allowed', async ({ request }) => {
      const admin = await call(request, await tokenOf('admin'), route.verb, route.path, bodyOf(route));
      expect(NOT_REFUSED, `admin got ${admin.status()}`).not.toContain(admin.status());
      expect(admin.status(), 'an admin call must not crash the server').toBeLessThan(500);
      test.skip(!accountOf('sales'), 'No E2E_SALES_* account set up (the administrator check above did run).');
      const sales = await call(request, await tokenOf('sales'), route.verb, route.path, bodyOf(route));
      if (route.adminOnly) {
        expect(sales.status()).toBe(403);
        expect((await sales.json()).error.code).toBe('forbidden');
      } else expect(NOT_REFUSED, `sales got ${sales.status()}`).not.toContain(sales.status());
    });
  });
}

test.describe('public routes', () => {
  test('GET /health needs nothing', async ({ request }) => {
    const res = await request.get(`${API.replace('/api/v1', '')}/health`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('the letterhead images are public, and only those two files', async ({ request }) => {
    expect((await request.get(`${API}/assets/letterhead/logo.png`)).status()).toBe(200);
    expect((await request.get(`${API}/assets/letterhead/watercolour.jpg`)).status()).toBe(200);
    for (const name of ['secret.txt', '..%2F..%2Fpackage.json', '..%5C..%5C.env', '%2e%2e%2f.env']) expect((await request.get(`${API}/assets/letterhead/${name}`)).status(), name).toBe(404);
  });

  test('a forged or unknown PDF link is a 404, not an error page', async ({ request }) => {
    for (const token of ['forged.token', 'a', 'x.y.z', '%00']) expect((await request.get(`${API}/files/quote-pdf/${token}`)).status(), token).toBe(404);
  });

  test('claiming the first admin account and asking for access need a sign-in token', async ({ request }) => {
    // these two sit behind a rate limit shared with other tests, so a 429 is accepted as "not let through" too
    const claim = await call(request, null, 'POST', '/setup/claim-admin', { full_name: 'X' });
    expect([401, 429]).toContain(claim.status());
    const signup = await call(request, null, 'POST', '/signup/request', {});
    expect([401, 429]).toContain(signup.status());
  });

  test('an unknown route is a JSON 404 without a stack trace or file path', async ({ request }) => {
    test.skip(!accountOf('admin'), 'No E2E_EMAIL / E2E_PASSWORD set.');
    const res = await call(request, await tokenOf('admin'), 'GET', '/no-such-route');
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('not_found');
    expect(await res.text()).not.toMatch(/\bat \w+|node_modules|\.ts:\d+|C:\\/);
  });
});
