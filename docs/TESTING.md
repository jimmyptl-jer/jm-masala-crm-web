# Testing

All automation tests live in **`web/e2e/`** (Playwright). They drive the real web app in a real Chrome and call the real API, signed in with real Supabase accounts. The API's own fast unit tests (`api/test/`, Vitest, `npm test` in `api/`) are separate and stay where they are: one in-memory MongoDB is started once for the whole run (`api/test/helpers/global-setup.ts`) and each test file works in its own database `jm_test_<random>` that is dropped when the file ends. `api/test/price-calculator.test.ts` covers the export price calculator (the sheet's figures row by row, fixed per-point insurance and ECGC, all 18 Excel columns reproduced from the defaults and through the expense override, admin-only access, validation, defaults); `api/test/price-sheets.test.ts` covers the saved dated sheets (save, read without recalculating, replace, archive and restore, admin-only, validation). `api/test/samples.test.ts` covers the Samples module (codes, status rules, the admin-only cost, filters, archive). `api/test/hardening.test.ts` covers the audit fixes: e-mail confirmation, signing-key refresh, 4xx mapping, configuration checks, partner admin fields, concurrent activities, the last-administrator race, PDF link revocation, `/team`, `/buyers/summary`, buyer activities, truncation flags, daily-rates partial failure and the audit log. `api/test/quote-lifecycle.test.ts` covers cost and margin hiding by role, issuing under concurrent issue and save (one number, 409 `conflict`, stale and stuck claims, number handed back), the stale dollar rate warning, EUR and discounted margin, status moves, follow-up, activities, the dashboard, send de-duplication, `inquiry_id`, rate limit and the Chrome render limit. A cost can be entered only by an admin, so tests and e2e specs that send `cost_rate` must sign in as an administrator.

## What is there

| Area | File | Tests | What it proves |
|---|---|---|---|
| Existing | `01-navigation`, `02-buyers`, `03-inquiries`, `04-quotations`, `05-products-settings`, `99-sign-out`, `public` | 31 | pages open, buyers, inquiries, quote create/edit (issue + e-mail with `E2E_SEND=1`), products, users, sign-in, sign-out |
| UI | `06-dollar-rate.spec.ts` | 6 | the dashboard dollar-rate box: set, validate, persist, keyboard |
| UI | `07-quote-calculation.spec.ts` | 16 | live totals: export, freight/insurance by Incoterm, discount, rupee value, margin, two lines, domestic CGST+SGST / IGST, round-off, input limits, checks before saving |
| UI | `08-preview-send.spec.ts` | 12 | Preview shows the API-made page and e-mail, no cost or margin, redraw, no duplicate quote; issue and send (gated) |
| UI | `09-roles.spec.ts` | 11 | sales user, pending user, deactivated user, administrator: who sees what |
| UI | `10-grades.spec.ts` | 14 | the 55 seeded draft grades and codes, draft can't be quoted, activation, packing choices, archive, product-code rules |
| UI | `11-partners.spec.ts` | 4 | partners list and columns, add-form checks, a partner with two roles (add, contact, service with rate and expiring document, activity, edit, filter, archive, restore), duplicate name |
| UI | `14-daily-rates.spec.ts` | 8 | Products and Daily rates tabs, edit and save rates, history, discard, rates per kg and shared HS / HSN codes in the product form (no Reference pricing step), delete a grade, the Daily rates page, the dashboard tabs (each card opens its tab), and that Daily rates and the product form are one record |
| UI | `12-responsive.spec.ts` | 23 | phone (390 px), tablet (820 px) and wide desktop: no sideways scroll, tap targets, fixed bars, menu |
| UI | `13-accessibility.spec.ts` | 19 | axe-core scan of 14 screens (serious and critical fail) and keyboard use |
| API | `api/authz-matrix.spec.ts` | 137 | every route x every kind of visitor (no token, bad token, stranger, pending, deactivated, sales, admin) |
| API | `api/quote-money.spec.ts` | 17 | property-based money rules on randomly generated quotes, checked against independent arithmetic |
| API | `api/security.spec.ts` | 17 | CORS, headers, malformed / oversized bodies, token tampering, operator injection, prototype pollution, mass assignment, XSS in page and e-mail, secrets |
| API | `api/business-rules.spec.ts` | 18 | buyers, inquiries, products: unique names, codes never reused, GST rules, archive not delete |
| API | `api/quote-lifecycle.spec.ts` | 19 | issue, numbering under parallel requests, frozen issued quote, rate locked at issue, PDF text read back, share link, e-mail template (gated) |
| API | `api/performance.spec.ts` | 10 | response times, answer sizes, 30 parallel requests, PDF speed (PDF part gated) |

Total: 31 existing + 319 new = 350 tests. Helpers: `helpers.ts` (existing), `qa.ts` (API sign-in without a browser, test records, gates), `quote-form.ts` (drives the quotation form).

## Running

From `web/`, with the web app (default `http://localhost:5173`) and the API (default `http://localhost:3000/api/v1`) running:

```
npm run e2e:fast        everything, headless
npm run e2e             everything, in a visible Chrome (slowed down)
npm run e2e:api         only the API tests (no browser page)
npx playwright test e2e/07-quote-calculation.spec.ts      one file
npm run e2e:report      the HTML report with a screenshot per test
npm run typecheck:e2e   checks that the tests compile (run this after editing them)
```

## Accounts and switches (environment variables)

| Variable | Needed for |
|---|---|
| `E2E_EMAIL`, `E2E_PASSWORD` | an administrator test account. **Required** for everything except a few no-login checks |
| `E2E_SALES_EMAIL`, `E2E_SALES_PASSWORD` | an active sales user: the sales part of the permission matrix and `09-roles` |
| `E2E_STRANGER_EMAIL`, `E2E_STRANGER_PASSWORD` | a Supabase account with **no CRM user** (never asked for access) |
| `E2E_PENDING_EMAIL`, `E2E_PENDING_PASSWORD` | a CRM user waiting for approval |
| `E2E_DEACTIVATED_EMAIL`, `E2E_DEACTIVATED_PASSWORD` | a CRM user an administrator deactivated |
| `E2E_ISSUE=1` | allows tests that **issue quotations** (each uses up a real quotation number) |
| `E2E_SEND=1` | also allows the test that really **e-mails** a quotation, to `E2E_MAIL_TO` (default `jimmyptl46@gmail.com`) |
| `E2E_SLOW_FACTOR` | multiplies the speed limits (for example 2 on a slow connection) |
| `E2E_SUPABASE_URL`, `E2E_SUPABASE_KEY` | only if different from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `web/.env` |

A test that needs an account or switch that is not set is **skipped**, never failed, and says why.

## Realistic test data (Faker)

`web/e2e/fake.ts` uses `@faker-js/faker` to make test buyers that look real: a family name, a trade word and the legal ending of their country (for example `Becker Spice Imports GmbH (E2E 4F2KA)`), a contact person with a job title, a phone number, a city and short buyer messages. Every company name keeps an `(E2E ...)` marker so test records are easy to spot and are archived again afterwards. Each run prints its seed (`E2E seed 726036`); `E2E_SEED=726036` repeats exactly the same names. E-mail addresses always end in `example.com`, so a test can never e-mail a real person. `makeBuyer` in `qa.ts` and the buyer, inquiry and quotation tests use it; the other tests keep their fixed names because they assert on that exact text.

## Keeping a long run signed in
The saved sign-in (`web/e2e/.auth/state.json`) is a snapshot, so its access token ages (about an hour). `node e2e/refresh-session.mjs` (run from `web/`) renews it with its own refresh token without asking for the password; run it before a long run. If it says the refresh token was used, run the `setup` project once to sign in again.

## Rules for running safely

- **Use a test database.** Quotations cannot be removed and each issued one takes a real number from the financial-year counter. Point a test API at a separate database (`MONGODB_DB=jm_e2e`) and a Supabase test project before turning on `E2E_ISSUE`. Without it, leave `E2E_ISSUE` off.
- The tests make buyers and products named `E2E ...` and archive them again afterwards. Drafts left by Preview tests cannot be removed (they use no number).
- The dollar-rate tests set the shared rate to 83.45 and put the earlier one back at the end.
- The permission matrix sends only empty or invalid bodies on purpose, so an allowed call is refused by validation and never changes data. It never calls anything that could remove an administrator.
- The setup and sign-up routes have a rate limit (30 per 15 minutes per address); running the whole suite many times in a row can hit it.

## Known defects found while writing the tests

None open. (Fixed: a request body over 1 MB is now answered 413 `payload_too_large`, and any other 4xx raised by a middleware keeps its status; test: `api/test/hardening.test.ts` and `api/security.spec.ts` "a body over 1 MB is refused with 413".)

## Exit criteria for a release

All tests pass with the administrator, sales, pending, deactivated and stranger accounts set up and `E2E_ISSUE=1` against the test database; accessibility has no serious or critical findings; the manual sessions below are done.

## Manual sessions (not automated)

1. **E-mail in real inboxes:** send the quotation e-mail to Gmail (web and phone app), Outlook and Apple Mail: bold labels and lists render, the PDF opens, it does not land in spam, the sender name reads "Jimmy Patel - JM Masala trading LLP", Reply goes to the sender.
2. **PDF printing:** print the PDF on A4; margins, the watercolour, long product names and many lines (page break).
3. **Browsers:** Firefox and Safari (macOS and iPhone) through the quote form, preview and issue.
4. **Real GST samples:** three real domestic quotes checked by the accountant against hand-worked GST and round-off.
5. **Real export samples:** the Oman cumin example and two others checked against the business's own spreadsheet, including the rupee value.
6. **Sign-up and approval flow:** a new person signs up (confirmation e-mail), the admin gets the access-request e-mail, approves, the person gets the approval e-mail and can sign in.
7. **Gmail limits:** send 20 quotations in a day to confirm the daily limit, and what happens when it is reached.
8. **Slow network:** the quotation form on a throttled 3G connection (live totals, preview, issue).
9. **Two people at once:** two staff editing the same draft, and issuing the same quote.
10. **Data recovery:** restore a backup into the test database and open the oldest quotations.

## Still to test when built

Partners & Suppliers (see `PARTNERS.md`): about 40 more tests (API permissions and rate visibility for sales vs admin, roles, contacts, services, documents with expiry, activity log; list, form and profile screens). Marketing campaigns: unsubscribe, send caps, per-recipient status.
