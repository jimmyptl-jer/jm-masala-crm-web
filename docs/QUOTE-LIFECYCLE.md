# The life of a quote

This walks one quote from the first click to Won/Lost, saying **which screen you use, which API route
runs, and what changes in the database** at each step. Read this once and the rest of the code will make sense.

Legend: 🖥 screen (web) · 🔌 API route · 🗄 database · 📄 PDF

> Status: the routes for status, follow-up, activity and `GET /dashboard` are built. **Revise, Duplicate and Delete draft are not built yet** (sections 5 and 7 describe the plan). The data lives in MongoDB: one `quotes` document holds the revisions (with their lines) and the activity log; there are no SQL tables, triggers or transactions.

---

## 0. Before you can quote: buyers and products

| Step | 🖥 Screen | 🔌 Route |
|---|---|---|
| Add a buyer (company, contact, country/currency/Incoterm or GST state) | Buyers → *Add buyer* (or quick-add inside the quote form) | `POST /buyers` |
| Add a product (name, grade, HS/HSN code, GST %, unit, packing options, reference rates) | Products → *Add product* (admin) | `POST /products` |
| Fill company, bank, default terms | Settings | `PUT /settings` |

A buyer is **Export** (needs a country) or **Domestic** (needs a state + GST state code — that code decides
CGST+SGST vs IGST). Buyers/products are never deleted, only **archived**, so old quotes keep their history.

## 1. Create a draft  🖥 *New quote* → 🔌 `POST /quotes`

You choose a buyer; the form fills type, currency, Incoterm and port from the buyer. You add product lines
(product, packing, quantity, rate). While you type, the form asks the API for the totals:

* 🔌 `POST /quotes/calculate` — runs `calculate()` and returns subtotal, GST, round-off, grand total, amount in
  words and (if you entered a cost) margin. **Nothing is saved.** It is called ~0.4 s after you stop typing.
* 🔌 `GET /products/:id/price-hints` — shows "last rate to this buyer / to anyone / reference" chips under the rate.
  Only **issued** quotes count (drafts are ignored).

*Save draft* creates the quote and its first revision **R0 in state `draft`**: no number, no PDF, fully editable.
🗄 one `quotes` document with revision R0 (state = draft) and its lines inside it. Pass `inquiry_id` (an existing, not archived inquiry) to link the quote to the inquiry it answers.

## 2. Issue it  🖥 *Issue & generate PDF* → 🔌 `POST /quotes/:id/issue`

This is the most important operation. MongoDB (standalone) has no transactions, so the API uses a claim and one final write:

1. **claims** the open draft with one atomic update (`issuing_at`): two taps cannot issue twice (the second gets 409), and a save of the draft during the issue is refused with 409 `conflict`;
2. checks the claimed draft is complete (≥ 1 line, payment terms, Incoterm + the right port for export);
3. **recalculates every number from the claimed document** (it never trusts saved totals);
4. takes the next number from the counter → `JM/Q/005/2026-27` (first issue only), as late as possible, and gives it back if the next step fails;
5. in **one final update** (filtered on the claim and the draft version) writes the **snapshot** — buyer, company, bank, "prepared by" name — and each product's name/grade/codes into the revision, flips it to `issued`, sets quote status **Sent**, valid-until = today + validity days, next follow-up = today + the follow-up days in Settings, adds the audit entry to `activities` and clears the claim.

A stale dollar rate (not set today) is still used and shows a warning. If the server dies between steps 4 and 5 one number stays unused (a gap) and the claim expires after 60 seconds, after which the draft can be issued again.

Only **after** the issue does it make the 📄 PDF from the snapshot and store it. If the PDF step fails the quote
**stays issued** (it already has its number) and you press *Retry PDF* (🔌 `POST /quotes/:id/revisions/:rev/render`).

From this moment the draft routes refuse to touch that revision (their update filter needs `latest_state: 'draft'`; MongoDB has no triggers). Change the buyer's
address tomorrow and this PDF does not change — it is rendered from the snapshot, not from the buyer table.

## 3. Share it  🖥 Quote detail → *Share*

🔌 `GET /quotes/:id/revisions/:rev/pdf?json=1` returns a **signed link valid 30 days** (works without login).
The Share sheet copies it or opens WhatsApp / email with a prefilled message. Cost and margin are never in the PDF.

## 4. Follow up  🖥 *Today*

🔌 `GET /dashboard` lists Sent or Negotiating quotes whose follow-up date is today or earlier, those expiring within 3 days, and the counts (drafts, awaiting reply, negotiating, won and lost this month).
Each card has Call, WhatsApp, **Log activity** and Open.

* *Log activity* → 🔌 `POST /quotes/:id/activities` (call / WhatsApp / email / meeting / note) and can set the next
  follow-up date in the same step. The card leaves Today until that date.
* *Change* follow-up date → 🔌 `PATCH /quotes/:id/followup` (only while the quote is Sent or Negotiating; `null` removes it).

## 5. Negotiate → revise  🖥 *Revise* → 🔌 `POST /quotes/:id/revise`

When prices change you do **not** edit the issued quote. *Revise* copies the latest issued revision into a new
**draft R1** (R2, R3 … later). You change it, then issue again:

* number becomes `JM/Q/005/2026-27-R1` (same quote number, `-R1` suffix);
* if the status was Sent (or Expired) it becomes **Negotiating**;
* R0 and its PDF stay exactly as they were — open the **R0 tab** to see them.

Only the latest revision can be revised, and only while the quote is Sent, Negotiating or Expired.

## 6. Close it  🖥 *Change status* → 🔌 `PATCH /quotes/:id/status`

```
 Draft ──issue──▶ Sent ──▶ Negotiating ──▶ Won
                    │            │        └▶ Lost  (a reason is required)
                    └────────────┴──▶ Won / Lost
 Sent ──(validity date passes)──▶ Expired   (worked out whenever the quote is read; no daily job)
 Expired ──issue a new revision──▶ Negotiating
 Won / Lost ──admin "Reopen"──▶ Negotiating
```

Won, Lost and Expired **clear the follow-up date** (an expired quote is shown with none). *Lost* needs one reason: `price`, `quality`, `delivery`, `no_reply`, or `other` (with a note, stored as `other: <note>`). An invalid move is 409 `invalid_transition`; a Negotiating quote does not expire. Only an admin can reopen. Every status change and every issue writes a row to `activities` (who, when).

## 7. Other things you can do with a quote

| Action | 🖥 | 🔌 |
|---|---|---|
| Copy a quote for another buyer | *More → Duplicate* | `POST /quotes/:id/duplicate` |
| Delete a quote that was **never issued** | draft page → *Delete draft* | `DELETE /quotes/:id` |
| Find quotes (status, type, buyer, product, dates, search) | Quotes | `GET /quotes` |
| Export the filtered list to Excel | Quotes → *Export* | `GET /quotes/export.xlsx` |
| Bulk-load buyers or products from Excel | Settings → Import | `POST /import/:entity` |

## What can never happen (and why)

| It cannot… | Because |
|---|---|
| Change an issued quote | the draft routes only update a revision while `latest_state` is `draft` (BR-03; MongoDB has no triggers) |
| Reuse a number | the counter is one atomic increment and `quote_no` is a unique index (BR-01). A number can be **skipped** only if the server dies in the instant between taking it and saving the issue (a failed issue hands it back) |
| Show cost/margin on a PDF | the PDF is built by copying named fields only; and the API leaves `cost_rate` and `margin` out of every answer for anyone but an admin (NFR-04) |
| Lose a paisa to rounding | all money is exact decimal text; lines rounded to 2 places, domestic total to the rupee with a visible round-off (BR-11) |
| Delete a buyer/product that has quotes | buyers and products are only archived, never deleted (BR-12) |
