# JM Masala CRM — MVP screen definition

This defines the sales-first interface for the current web app. It prioritizes buyer follow-through and the path from inquiry to issued quotation. It is a screen and interaction specification, not a claim that every listed screen is already implemented.

> **Planned next:** a Partners & Suppliers section (directory of suppliers, processors, packagers, transporters, CHAs, freight forwarders, labs and other service providers, with contacts, role-specific services and an activity log). Its list, form and profile screens are specified in [PARTNERS.md](PARTNERS.md); they are not built yet.

## Product decisions

- **Quotation creation:** guided workspace. Keep buyer and commercial inputs together on the left and a live, readable quotation preview on the right at desktop widths. On phones, use compact guided sections with a persistent save/issue action; the preview opens as its own step. This keeps the full quote visible while people enter or revise terms without making repeat quotes feel like a long wizard.
- **Buyer pipeline:** offer both Kanban and table views over the same buyers and filters. Remember the selected view. Kanban is the default for moving opportunities; table is for search, sorting and detailed review. On narrow screens, columns scroll horizontally and the table can scroll without shrinking its useful columns.
- **One pipeline, two related states:** buyer stage tracks the relationship; quote status tracks an individual offer. A buyer may have several quotes or revisions, so changing a quote must not silently change unrelated quotes. Show the latest quote and next buyer action together.
- **Every open prospect and opportunity needs a next action and date.** Flag missing or overdue actions in the dashboard, buyer cards and detail header.
- Use a compact light shell, forest-green text, restrained green accents, clear status labels, and spacious working areas. Avoid decorative charts and piles of summary cards.
- **Design system (locked): v2 Clean White + Paprika** (`DESIGN_SYSTEM.md` at the workspace root, supplied 29 Oct 2026; it replaced the brown/gold/cream v1 and the green palette). A white, minimal workspace: white sidebar, top bar and cards on a `#FAFAF9` page, 1px warm borders, almost no shadow; paprika `#C2410C` is the only brand colour, used for the one primary button per screen, the active nav item (paprika-50 background, 3px bar), links and one hero number; status colours (success, amber warning, rose-red danger, info blue) only for status; stage badges are white pills with a coloured dot. Lato for all UI including page titles (Lato bold 24px); Cormorant Garamond only for the sidebar wordmark and PDF titles. The quotation PDF keeps the letterhead look (brown `#583310` and gold `#B8862B`). Tokens live in `web/src/index.css`, `web/tailwind.config.js` and `web/src/lib/design-tokens.ts`; components never use raw hex. Older class names (`brand`, `forest`, `accent`, `gold`, `crm-blue`, Tailwind's slate/emerald/amber/red/blue) are mapped onto the v2 tokens so existing screens follow the theme.
- **Live mode and shared behaviour:** with `VITE_API_URL` set the app never shows sample data; controls whose API route is not live yet are hidden (see `LIVE_ROUTES` in `docs/API.md`) and the Today, Follow-ups and Pipeline tiles that need a missing route say "This is not available yet". Lists capped at 100 rows show a notice when the API's total is larger. Sheets and the buyer drawer move focus into the dialog, keep Tab inside it and return focus to the opener on close. Private screens are code-split and show a spinner while they load. Marketing and Trade intelligence screens were removed (they were not routed).

## Navigation

**Implemented (`web/src/components/Layout.tsx`, design system v2):**
- **Sidebar (md and up):** white, right border; paprika "JM" square and the "JM Masala" wordmark (Cormorant 700, 20px); collapse button; a Search button (Ctrl/Cmd + K opens a palette for pages, buyers and quotations, `CommandPalette.tsx`); items 36px tall with a 16px icon, hover `surface-hover`, active paprika-50 background, paprika-700 bold text and a 3px paprika bar. Groups: Dashboard, Pipeline, Buyers; **Sales** (Quotations with a grey badge of draft quotes, Follow-ups with a red badge of follow-ups due); **Operations** (Products, Orders). Settings (admin only) and the signed-in person with role at the bottom. 240px expanded, 64px icon rail; it collapses automatically under 1280px or with the button, and the choice is kept in `localStorage` ('jm.nav'). In the rail the red badge becomes a dot and labels become tooltips.
- **Top bar (56px):** breadcrumb (Home / section / New, Edit or Details), the bell (paprika dot when follow-ups are due) and a paprika "+ New" menu (New quotation, Add buyer).
- **Phone:** header with the logo, search and sign-out; bottom bar Home, Pipeline, a round paprika "+" (Create sheet: New quotation, Add buyer), Quotations, More (the full menu).
- **Not in the app yet, so not in the menu:** Proforma invoices, Shipments, Payments (the design's Payments tab becomes Quotations on the phone bar), and the "Log payment" create option. The Settings role label is Owner or Sales (the app has admin and sales roles, not Partner). The group labels use `ink-muted` (not `ink-placeholder`) so they stay readable.

Original target (kept for reference): desktop sidebar in this order:


1. Dashboard
2. Buyer pipeline
3. Buyers
4. Quotations
5. Follow-ups
6. Products & pricing
7. Orders

Settings sits at the bottom for administrators. On mobile, keep Dashboard, Pipeline, Quotes and Buyers in the bottom navigation, with a prominent New quote action; put the remaining destinations in a compact More menu. Preserve the current responsive sidebar and bottom navigation pattern.

## Screens

### 1. Dashboard — `/`

**Purpose:** decide what to do next today.

- Header: “Good morning”/date, concise sales summary, and primary **New quotation** action.
- First working section: **Follow up today** and **Overdue**, ordered by urgency. Each row shows company, contact, country, stage, last interaction, next action/date and a direct action to log a call/email/note or open the buyer.
- Second section: **Quotes awaiting response**, with quote reference, buyer, amount/currency, sent date, expiry and follow-up date. Provide open quote and log follow-up actions.
- Compact new inquiries/qualified prospects list with age and next action.
- A small set of decision metrics only: open opportunities, quotes awaiting response, follow-ups due and conversion rate (won quotes divided by decided quotes; the API's summary does not state a period yet, so none is printed). **Open pipeline value is not shown:** it needs per-currency totals from the API, and the browser must not add money up.
- **Implemented layout (`web/src/pages/Today.tsx`):** time-of-day greeting and one-line summary; four metric tiles that link to their lists; a warning when open buyers have no next action; "Needs action today" (Overdue, then Due today) merging quote follow-ups and buyer follow-ups with Call / WhatsApp / Log / Open; quotes awaiting response; new inquiries and prospects; a compact pipeline strip linking to `/pipeline`; quotes expiring within 3 days; recent buyer contacts. The recent-contacts list is built from each buyer's last contact; there is no cross-buyer activity feed yet.
- **Tabs (built):** the four cards (Chase today, Overdue, New enquiries, Going cold) are buttons; each opens its own tab under the cards with the matching details (the chase list with its filters, overdue follow-ups, new enquiries with reply status and a Quote button that opens the new-quote page, buyers going cold with WhatsApp and call). A fifth tab, **Daily rates**, shows the per-kg price list (the same table as the Daily rates page).
- Empty states explain the next useful action.

### 2. Buyer pipeline — `/pipeline`

**Purpose:** see and move each buyer relationship forward.

- **Implemented (`web/src/pages/Pipeline.tsx`):** Board/List toggle kept in the URL and an accent **New deal** (opens Add buyer; there are no deals yet); four KPI cards (open pipeline as a count of open buyers, qualified, win rate, follow-ups due, clickable to apply the "Needs follow-up" filter); a funnel bar of buyers per stage (click to jump to the column); filters (search, country, product, owner, needs follow-up) in the URL; the board with stage-colour dots and one next-action line per card (overdue follow-up in red, then a quote expiring within 3 days in orange, then the recorded next action), cards opening a buyer drawer; a sortable list view; on phones a stage selector with a vertical card list. Not built: pipeline value, weighted forecast and column totals (need deals with values and stage probabilities from the API), drag-and-drop stage changes (need server-side stage rules), and the KYC / repeat-buyer badges. Stage changes stay in the buyer profile.
- Stage columns: **New lead**, **Contacted**, **Qualified**, **Quotation sent**, **Negotiation**, **Won**, **Lost**. The current CRM has finer stages (requirements and sample milestones); retain those details in the buyer record and group them under the visible sales stages rather than discarding sample work.
- Each card shows company, country, product interest, latest quote/value where present, last contact, and next action/date. Overdue or missing next action is immediately visible.
- Moving a card updates the buyer stage and prompts for the next action/date when needed. It must not change quote status implicitly.
- Table view uses the same filter/search state and exposes company, country, stage, products, latest quote, last contact, next action/date and owner if ownership is supported.
- Filters: stage, country, product, lead source, follow-up due/overdue, and active/archived. Keep filters usable on mobile in a sheet.

### 3. Buyers — `/buyers`

**Purpose:** find, add and maintain company records.

- **Table only** (no Board toggle; the board is `/pipeline`). Search by company or contact; filter export/domestic, country, type, stage and active/archived.
- Rows prioritize company, country, primary contact, products of interest, relationship stage and next follow-up. Include a clear **Add buyer** action and a useful no-results state.
- A row opens the buyer profile. Quick-add from quotation creation captures the minimum required company/contact details and returns to the quote with the buyer selected.

### 4. Buyer profile — `/buyers/:id`

**Purpose:** understand the relationship and make its next move.

- Profile header: company, country/type, primary contact and direct contact actions; stage selector; prominent **Log activity**, **Set next action**, and **New quotation** actions.
- Immediately below: latest interaction and the next action/date, including overdue treatment.
- Tabs: **Overview**, **Activity**, **Quotations**, **Requirements**, **Samples**, **Orders**. Keep the active tab in the URL so a tab can be linked or refreshed.
- Overview: company/contact details, source, products of interest, relationship stage, owner (if supported), notes and recent activity.
- Activity: chronological calls, emails, notes, quote events and follow-up outcomes; add an activity without leaving the profile.
- Quotations: all quote references, revisions, amounts/currencies, validity, status and outcome; open, duplicate or revise from the relevant quote.
- Requirements: grades/specifications, quantity, target price, destination port, currency, Incoterm and payment terms.
- Samples: request, dispatch date, courier/tracking and buyer feedback. Built as a "Samples" card on the buyer page (status and result pills, links to each sample, "New sample" for this buyer) rather than a tab; the full screens are **Samples** (`/samples`: metric tiles, filters, sortable list; `/samples/new`, `/samples/:id`, `/samples/:id/edit`). The cost column and field are shown to administrators only.
- Orders: confirmed business and current order status; link to order detail.

### 5. Quotations — `/quotes`

**Purpose:** work the quote book and quickly find offers needing action.

- **Implemented (`web/src/pages/Quotes.tsx`, route `/quotes`, alias `/quotations`):** header with Export (outline) and **+ New quotation** (accent); five status cards (All, Draft, Sent, Accepted = won, Expired) showing counts, active card in paprika, click filters; filter bar with search, Status, Country, Product and Period (this FY, last FY, all time, custom dates; default the current Indian financial year) all in the URL; a table on wide screens (quote number or "- Draft" with the products under it, buyer with country, value, valid-until in orange at 3 days or fewer and red when expired, status badge, row menu with Duplicate and Download PDF; Convert to PI and Archive are disabled until those features exist) and stacked cards on phones; loading skeletons and empty states. Status cards show counts only: value totals, the Quantity (MT) column and the item count need the API to return them, and the Country filter runs in the browser over up to 500 quotations.
- Header with **New quotation**. Default to active/draft and sent/negotiating work; allow status, buyer, date, expiry, country and currency filters plus search by quote reference/company.
- Table columns: quote reference/revision, buyer, issue date, amount and currency, status, validity/expiry, next follow-up and last activity.
- Make draft, awaiting response, expiring and overdue states easy to scan. Keep Won/Lost accessible as filter options and show a useful empty state.
- Row opens quote detail. Draft rows offer Edit; sent rows offer View, Revise, Duplicate and Record outcome as allowed by quote state.

### 6. Quotation workspace — `/quotes/new`, `/quotes/:id/edit`

**Purpose:** create, check and issue a professional quote with few context switches.

- **Implemented (`web/src/pages/QuoteForm.tsx`):** a top bar (back arrow, title, status badge and a Draft > Sent > Accepted > PI strip); numbered section cards (1 Buyer, 2 Products, 3 Shipment and terms, 4 Charges and discount, 5 Notes); a sticky 300 px summary panel on the right (below the form on phones) with the total in large paprika, subtotal / GST / round-off from `POST /quotes/calculate`, a margin check (green 8% and above, orange 3% to 8%, red below 3%, shown only when cost is revealed, from the API's overall margin percentage), the actions **Finalise and send**, **Preview PDF** (opens the quotation document on the letterhead in a sheet, with Download PDF) and **Save draft**, and a save indicator. Drafts **autosave every 10 seconds** when the form is complete enough to save (silent; a failure only changes the indicator). Finalise validates the form and scrolls to the first error. The product lines are cards (`LineCard.tsx`): header (number, product, grade, **Duplicate**, remove), a **Product** picker (approved JM Masala products only) and a **Grade** picker (that product's active grades; each grade is its own catalogue record), Packaging, Quantity and Rate in the product's unit, the live line amount from the API, the selected grade's specification chips (purity, moisture, cleaning) with an expandable **Specifications** section, price hints, and, with Show cost on, the internal cost and margin (an empty-state message when no cost is entered). A footer shows the line count and subtotal. A line cannot switch between kg and MT (quantities and rates are in the product's unit; mixing units needs an API change), and there is no number-of-bags field or line-level description yet (no data fields for them). Issued quotations keep their own snapshot of product, grade, specification, packaging and price (API, BR-03). Not built: terms template and payment schedule (clauses are the standard set in `web/src/lib/quoteTerms.ts`), the KYC rule, per-line margin check (the API gives only the overall margin), and Convert to PI after Accepted (no PIs yet). The preview shows the actual quotation document (`QuoteDocument.tsx`, spec in `docs/QUOTE-DOCUMENT.md`); the issued PDF that goes into the e-mail is made by the API from the saved revision in the same layout.
- Guided sections: **Buyer → Products → Commercial terms → Preview → Email draft**. On desktop, buyer/products/terms remain on the left and a live PDF-like preview remains on the right; section progress and validation point to incomplete fields. On mobile, each section is a compact step with a full-width preview step.
- Buyer: select an existing company/contact or quick-add. Prefill known country, currency, destination and buyer terms without silently overwriting explicit edits.
- Products: add one or more spice/grade/specification lines, packaging and quantity. Show prior-to-this-buyer, recent and reference price hints as contextual suggestions, never as automatic prices.
- Commercial terms: currency, unit price, Incoterm (FOB/CIF/CFR as supported), destination port, payment terms, validity, freight/insurance when relevant, and notes. Clearly distinguish export from domestic/GST quotes.
- Preview: branded PDF preview with buyer snapshot, product specs, line items, totals, validity and commercial terms. Totals come from the API; the browser only formats returned values. Show validation errors beside the relevant input.
- Email draft: editable subject and message prefilled with buyer name, quote reference and validity. Provide the PDF attachment as a download/shareable file. **Sending remains manual**; do not suggest that clicking Issue sends email.
- Persistent actions: **Save draft** and **Issue quotation**. Confirm before issuing because issue creates a numbered, frozen revision. After issue, show the issued quote and next follow-up controls.
- Existing quote detail actions support duplicate and revised version creation. Preserve immutable issued revisions and make revision history visible.

### 7. Quote detail — `/quotes/:id`

**Purpose:** follow one offer from draft through decision.

- Header with reference/revision, buyer, amount/currency, status, validity and latest follow-up date.
- Main area shows the current PDF preview/download and quote terms. Revision selector/history makes prior issued versions inspectable.
- Activity timeline records issue, manual send confirmation, follow-ups, status changes, revisions and notes.
- Actions depend on state: edit draft; issue draft; mark sent after manual delivery; set follow-up; log activity; revise/duplicate; record Won/Lost with reason; retry PDF if generation failed.
- Show expiry and overdue follow-up prominently. Never edit an issued revision in place.

### 8. Follow-ups — `/follow-ups`

**Purpose:** provide a focused daily work queue across buyer and quote activity.

- Tabs or filters for Today, Overdue, Upcoming and Completed; sort overdue first then due time.
- Each row identifies whether the task belongs to a buyer or a specific quote, with company, country, stage/status, last contact, action/date and quick log/complete/reschedule controls.
- Completing a follow-up asks for an outcome and the next action/date for an open relationship. Do not silently mark a quote Won or Lost.
- Dashboard and buyer/quote detail use the same underlying activity and follow-up records so a task has one source of truth.

### 9. Products & pricing — `/products`

**Purpose:** maintain quoteable products and reference information.

- **Implemented layout (`web/src/pages/Products.tsx`):** four summary tiles (products, grades, products with a reference rate, last updated); search, Active/All status, and a Grid/Table switch. Grid shows one card per product name with its grades grouped. Clicking a product opens its own page, `/products/:name` (`ProductDetail.tsx`): breadcrumb, image, status, key highlights, counts, and Overview / Grades & Specifications / Packaging Options / Reference Pricing tabs. **Edit product** opens a full edit page, `/products/:name/edit`, and Add product opens `/products/new` (`ProductEdit.tsx`); both are admin-only routes and no longer use a modal. Only fields the product record has are shown: there is no product code, category, origin or documents data, so none is displayed. Add/Edit stay admin-only. The add/edit form (`ProductForm.tsx`, hosted by the edit page) has a step list on the left (basic information, grade & specifications, packaging, reference pricing, image) that scrolls to numbered cards, and a sticky Cancel/Save footer. Add and Edit now handle a whole product: a grades table (grade, cleaning, purity, moisture, unit, GST %, HS/HSN, specification, active switch; "Add grade" creates another grade row), shared packing options (written to every grade), per-grade reference rates, and the packaging image (first grade). Each grade is still its own `/products` row, saved with POST (new) or PATCH (existing, including `archived`); grades are switched off, never deleted, and Archive/Restore applies to every grade. SKU, category, several images, documents and structured packaging (weight, material, usage) need the data-model and API change in `docs/PRODUCT-MODEL-PROPOSAL.md` first.
- Search/filter active products by spice, grade and export/domestic suitability.
- Rows show product, grade/specification, HS/HSN code where applicable, unit, packaging options and reference rate/currency.
- Add/edit/archive product. Keep negotiated rates on quote history; reference rates are guidance and never replace a buyer-specific agreed price.
- Product detail/edit includes specs, packaging and relevant tax fields. Admin-only changes can follow current permissions.
- **Rates are per kg (built).** Each grade holds one USD and one INR price per kilogram, edited in the grade table of the product form (there is no Reference pricing step) or on the Daily rates tab; both write the same record. The HS (export) and HSN (domestic) codes are product details, one value for every grade, set at the top of the product form. A saved grade can be deleted: it is removed for good when no quotation used it and archived otherwise.
- **Daily rates tab (built):** `/products?tab=daily-rates`, also its own page `/daily-rates` (sidebar: Daily rates) and a tab on the dashboard. Product by product with the grades listed below each product; an administrator edits the USD and INR per kg in place and saves the changed rows together; History shows the day-by-day rates of a grade. Every save also writes the day's price list to S3 as `daily-rates/DD-MM-YYYY.json` (docs/API.md, Storage).

### 10. Orders — `/orders`, `/orders/:id`

**Purpose:** track only business that has been won, without growing into an ERP.

- Orders list contains order reference, buyer, source quote, order date, value/currency, promised delivery and a simple status (Confirmed, In progress, Completed, Cancelled).
- Detail links back to the winning quote and buyer, records key dates/notes and makes the next action visible.
- Create an order from a won quote, carrying forward its frozen buyer/product/price snapshot. Inventory, shipment execution, payments and commissions remain out of MVP scope.

### 11. Settings — `/settings`

**Purpose:** administer company and quote defaults.

- Company branding/logo and contact details; bank details; default quote validity and follow-up interval; standard payment/shipping terms; user access where available.
- Clearly label defaults as defaults applied to new drafts. Changing a default never rewrites an issued quotation.

## Shared interaction and visual rules

- Use the existing shared page header, buttons, inputs, cards, status badges, sheets and toast/error patterns where they fit. Every page needs loading, error/retry, empty and success states.
- Keep list filters in the URL when practical, so work can be bookmarked and browser back behaves predictably.
- Confirm irreversible business events (issue, archive, outcome); autosave is not implied. Warn before leaving a dirty quote draft.
- Use explicit currency codes beside amounts, local readable dates, and stage/status labels in text as well as color.
- The same activity should appear consistently in dashboard, buyer profile, quote detail and follow-up queue.

## Delivery order

1. Shell/navigation and Dashboard.
2. Buyer pipeline and unified buyer profile/activity/next action.
3. Quotation workspace, preview/email draft, and quote detail/revisions.
4. Follow-up queue and expiry/overdue states.
5. Products & pricing and Won-to-Order tracking.
6. Reports and operational modules only after buyer and quotation workflows are working well.

## Current app mapping

The React app already contains Buyers, Buyer Detail, Quotes and Quote Detail screens, a buyer board/table pattern, a quote form, a Today dashboard, products and settings components. The current route table only exposes Buyers and Quotes (plus quote detail/form); the dashboard and several other features are not wired on the current main route table. Treat this document as the target MVP definition and reconcile existing screen behavior before expanding routes. Keep the CRM's existing detailed stage keys and quote immutability rules unless a coordinated data migration is explicitly planned.
