# Domain spec: glossary, data model, business rules, roles

Supplied by the business on 29 Oct 2026 as the target for the API. **Partly built:** auth, buyers list, quotes list and products are in `api/` (see `docs/API.md`). The web app in
this repo still runs on mock data with the existing quote/buyer/product shapes. This file supersedes the product part of
`PRODUCT-MODEL-PROPOSAL.md`. Section 5 says where the web app stands against it.

**Database decision (30 Oct 2026): MongoDB (Atlas), not Postgres/Supabase. Sign-in decision: Supabase Auth only (passwords, reset, e-mail confirmation); the data stays in MongoDB.** The tables below become collections. Wherever this
spec says row-level security (RLS) or database triggers, the API enforces the same rules in code (role checks on every route,
immutable issued documents, atomic counters) and tests prove them. Supabase is used for authentication only, never for data. See `docs/API.md`.

## 1. Glossary
- **MT** metric ton (1,000 kg); quantities stored as numeric(10,3) in MT. **PI** Proforma Invoice. **BL / B/L** Bill of Lading.
  **FCL** full container load (20' or 40'). **FOB / CIF** Incoterms (CIF = cost + insurance + freight to the named port).
  **TT** telegraphic transfer. **LC** letter of credit. **HSN** tariff code (cumin = 09093100).
- **CRES** Spices Board exporter registration. **RCMC** APEDA registration. **IEC** import-export code.
  **FIRC / e-BRC** bank proof of foreign payment received. **Sortex** optical-sorted / machine-cleaned grade.

## 2. Data model (core tables)
All tables: `id uuid pk, created_at, updated_at, created_by`; soft delete via `archived_at`.

- `profiles` (user_id, name, role: partner | export_manager | accountant)
- `company_settings` (single row): legal/exporter name, letterhead name, addresses, GSTIN, IEC, FSSAI, CRES, RCMC, bank
  beneficiary, bank details, signatory. **Documents read from here, never hard-coded.**
- `buyers` (company_name, country, city, address, website, source, status, kyc_status: unverified | pending | verified |
  rejected, risk_notes); `buyer_contacts` (buyer_id, name, role, phone, whatsapp, email, is_primary);
  `buyer_documents` (buyer_id, type: CR | trade_license | bank_ref | other, storage_path)
- `products` (name, hsn_code, default_packing) -> `product_grades` (product_id, grade_name, purity, specification,
  is_pesticide_free)
- `deals` (buyer_id, title, stage, expected_value_usd, expected_qty_mt, owner_id, next_followup_at, lost_reason)
- `activities` (deal_id/buyer_id, type: call | whatsapp | email | meeting | note, body, due_at, done_at)
- `samples` (buyer_id, deal_id, grade_id, weight_g, courier, tracking_no, sent_at, cost_inr, feedback, result)
- `costings` (grade_id, purchase_rate_inr_per_kg, processing, packing, cha, inland_freight, ocean_freight_usd, insurance_pct,
  margin_pct, usd_inr_rate, result_fob_usd_mt, result_cif_usd_mt)
- `quotations` + `quotation_items` (grade_id, description, packing, qty_mt, rate_usd_mt, amount_usd)
- `proforma_invoices` + `pi_items` (same shape; quotation_id nullable)
- `orders` (pi_id, buyer_id, status, container_type, container_count)
- `payment_schedules` (order_id, seq, label, percent, amount_usd, trigger: on_packing | on_bl_copy | on_original_bl | advance |
  on_arrival, due_at, received_at, received_amount_usd, bank_ref, firc_path)
- `shipments` (order_id, booking_no, container_no, vessel, port_of_loading, port_of_discharge, etd, eta, bl_no, bl_released_at);
  `shipment_documents` (shipment_id, type: commercial_invoice | packing_list | bl | coo | phyto | lab_report | fumigation |
  insurance, status: pending | uploaded | sent, storage_path)
- `suppliers` + `purchase_lots` (supplier_id, grade_id, qty_mt, rate_inr_kg, lot_no, quality_report_path) +
  `lot_allocations` (lot_id, order_id, qty_mt)
- `compliance_items` (name, number, issued_on, valid_until, reminder_days_before, file_path)
- `document_sequences` (doc_type, financial_year, last_number), updated in a transaction
- `terms_templates` (name, version, document_type, is_active) -> `terms_clauses` (template_id, seq, title, body with {{placeholders}},
  is_locked, is_optional)
- `document_terms` (document_type quotation | pi, document_id, seq, title, body_rendered, is_locked, is_optional, is_one_off): the
  clauses copied onto one document; frozen on finalise
- `audit_log` (table, row_id, action, diff jsonb, user_id)

## 3. Business rules
- **Money:** USD numeric(12,2), INR numeric(14,2). Never JS floats; use a decimal library (e.g. decimal.js).
- Line amount = qty_mt x rate_usd_mt. **Totals are always recomputed server-side**, never trusted from the client.
- Amount in words (USD), e.g. "US Dollars Thirty-Six Thousand Nine Hundred Twenty-Five Only".
- **Numbering** (Indian financial year Apr-Mar): quotation `JM/Q/{seq:000}/{FY}` (JM/Q/001/2026-27); PI
  `JM/PI/{seq:000}/{FY}`. Assigned only when a document is finalised (drafts have no number); never reused.
- **Payment schedule templates:** a PI can use a template (e.g. 20% on packing / 25% on BL copy / 55% on original BL);
  percents must sum to 100.
- **BL release guard:** a shipment cannot be marked bl_released while any payment with trigger on_original_bl (or earlier) is
  unpaid; show a blocking warning; only a partner can override, and the override is audit-logged.
- **Quantity tolerance** +-2% by default (configurable per PI).
- **Buyer KYC:** a PI cannot be finalised for a buyer whose kyc_status is unverified/rejected without a partner override
  (audit-logged).
- **Compliance reminders:** dashboard alert when any compliance_items.valid_until is within reminder_days_before (default 90)
  or past.
- Exporter name on documents comes from company_settings and must match the IEC and bank beneficiary; show a warning in
  settings if they differ.
- **Terms & Conditions are never hard-coded** in components or PDF code. They come from `terms_templates` -> `terms_clauses`,
  managed by a partner in Settings -> Terms Templates.
  - Clause bodies use placeholders filled from the document: `{{incoterm}}`, `{{port_of_loading}}`, `{{port_of_discharge}}`,
    `{{currency}}`, `{{shipment_days}}`, `{{tolerance_pct}}`, `{{valid_until}}`, `{{sample_weight_g}}`, `{{documents_list}}`,
    `{{payment_terms}}`.
  - `{{payment_terms}}` is generated from the document's payment schedule (e.g. "20% on packing, 25% against copy of B/L,
    55% against original B/L"), so the text always matches the actual schedule.
  - Unknown or unfilled placeholders **block finalising** the document, and the screen shows which ones are missing.
  - When a quotation/PI is created, the chosen template's clauses are rendered and copied into `document_terms`. While the
    document is a draft users can edit, reorder, remove optional clauses or add a one-off clause. Locked clauses
    (e.g. jurisdiction, force majeure) can only be edited by a partner.
  - On finalise `document_terms` is **frozen**. Later template edits never change issued documents; editing a template
    creates a new version.
  - Converting a quotation to a PI copies its terms as the starting point.
  - Seed templates: "CIF - TT staged (20/25/55)", "CIF - LC at sight", "FOB - TT advance". Standard clauses: Price basis,
    Payment, Shipment, Quality & tolerance, Packing, Sample & inspection, Claims (7 days with surveyor report), Insurance,
    Validity, Force majeure, Jurisdiction (Gujarat, India), Documents provided.

## 4. Roles and permissions (enforced by the API on every route, not only the UI)
- **partner:** everything, including overrides and settings.
- **export_manager:** buyers, deals, samples, quotations, PIs, shipments; read-only payments.
- **accountant:** payments, FIRC/e-BRC, read-only orders and buyers; no pricing edits.

## 5. Where the web app stands
Built (on mock data): buyers and pipeline, quotations with live calculation and the quotation document/PDF layout, products
and grades (one row per grade), follow-ups, orders placeholder, settings.

| Spec | Web app today |
|---|---|
| Company data only from `company_settings` | The quotation document reads company name, address, contact, licences, signatory and bank from `Settings` (`company`, `bank`). Added optional fields: letterhead_name, website, fssai, cres, rcmc, signatory_name, signatory_title, bank.beneficiary. The Settings screen does not edit them yet. |
| `products` -> `product_grades` | Flat rows, one per grade; grouped by name in the UI. No `hsn_code` at product level, no `is_pesticide_free`. |
| `deals` (stage, expected value/qty) | Not built; the pipeline stage lives on the buyer. |
| `buyer_contacts`, KYC status, `buyer_documents` | One primary contact on the buyer; no KYC status or documents. |
| `samples`, `costings`, `suppliers`, lots | Not built (sample stages exist only as pipeline stages). |
| PIs, orders, payment schedules, shipments, shipment documents | Not built (Orders is a placeholder). |
| Compliance reminders | Not built. |
| Roles partner / export_manager / accountant | App has admin and sales only. |
| Quantity in MT numeric(10,3); amount in words; numbering `JM/Q/001/2026-27` | Quantities and units come from the API; amount in words and numbers come from the API. Nothing is computed in the browser. |
| Terms from `terms_templates` / `terms_clauses`, frozen `document_terms`, placeholders | **Deliberate exception for now (29 Oct 2026):** the standard clauses are written into `web/src/lib/quoteTerms.ts` and printed on the quotation PDF; a quote's own edited list replaces them. No templates, placeholders, versions, locked clauses or freeze rule yet. Remove the exception when the API provides templates. The Settings terms editor still edits plain default lists that the document no longer prints. |
| `{{payment_terms}}` generated from the payment schedule | Not met: the quote form offers a fixed preset list (`strings/quoteForm.ts` `paymentOptions`) plus free text, and there is no payment schedule. To be replaced when payment schedules exist. |
| Audit log, overrides | Not built. |

Open conflicts to settle before the API is written: the sample quotation allows two lines of the same product with
different specifications (e.g. pesticide free), which fits `product_grades.is_pesticide_free`; the current form has no such
flag.
