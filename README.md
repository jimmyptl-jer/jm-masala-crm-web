# web/ — the app people use

React 19 + TypeScript + Tailwind + react-router + @tanstack/react-query, built with Vite. Designed for a
phone first (big tap targets, bottom tab bar, dropdowns instead of typing) and works on desktop (sidebar).

Back to the [project README](../README.md) · What each API route does: [api/README.md](../api/README.md#route-reference)

**The golden rule of this folder:** the web app **never does money arithmetic**. Every amount arrives from the
API as text and is only formatted for display (`src/lib/format.ts`). To change a calculation, change
`api/src/services/calc.ts`.

## Screen map

| Screen | URL | File | Calls (API) |
|---|---|---|---|
| Sign in | `/login` | `pages/Login.tsx` | Supabase Auth directly (skipped when login is bypassed) |
| Reset password | `/reset-password` | `pages/ResetPassword.tsx` | Supabase Auth directly |
| **Today** (dashboard) | `/` | `pages/Today.tsx` | `GET /dashboard`; *Log activity* → `POST /quotes/:id/activities` |
| Buyer pipeline | `/pipeline` | `pages/Buyers.tsx` + `components/buyers/BuyerBoard.tsx` | `GET /buyers`; Kanban and table views share the buyer filters |
| **Quotes** (list) | `/quotes` | `pages/Quotes.tsx` | `GET /quotes`, `GET /quotes/export.xlsx` |
| **New quote / Edit draft** | `/quotes/new`, `/quotes/:id/edit` | `pages/QuoteForm.tsx` (+ `components/quoteform/`) | `POST /quotes/calculate` (live totals), `GET /products/:id/price-hints`, `POST /quotes`, `PUT /quotes/:id/draft`, `POST /quotes/:id/issue`, `POST /quotes/:id/revisions/:rev/send` (Issue & send sheet), `GET /send-channels`, `GET /quotes/:id` |
| **Quote detail** | `/quotes/:id` | `pages/QuoteDetail.tsx` (+ `components/quote/`) | `GET /quotes/:id`, revise, status, duplicate, follow-up, activities, PDF link, retry PDF, delete draft |
| Buyers (table/Kanban switch) | `/buyers` | `pages/Buyers.tsx` + `components/buyers/BuyerBoard.tsx` | `GET /buyers` (filters: stage, channel, follow-ups due), `POST /buyers` |
| Buyer detail | `/buyers/:id` | `pages/BuyerDetail.tsx` (+ `components/buyers/BuyerPipelineCard.tsx`) | `GET /buyers/:id`, `PATCH /buyers/:id` (incl. quick stage change), `GET /team` |
| Follow-ups | `/follow-ups` | `pages/Followups.tsx` | `GET /dashboard`, `GET /quotes`, `GET /buyers`; log contact via `POST /quotes/:id/activities` |
| **Marketing** | `/marketing` (`?tab=` overview · campaigns · templates · files), `/marketing/campaigns/new`, `/marketing/campaigns/:id` | `pages/Marketing.tsx` (+ `components/marketing/*`), `pages/CampaignNew.tsx` (4-step composer), `pages/CampaignDetail.tsx` (report) | `GET /buyers/summary`, `/marketing/*` |
| **Trade Intelligence** | `/intelligence` (`?tab=` markets · buyers · shipments · data) | `pages/Intelligence.tsx` (+ `components/trade/*`) | `/trade/*` |
| Products | `/products` | `pages/Products.tsx` (+ `components/products/ProductForm.tsx`) | `GET /products`, `POST /products`, `PATCH /products/:id`, `POST`/`DELETE /products/:id/image` (packaging picture) |
| Orders (handoff) | `/orders` | `pages/Orders.tsx` | `GET /quotes?status=won` (read-only; fulfillment tracking is not in the current data model) |
| Settings (admin) | `/settings` | `pages/Settings.tsx` (+ `components/settings/*`) | `GET/PUT /settings`, `POST /settings/logo`, `GET /users`, `PATCH /users/:id`, Excel import routes |

The URL → screen table lives in code in `src/router.tsx`.

## Folder map

```
web/src/
├─ main.tsx                 Starts the app (react-query, toasts, auth, router).
├─ router.tsx               The URL → screen table, and which screens need login / admin.
├─ strings.ts + strings/    ALL words shown on screen, one file per screen. (A Hindi/Gujarati set would go here.)
├─ index.css                Tailwind + small global styles. Colours are in ../tailwind.config.js.
├─ auth/AuthProvider.tsx    Who is signed in; RequireAuth / RequireAdmin guards; password-recovery redirect.
├─ lib/
│  ├─ api.ts                The ONE place that talks to the API (adds the login token, turns errors into ApiError).
│  ├─ types.ts              The shape of every API response (mirrors api/src).
│  ├─ format.ts             Show money (Indian grouping for INR), dates (India time), quantities, WhatsApp links.
│  ├─ hooks.ts              useBuyers / useProducts / useSettings, useDebounced, useUnsavedChanges.
│  ├─ supabase.ts           The browser's Supabase client (login only; public key only).
│  ├─ config.ts             AUTH_BYPASS, API_URL and LIVE_ROUTES (which calls are live; hasRoute hides the rest).
│  └─ india.ts              GST state codes list; GSTIN pattern.
├─ components/
│  ├─ ui.tsx                Button, inputs, Select, Segmented toggle, Card, StatusBadge, Sheet (bottom drawer), Toasts.
│  ├─ Layout.tsx            Sidebar (desktop) + bottom tab bar with the big "+" (phone).
│  ├─ SearchSelect.tsx      Searchable dropdown (buyer/product pickers) with an "add new" row.
│  ├─ BuyerForm.tsx         Add/edit buyer — used on Buyers screens and as quick-add in the quote form.
│  ├─ quoteform/            Pieces of the quote form: LineCard, PriceHintChips, TotalsBar, IssueSheet (confirm + Email/WhatsApp choice), model.ts (form state ↔ API body).
│  ├─ quote/                Pieces of Quote detail and Today: status/duplicate/share/log-activity sheets, tabs, PDF panel…
│  ├─ products/ProductForm.tsx
│  └─ settings/             One panel per Settings section + Excel import panel.
└─ pages/                   One file per screen (table above).
```

## How data moves (the pattern used everywhere)

```
Screen ──useQuery(['quotes', filters])──▶ api.get('/quotes?…') ──▶ API ──▶ JSON ──▶ cached by react-query ──▶ shown
Button ──useMutation──▶ api.post/patch/put(...) ──▶ API ──▶ on success: invalidate keys + toast + maybe navigate
```

* **react-query keys** name each cached list: `['quotes']`, `['quote', id]`, `['dashboard']`, `['buyers', filters]`,
  `['products', filters]`, `['settings']`, `['users']`. After a change the code *invalidates* the affected keys so
  the screens refresh themselves (e.g. changing a status refreshes the quote, the list and Today).
* **Errors:** the API always answers `{ error: { code, message, fields? } }`. `lib/api.ts` turns that into an
  `ApiError`; forms copy `error.fields` onto the matching inputs.
* **Login token:** `lib/api.ts` attaches the Supabase token to every call. With `VITE_AUTH_BYPASS=true` no token
  is sent and no login screen exists.

## Why the quote form is built the way it is (`pages/QuoteForm.tsx`)

* One scrolling page: **Buyer → Terms → Products → Charges → Notes**, with a **fixed totals bar** at the bottom
  (Save draft / Issue & generate PDF). On a phone the bar sits above the tab bar.
* Totals are requested from the API ~0.4 s after the last keystroke (`useDebounced`) — the form itself adds nothing up.
* Price hints appear under each rate as tappable chips; tapping one fills the rate.
* Freight and insurance appear **only** for CIF/CFR export quotes; domestic quotes show GST lines and CGST+SGST/IGST.
* Leaving with unsaved changes asks first (`useUnsavedChanges`).
* Once a quote is issued, the buyer and Export/Domestic type are locked; to change them, duplicate the quote.

## Settings (`.env`)

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Where the API is, including `/api/v1` (e.g. `http://localhost:3000/api/v1`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase project and its **public** key (used only for login) |
| `VITE_AUTH_BYPASS` | `true` = no login screen. Sample-data mode only (`VITE_API_URL` empty); the API has no bypass, so it cannot be used against the real API |
| `VITE_DEMO` | `true` = allow a production build without `VITE_API_URL` (the sample-data demo). Without `VITE_API_URL` and without this, `npm run build` fails |

These values are baked into the browser bundle at build time, so **only public values belong here** — never the
service-role key or the database password.

## Deploy

`npm run build` produces `dist/`. `Dockerfile` + `nginx.conf` serve it with the "any unknown URL → index.html"
fallback that a single-page app needs (so `/quotes/123` works when refreshed). Any static host works if it has the
same rewrite (`public/_redirects` covers Netlify-style hosts).
