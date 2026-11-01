# Quotation document and PDF

How a quote becomes the PDF that is attached to the e-mail. Source of the design: `JM_Masala_Letterhead_Print.pdf` and
`JM_Masala_Quotation_Format.pdf` supplied by the business (sample quote JM/Q/001/2026-27 for New Victory Mark LLC, Oman).

## Flow
1. The quote form builds the quotation from the buyer, products, terms and the totals returned by `POST /quotes/calculate`.
   The right-hand preview shows it on the letterhead (`web/src/components/quote/QuoteDocument.tsx`).
2. **Issue** freezes the revision and numbers it (BR-01, BR-03). **The API renders the PDF from the frozen snapshot in this
   same layout** and stores it (`POST /quotes/:id/revisions/:rev/render` retries a failed render).
3. **Send** attaches that stored PDF to the e-mail (and offers the signed link for WhatsApp). Sending stays a deliberate
   action; Issue alone never sends.
4. Until the API exists, "Download PDF" in the preview prints the same component to PDF through the browser (print dialog,
   Save as PDF). That is a working copy, not the issued document.

## Page layout (A4, top to bottom)
- **Letterhead:** logo, company name, tagline, corporate office, phone, e-mail, web; licence strip (GSTIN, IEC, FSSAI central
  licence, Spices Board CRES, APEDA RCMC); faded watercolour behind the lower half; double rule at the foot.
- **Title:** QUOTATION.
- **Two-column box:** left "Quotation to" (buyer name, address lines, Attn / Tel, e-mail); right Quotation No., Date, Valid
  Until (with days), then Price Basis (incoterm + port), Port of Loading, payment, delivery, Currency.
- **Product table:** Sr, Product & Specification, HSN (HS for export), Packing, Qty (unit), Rate (currency/unit), Amount
  (currency); summary rows (subtotal, discount, freight, insurance, GST) only when non-zero; TOTAL.
- **Amount in words** (from the API), **Terms & Conditions** (numbered, bold label then text: Price, Payment, Shipment, Quality, Documents, Validity for export; Payment, Delivery, Quality, Validity for domestic). **Interim decision (29 Oct 2026): these standard clauses are written into the code** (`web/src/lib/quoteTerms.ts`, wording from the sample format), using the quote's own incoterm, port, payment terms, shipment time and validity when filled in. A quote's own edited terms list, if it has one, replaces them. This is replaced by terms templates from the API (`docs/DOMAIN-SPEC.md`),
  **Notes** if any, **Bank details** beside the **signature block**, and the closing line: "This is a commercial
  quotation and not a tax invoice. A Proforma Invoice will be issued on confirmation of order."
- Quotation numbers look like `JM/Q/001/2026-27` (serial, then financial year), kept separate from Proforma Invoices.

## The template and its data contract
The quotation is a **data-driven template**: `QuoteDocument` (`web/src/components/quote/QuoteDocument.tsx`) takes one object, `QuoteDocData`, and draws the whole page from it (letterhead included). It reads nothing else, so any caller can push data into it: the quote form today (`buildDocData` in `QuotePreview.tsx` maps form, buyer, products, settings and the calculation into it) and, later, the API when it renders the issued PDF.

| Field | Meaning |
|---|---|
| `company` | name, office, phone, email, web, `licences` (rows of [label, value]), `signatory` {name, title}: from company settings |
| `number`, `date`, `validUntil` | printed quote number (null = Draft), date, "dd.mm.yyyy (N days)" |
| `buyer` | name, address `lines`, `attn`, `email` |
| `details` | extra [label, value] rows after the validity row (price basis, port of loading, currency, enquiry ref ...) |
| `qtyHead`, `rateHead`, `amountHead` | column captions, e.g. "Qty (MT)", "Rate (USD/MT)", "Amount (USD)" |
| `lines[]` | name, spec (may contain line breaks), hsn, packing, qty, rate, amount, all already formatted text |
| `summary[]`, `total`, `amountWords` | [label, value] rows above the total (subtotal, discount, freight, GST ...), the total, the amount in words: all from the API |
| `terms[]` | {label, text} clauses (today the standard set in `lib/quoteTerms.ts`; later the frozen `document_terms`) |
| `bank[]`, `notes` | [label, value] bank rows (from settings), printed notes |

Try it: open `/quotes/template` (also reachable from the Ctrl+K search). Edit the JSON and the page redraws; **Download PDF** prints it. The starting data is `web/src/lib/sampleQuote.ts` (the Oman cumin example; the bank block uses placeholders). For a server-side PDF the API should build the same `QuoteDocData` and render this template (server-side render of the component, or a headless browser opening this page with the data), so the app preview and the emailed PDF always match.

## Rules
- The browser only formats. Totals, GST, amount in words and the quote number come from the API.
- Cost rate and margin never appear on the document.
- An issued PDF never changes; a revision produces a new PDF.

## To do when the API is added
- Replace `web/src/lib/quoteTerms.ts` with the API's terms templates and frozen `document_terms`.
- Company facts are read from Settings (`Settings.company` / `Settings.bank`: letterhead name, address, contact, website,
  GSTIN, IEC, FSSAI, CRES, RCMC, signatory, bank beneficiary), never hard-coded (`docs/DOMAIN-SPEC.md`). The mock settings
  carry sample values; the Settings screen does not edit the new fields yet. Only the tagline and the closing note stay as
  constants in `web/src/lib/letterhead.ts`.
- Render the PDF server-side in the layout above (same fonts, logo and watercolour from `web/public/letterhead/`).
- Store the PDF with the revision, attach it in the send step, and keep the signed link.
- Quantity total and container line (for example "1 x 20' FCL", total MT) are in the sample but not in the data yet.
- Warn in Settings when the exporter name, IEC and bank beneficiary differ (rule in `docs/DOMAIN-SPEC.md`).
- An Excel/Word editable template was offered separately; it is not part of this build.
