# Partners & Suppliers

Status: **built** (API, list, add / edit sheet and profile page). Out of scope so far: see the last section.

## Why
JM Masala works with many outside companies besides buyers: farmers, aggregators and traders (product suppliers), processors, packaging vendors, transporters, Customs House Agents (CHAs), freight forwarders, shipping lines, laboratories, warehouses, fumigation and insurance providers, commission agents. They need one central directory, with one record per company that can hold several roles (a vendor may supply cumin and also clean it), several contacts, role-specific service details and an activity log. Buyers stay a separate module; a company that is both buyer and supplier is two records for now.

## Decisions (agreed)
- **Storage:** one `partners` collection. Contacts, services (with documents) and activities are **embedded lists inside the partner document**, not separate collections. One read loads a whole profile and edits are atomic. Other modules will link by `partner_id` later.
- **Rates access:** every signed-in user sees the directory, contacts, roles and services. **Rates, pricing-related minimum order values and payment terms are admin-only**: the API removes them from answers to sales users and refuses their writes (project rule: cost never leaves the API). A sales user's change can also never destroy them: services are matched by `id` and keep their stored admin fields, a new service has none, and a sales PATCH that removes (or re-creates without its `id`) a service holding a rate, minimum order or payment terms is refused with 403. Lists carry `total` and `truncated` (cap 5000); partner changes write only the changed fields, so a logged activity is never lost.
- **Roles:** 13 fixed values in one constant (API `PARTNER_ROLES`, mirrored in `web/src/lib/partners.ts`): `supplier`, `processor`, `packager`, `transporter`, `cha`, `freight_forwarder`, `shipping_line`, `laboratory`, `fumigation`, `warehouse`, `insurance`, `commission_agent`, `other`. A partner has one or more.
- **Code:** `PTY-0001`, from `nextCode(d, 'partner', 'PTY')`, never edited or reused.
- **Names:** an active (not archived) company name is unique without regard to case (409 `duplicate_partner`), like buyers. Partners are archived, never deleted.

## Data model (`PartnerDoc`)
`partner_code`, `company_name`, `legal_name`, `roles[]`, `status` (`active` | `under_review` | `inactive`), `email`, `phone`, `whatsapp`, `website`, `address`, `city`, `state`, `country`, `postal_code`, `gstin`, `pan`, `registration_details`, `notes`, `assigned_to`, `archived`, `created_at`, `updated_at`, plus:
- `contacts[]`: `id`, `name`, `designation`, `department`, `email`, `phone`, `whatsapp`, `is_primary` (at most one), `notes`.
- `services[]`: `id`, `role` (must be one of the partner's roles), `service_name`, `products_supplied[]`, `service_areas[]`, `rate_amount`, `rate_currency`, `rate_unit`, `minimum_order_quantity`, `lead_time_days`, `capacity_notes`, `payment_terms`, `documents[]` (`name`, `document_number`, `expires_at`; no file upload yet), `notes`. Money is a decimal string. `rate_unit` is checked against the role (for example supplier: per_kg, per_ton; transporter: per_trip, per_container, per_ton; CHA: per_document, per_job, per_container).
- `activities[]`: `id`, `kind` (call, whatsapp, email, meeting, note), `body`, `happened_at`, `user_id`, `user_name`. `last_interaction` is the newest.

Indexes: unique `partner_code`; `roles`; unique active `company_name` (case-insensitive); `status`.

## API
`GET /partners` (filters `q`, `role`, `status`, `archived`), `POST /partners`, `GET /partners/:id`, `PATCH /partners/:id` (contacts and services are saved by sending the whole list), `DELETE /partners/:id` (archive), `POST /partners/:id/activities`. Files mirror the buyer module: `partner.model.ts`, `partner.validator.ts`, `partner.service.ts`, `partner.view.ts`, `partner.controller.ts`, `partner.routes.ts`, and `api/test/partners.test.ts`.

## Screens
- **Partners & Suppliers list** (`/partners`): search, role filter, status filter, columns Partner ID, Company, Roles (badges), Primary contact, Phone / WhatsApp, City / State, Products / Services, Last interaction, Status, Actions (View, Edit, Log activity). Card list on phones. `?new=1` opens the add sheet.
- **Add / Edit partner** (sheet): company details, roles (chip multi-select), contact and address, GSTIN / PAN, status, notes.
- **Partner profile** (`/partners/:id`): header with role badges, status and call / WhatsApp / e-mail buttons; Contacts; Services per role with documents and expiry colours (amber within 30 days, red when expired); rates and payment terms shown to admins only; activity timeline and Log activity.
- Navigation: a new "Partners & Suppliers" item in the Operations group of the sidebar, listed under More on phones, and partners in the command palette. Design rules: `DESIGN_SYSTEM.md` (tokens only, one primary button per screen).

## Build order (all three done)
1. **API** (model, validator, service, view, controller, routes, indexes, tests, docs). Testable alone.
2. **Web list and add / edit** (navigation, list page, form, strings, types, hooks, `LIVE_ROUTES`, sample data).
3. **Web partner profile** (contacts, services and documents, activity log).
Each slice ends in a working state.

## Out of scope for now
Procurement and logistics links (purchase orders, shipments, processing jobs referencing `partner_id`), document file upload (needs file storage), expiry reminders on the dashboard, a link between a partner and a buyer record, and the `assigned_to` owner picker in the screen (the real API has no `/team` route yet).

## Verification
Done: `api/test/partners.test.ts` (13 tests, including that a sales user never receives rates and cannot write them), `web/e2e/11-partners.spec.ts` (4 UI tests through the real app) and the navigation spec. By hand, still worth a look: the phone card list and the expiry colours with a document that is already expired.

How it was planned:
API: `npm run typecheck`, `npm run build`, `npm test` in `api/` (the partner tests must prove a sales user never receives rates or payment terms). Web: `npm run typecheck`, `npm run build` in `web/`. By hand: add partners with different roles (one with two), filter by role, add a contact, a service and a document expiring in 10 days, log an activity, check the sales view hides rates, archive and restore.
