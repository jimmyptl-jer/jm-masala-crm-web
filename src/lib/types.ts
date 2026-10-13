/**
 * Shared API types: the TypeScript shapes of the JSON the API (api/src/routes) returns and accepts.
 * Types only, no run-time code; imported with `import type` by lib/hooks.ts, lib/api.ts callers, pages/*,
 * components/* and the quote-form model.
 * API contract (mirrors api/src). All money and quantities are DECIMAL STRINGS, never numbers.
 * Conventions used throughout:
 *  - Money, quantities, GST percentages and rates are decimal strings such as '1234.50' (2 decimals for
 *    money). Never convert them with Number() for arithmetic; format them with lib/format.ts.
 *  - ids are uuid strings. `string | null` means the API sends null (not a missing key) when empty.
 *  - Dates: '*_at' fields are ISO 8601 timestamps; the date-only fields next_followup, valid_until, date and
 *    today are 'YYYY-MM-DD' calendar dates in IST (India time).
 *  - A field marked optional (`?`) is only present on some routes, as noted on it.
 *  - Cost and margin figures are internal (NFR-04): they appear only in QuoteDetail (and the draft inputs
 *    that send them) and never in lists, PDFs or price hints.
 */

/** Who a signed-in user is: 'admin' can manage products, users, settings and imports; 'sales' cannot. */
export type Role = 'admin' | 'sales';
/** Whether a buyer or quote is for export (foreign currency, no GST) or domestic (INR with GST). */
export type QuoteType = 'export' | 'domestic';
/** Quote currencies. Domestic quotes are always INR (BR-09); export offers USD, EUR, GBP and AED. */
export type Currency = 'USD' | 'EUR' | 'GBP' | 'AED' | 'INR';
/** Delivery terms printed on export quotes (optional): FOB, CIF, CFR or EXW. */
export type Incoterm = 'FOB' | 'CIF' | 'CFR' | 'EXW';
/**
 * Where a quote is in its life (BR-05). 'draft' = never issued; 'sent' = issued, awaiting reply;
 * 'negotiating'; 'won' and 'lost' = closed (an admin can reopen them); 'expired' = set automatically by the
 * daily job when valid_until has passed.
 */
export type QuoteStatus = 'draft' | 'sent' | 'negotiating' | 'won' | 'lost' | 'expired';
/** Why a quote was lost (BR-13). 'other' also needs a written note. */
export type LostReason = 'price' | 'quality' | 'delivery' | 'no_reply' | 'other';
/** Kinds of entry in a quote's activity log; 'status_change' is written by the system, the rest by users. */
export type ActivityKind = 'call' | 'whatsapp' | 'email' | 'meeting' | 'note' | 'status_change';

/**
 * The signed-in user's profile, from GET /me (and PATCH /me).
 * `email` is the login email (null if the auth record is missing); `full_name` is printed on quotes as
 * "Prepared by"; `phone` is only present on the PATCH /me answer.
 */
export interface Me { id: string; email: string | null; role: Role; full_name: string; phone?: string | null }

/** One user in the admin Users list, from GET /users (admin only): profile plus login email and phone. */
export interface UserRow { id: string; full_name: string; role: Role; phone: string | null; email: string | null }

/**
 * A customer (buyer), from GET /buyers (list), GET /buyers/:id (detail, see BuyerDetail) and embedded in a
 * quote as QuoteDetail.buyer. Buyers are archived, never deleted (BR-12).
 */
export interface Buyer {
  id: string;
  /** Export or domestic; decides which of the fields below apply and the quote currency rules. */
  type: QuoteType;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  /** Export buyers. */
  country: string | null;
  /** Domestic buyers: the Indian state name. */
  state: string | null;
  /** Domestic buyers: two-digit GST state code (e.g. '27'); vs the company's it picks CGST+SGST or IGST. */
  state_code: string | null;
  /** Domestic buyers: 15-character GST number; its first two digits must match state_code. */
  gstin: string | null;
  /** Currency pre-filled on a new quote for this buyer (INR for domestic). */
  default_currency: Currency | null;
  default_incoterm: Incoterm | null;
  default_port: string | null;
  notes: string | null;
  /** True when hidden from the pickers; archived buyers keep their quotes. */
  archived: boolean;
  /** Number of quotes for this buyer. Only present on GET /buyers rows (the list). */
  quote_count?: number;
  /** Newest logged call / WhatsApp / e-mail / meeting / note (ISO timestamp). Only on GET /buyers rows. */
  last_contact_at?: string | null;
  /** Quotes that are Sent or Negotiating. Only on GET /buyers rows. */
  open_quotes?: number;

  // ---- Buyer CRM (all optional to fill in; the API always sends them) ----
  /** What kind of business the buyer is. */
  business_type: BusinessType | null;
  /** Contact person's job title. */
  designation: string | null;
  website: string | null;
  linkedin: string | null;
  /** Importer / exporter registration or other verification details, free text. */
  registration_details: string | null;
  /** Where the lead came from, as a category. */
  channel: Channel | null;
  /** The exact source, e.g. "Alibaba", "Indusfood 2026". */
  lead_source: string | null;
  /** Campaign or inquiry detail, e.g. "Cumin export inquiry". */
  source_detail: string | null;
  /** 'YYYY-MM-DD'. */
  first_inquiry_date: string | null;
  /** What it cost to get this lead, rupees, decimal string. */
  lead_cost: string | null;
  /** Where the buyer is in the sales pipeline. */
  stage: Stage;
  /** A genuine requirement and buying potential (not just an inquiry). */
  qualified: boolean;
  /** Why the buyer was lost; required when the stage is 'lost'. */
  lost_reason: string | null;
  /** Catalogue product names the buyer is interested in. */
  interested_products: string[];
  /** Grade, quantity, packaging, target price, port, certificates: free text. */
  requirements: string | null;
  next_action: string | null;
  /** 'YYYY-MM-DD'. */
  next_followup: string | null;
  /** profiles.id of the salesperson looking after this buyer. */
  assigned_to: string | null;
  /** Unsubscribed / asked not to get marketing e-mail: never included in a campaign. */
  marketing_opt_out: boolean;
  opted_out_at: string | null;
}

/** Sales pipeline stage of a buyer, in order ('lost' is outside the order). Labels: strings/buyers.ts. */
export type Stage =
  | 'new_lead' | 'contacted' | 'qualified' | 'requirements_received' | 'quotation_sent' | 'sample_requested'
  | 'sample_payment_pending' | 'sample_dispatched' | 'sample_approved' | 'negotiation' | 'po_received' | 'won' | 'lost';
/** Lead channel category. */
export type Channel = 'direct' | 'marketplace' | 'website' | 'trade_fair' | 'linkedin' | 'referral' | 'other';
/** Kind of business. */
export type BusinessType = 'importer' | 'distributor' | 'wholesaler' | 'retailer' | 'manufacturer' | 'trader';

/** One currency's money for a lead channel (decimal strings; never added across currencies). */
export interface ChannelMoney { currency: Currency; quoted: string; won: string; profit: string }

/** One row of the sales-by-channel report in GET /buyers/summary. `channel` is a Channel key or 'unassigned'. */
export interface ChannelRow {
  channel: Channel | 'unassigned';
  leads: number;
  qualified: number;
  customers: number;
  /** Customers / qualified as a percentage with one decimal ('12.5'), or null when nobody is qualified. */
  conversion_rate: string | null;
  /** Total lead cost in rupees. */
  lead_cost: string;
  quotes_issued: number;
  won_quotes: number;
  by_currency: ChannelMoney[];
}

/** From GET /buyers/summary: the numbers at the top of the Buyers tab. */
export interface BuyerSummary {
  totals: {
    leads: number; qualified: number; customers: number; lost: number;
    /** Quotes that are Sent or Negotiating. */
    open_quotations: number;
    conversion_rate: string | null;
    /** Buyers whose own next follow-up date is today or earlier. */
    followups_due: number;
    /** Live buyers with no follow-up date set. */
    no_next_action: number;
  };
  /** Active buyers per pipeline stage. */
  stages: Record<Stage, number>;
  channels: ChannelRow[];
}

/** One person from GET /team (any user): who a buyer can be assigned to. */
export interface TeamMember { id: string; full_name: string }
/**
 * Body for POST /buyers and PATCH /buyers/:id: any buyer field except the server-managed ones (id, archived,
 * quote_count); `type` and `company_name` are required.
 */
export type BuyerInput = Partial<Omit<Buyer, 'id' | 'archived' | 'quote_count' | 'last_contact_at' | 'open_quotes' | 'opted_out_at'>> & { type: QuoteType; company_name: string };

/** A buyer with their history, from GET /buyers/:id. */
export interface BuyerDetail extends Buyer {
  /** This buyer's quotes (latest revision of each), same shape as the quote list rows. */
  quotes: QuoteListRow[];
  /**
   * The buyer's activity log, newest first. `happened_at` is an ISO timestamp; `quote_id` / `quote_no` say
   * which quote the entry belongs to (null for a buyer-level note); `user_name` is who logged it.
   */
  activities: { id: string; kind: ActivityKind; body: string; happened_at: string; quote_id: string | null; quote_no: string | null; user_name: string | null }[];
  /** Name of the salesperson in `assigned_to`, or null. */
  assigned_name: string | null;
  /**
   * How this buyer has performed, computed by the API. Counts cover all this buyer's quotes; the money lists are
   * decimal strings per currency (never added across currencies): `quoted` = total of issued quotes, `won` =
   * total of Won quotes.
   */
  performance: {
    quotes_issued: number;
    won: number;
    lost: number;
    by_currency: { currency: Currency; quoted: string; won: string }[];
  };
}

/**
 * A catalogue product, from GET /products (list, wrapped as { data: Product[] }) and returned by
 * POST/PATCH /products and POST/DELETE /products/:id/image. Products are archived, never deleted (BR-12);
 * issued quotes keep their own frozen copy of the product details (BR-03).
 */
export interface Product {
  id: string;
  name: string;
  /** Optional grade or variety. */
  grade: string | null;
  /** Optional free-text specification printed on quotes. */
  specification: string | null;
  /** Quality fields printed in the export quote's product specification table. */
  cleaning: string | null;
  purity: string | null;
  moisture: string | null;
  /** HS code, used on export quotes. */
  hs_code: string | null;
  /** HSN code, used on domestic (GST) quotes. */
  hsn_code: string | null;
  /** GST percent as a decimal string, e.g. '5.00' (domestic quotes only; export has no GST, BR-06). */
  gst_rate: string;
  /** Unit of measure for quantity and rate: metric tonne, kilogram or quintal. */
  unit: 'MT' | 'KG' | 'QTL';
  /** Packing descriptions offered on a quote line; the first is the default. Empty array when none. */
  packing_options: string[];
  /** Indicative selling rate per unit in USD / INR (decimal string), used as a price hint; null if unset. */
  ref_rate_usd: string | null;
  ref_rate_inr: string | null;
  /** True when hidden from the quote form picker (BR-12); old quotes still show it. */
  archived: boolean;
  /** ISO timestamp of the last change. */
  updated_at: string;
  /** Storage path of the packaging image (internal; set only by POST /products/:id/image). */
  image_path?: string | null;
  /** Temporary (about 1 hour) signed link to the packaging image, or null when there is none. Optional because stand-in products built for archived quote lines have none. */
  image_url?: string | null;
}
/**
 * Body for POST /products and PATCH /products/:id: the editable product fields (all optional except `name`).
 * The server-managed fields and the packaging image (which has its own routes) cannot be sent here; PATCH
 * additionally accepts `archived: boolean`, sent on its own to archive or restore.
 */
export type ProductInput = Partial<Omit<Product, 'id' | 'archived' | 'updated_at' | 'image_path' | 'image_url'>> & { name: string };

/** One earlier price for a product: `rate` per unit (decimal string), ISO `date`, and the quote number. */
export interface PriceHint { rate: string; date: string; quote_no: string | null }
/**
 * Pricing hints for one product, from GET /products/:id/price-hints?buyer_id=&currency=. Only ISSUED quotes
 * in the same `currency` count (never drafts), and never any cost (FR-32, BR-04).
 */
export interface PriceHints {
  currency: Currency;
  /** Last rate quoted to the selected buyer, or null when there is none. */
  last_to_buyer: PriceHint | null;
  /** Last rate quoted to any buyer, or null when there is none. */
  last_to_anyone: PriceHint | null;
  /** The product's indicative reference rate (USD / INR only) and ISO date it was last changed, or null. */
  reference: { rate: string; date: string } | null;
}

// ---- quotes ---------------------------------------------------------------------------------
/**
 * One row of the quote list (latest revision of each quote), from GET /quotes and BuyerDetail.quotes. Has no
 * cost or margin (NFR-04). Fields about the money (`grand_total`, `currency`) come from the latest revision.
 */
export interface QuoteListRow {
  id: string;
  /** Base quote number, assigned at first issue (BR-01); null for a draft that was never issued. */
  quote_no: string | null;
  /** quote_no plus a '-R<n>' suffix for revisions 1 and up (BR-01); null for a never-issued draft. */
  number: string | null;
  type: QuoteType;
  status: QuoteStatus;
  /** 'YYYY-MM-DD' (IST) date to chase the buyer; null when none (closed quotes have no follow-up, BR-07). */
  next_followup: string | null;
  /** 'YYYY-MM-DD' (IST) date the quote stops being valid; null until issued. */
  valid_until: string | null;
  /** The latest ISSUED revision number (0 = original); null while never issued. */
  current_revision: number | null;
  /** The newest revision number, which may be an open draft. */
  latest_revision: number;
  /** Whether that newest revision is still being edited ('draft') or frozen ('issued', BR-03). */
  latest_state: 'draft' | 'issued';
  /** Grand total of the latest revision as a decimal string; null when there is no total yet. */
  grand_total: string | null;
  currency: Currency | null;
  buyer_id: string;
  buyer_name: string;
  /** The distinct product names on the quote joined into one text; null when it has no lines. */
  products: string | null;
  /** ISO timestamp of the latest activity; the list is sorted by it, newest first. */
  activity_at: string;
  /** ISO timestamp when the quote was created. */
  created_at: string;
}
/**
 * Paged answer of GET /quotes: `data` is the page of rows, `total` the full match count before paging, and
 * `limit` / `offset` echo the paging that was applied.
 */
export interface QuoteList { data: QuoteListRow[]; total: number; limit: number; offset: number }

/** One product line of a revision, inside Revision.lines (GET /quotes/:id). Amounts are decimal strings. */
export interface QuoteLine {
  id: string;
  /** Order of the line on the quote. */
  position: number;
  product_id: string;
  /** The packing text chosen for this line; null if none. */
  packing: string | null;
  /** Quantity in the product's unit (decimal string). */
  quantity: string;
  /** Price per unit in the quote currency (decimal string). */
  rate: string;
  /** quantity x rate for this line, before discount (decimal string, 2 decimals). */
  amount: string;
  /** GST percent applied; '0.00' on export quotes. */
  gst_rate: string;
  /** Central / state GST (half the rate each, domestic same-state sale) and integrated GST (other state). */
  cgst: string;
  sgst: string;
  igst: string;
  /** Internal purchase cost per unit; null if not entered. Staff only, never printed (NFR-04). */
  cost_rate: string | null;
  /**
   * The product details as they were when the quote was issued, or as they are now for a draft (BR-03).
   * `unit` is 'MT', 'KG' or 'QTL'; `gst_rate` is a decimal string.
   */
  product: { id: string; name: string; grade: string | null; specification: string | null; hs_code: string | null; hsn_code: string | null; unit: string; gst_rate: string };
}

/**
 * Internal profit figures (NFR-04), shown only to signed-in staff: `total` is the margin amount and `pct`
 * the margin percent of the taxable value (one decimal), both decimal strings or null when no line has a
 * cost; `complete` is true only when every line has a cost; `lines` (when present) is the per-line margin.
 */
export interface Margin { total: string | null; pct: string | null; complete: boolean; lines?: (string | null)[] }

/**
 * One revision of a quote (0 = original, then R1, R2 ...), inside QuoteDetail.revisions. An 'issued' revision
 * is frozen and never changed (BR-03); a 'draft' one is still editable. Money fields are decimal strings.
 */
export interface Revision {
  id: string;
  quote_id: string;
  /** Revision number: 0 for the original. */
  revision: number;
  /** Number printed for this revision (quote_no, plus '-R<n>' from revision 1); null until first issue. */
  number: string | null;
  state: 'draft' | 'issued';
  currency: Currency;
  incoterm: Incoterm | null;
  port_loading: string | null;
  port_discharge: string | null;
  payment_terms: string | null;
  delivery_time: string | null;
  /** How many days the quote stays valid from the issue date (whole number). */
  validity_days: number;
  /** Freight and insurance are charged only on export CFR / CIF quotes (BR-10); '0.00' otherwise. */
  freight: string;
  insurance: string;
  /** Bill-level discount as a money amount, not a percentage. */
  discount: string;
  /** Sum of the line amounts, before discount. */
  subtotal: string;
  /** Total of all CGST, SGST and IGST. */
  gst_total: string;
  /** Domestic only: adjustment to the nearest rupee, may be negative (e.g. '-0.19'); '0.00' for export. */
  round_off: string;
  grand_total: string;
  /** The grand total in words, filled when the revision is issued; null for an unissued draft. */
  amount_words: string | null;
  notes: string | null;
  /** The terms and conditions printed on the quote, one text per bullet. */
  terms: string[];
  /** True when the PDF for this revision has been generated and can be fetched (see pdfUrl in lib/api.ts). */
  pdf_ready: boolean;
  /** ISO timestamp when issued; null for a draft. */
  issued_at: string | null;
  issued_by_name: string | null;
  /** Frozen copy of company, bank and buyer details taken at issue (BR-03); null for a draft. Not typed. */
  snapshot: Record<string, any> | null;
  lines: QuoteLine[];
  /** Staff-only margin for this revision; null when no line has a cost or it could not be calculated. */
  margin: Margin | null;
}

/** One entry of a quote's activity log (call, WhatsApp, email, meeting, note or status change). */
export interface Activity {
  id: string;
  kind: ActivityKind;
  /** The note text. */
  body: string;
  /** ISO timestamp of when it happened (the user can back-date it). */
  happened_at: string;
  /** Who logged it; null for system entries or a removed user. */
  user_id: string | null;
  user_name: string | null;
}

/**
 * A whole quote with its buyer, revisions and activity log, from GET /quotes/:id. Also returned by the routes
 * that change a quote (POST /quotes, PUT /quotes/:id/draft, issue, revise, duplicate, status, follow-up,
 * activities, render). Includes staff-only cost and margin figures (NFR-04).
 */
export interface QuoteDetail {
  id: string;
  quote_no: string | null;
  number: string | null;
  type: QuoteType;
  status: QuoteStatus;
  /** Reason the quote was lost (one of LostReason, or free text for 'other'); null otherwise. */
  lost_reason: string | null;
  /** The latest issued revision number; null while the quote has never been issued. */
  current_revision: number | null;
  /** 'YYYY-MM-DD' (IST) follow-up date or null. */
  next_followup: string | null;
  /** 'YYYY-MM-DD' (IST) end of validity, or null until issued. */
  valid_until: string | null;
  grand_total: string | null;
  currency: Currency | null;
  buyer_id: string;
  buyer: Buyer;
  created_by_name: string | null;
  /** Revision number of the draft that is open for editing, or null when every revision is issued. */
  open_draft_revision: number | null;
  /** All revisions with their lines. */
  revisions: Revision[];
  /** The quote's activity log. */
  activities: Activity[];
  /** Non-blocking messages from the save, such as a missing GST state code. Only on the save answers. */
  warnings?: string[];
  /** Result of making the PDF. Only on the issue answer: a failed PDF does not fail the issue. */
  pdf?: { status: 'ready' | 'failed'; error?: string };
}

/**
 * Body for POST /quotes, PUT /quotes/:id/draft and POST /quotes/calculate.
 * One line of the quote: `quantity` and `rate` are decimal strings; `cost_rate` is the optional internal
 * cost per unit.
 */
export interface DraftLineInput { product_id: string; packing?: string | null; quantity: string; rate: string; cost_rate?: string | null }
/**
 * The whole quote form as sent to POST /quotes, PUT /quotes/:id/draft (and POST /quotes/calculate, where
 * `buyer_id` may be left out). Omitted values are filled from the buyer and the settings defaults. Money
 * fields are decimal strings; null or omitted means none. `lines` has at most 50 entries.
 */
export interface DraftInput {
  buyer_id: string;
  type?: QuoteType;
  currency?: Currency;
  incoterm?: Incoterm | null;
  port_loading?: string | null;
  port_discharge?: string | null;
  payment_terms?: string | null;
  delivery_time?: string | null;
  validity_days?: number;
  freight?: string | null;
  insurance?: string | null;
  discount?: string | null;
  notes?: string | null;
  terms?: string[];
  lines: DraftLineInput[];
}

/**
 * Live totals from POST /quotes/calculate for a form that is not saved yet; the same calculator as saving
 * and issuing, so the numbers match. All money is a decimal string with 2 decimals.
 */
export interface CalcResult {
  /** Per input line, in order: amount, GST split and the staff-only margin (null when no cost). */
  lines: { amount: string; gst_rate: string; cgst: string; sgst: string; igst: string; margin: string | null }[];
  subtotal: string;
  discount: string;
  freight: string;
  insurance: string;
  gst_total: string;
  round_off: string;
  grand_total: string;
  amount_words: string;
  /** 'none' = export (no GST); 'intra' = same state (CGST + SGST); 'inter' = other state (IGST). */
  tax_mode: 'none' | 'intra' | 'inter';
  margin: Margin;
  type: QuoteType;
  currency: Currency;
  /** Non-blocking messages, e.g. a missing buyer or company state code (issuing is stricter). */
  warnings: string[];
}

// ---- dashboard / settings -------------------------------------------------------------------
/**
 * A quote whose follow-up is due (today or overdue), in Dashboard.due. Dates are 'YYYY-MM-DD' (IST).
 * `days_since_sent` is days since the latest issue; `days_overdue` is today minus next_followup (0 = due
 * today); `last_kind`, `last_body` and `last_at` (ISO) describe the latest logged activity, or are null.
 */
export interface DueRow {
  id: string; number: string; status: QuoteStatus; next_followup: string; grand_total: string; currency: Currency;
  buyer_id: string; buyer_name: string; buyer_phone: string | null; buyer_whatsapp: string | null;
  days_since_sent: number; days_overdue: number; last_kind: ActivityKind | null; last_body: string | null; last_at: string | null;
}
/**
 * A quote that expires soon, in Dashboard.expiring: `valid_until` is 'YYYY-MM-DD' (IST) and `days_left` is
 * the whole days remaining (0 = valid through today).
 */
export interface ExpiringRow { id: string; number: string; status: QuoteStatus; valid_until: string; grand_total: string; currency: Currency; buyer_id: string; buyer_name: string; days_left: number }
/** The Today screen data, from GET /dashboard. */
export interface Dashboard {
  /** Today's date in IST, 'YYYY-MM-DD'. */
  today: string;
  /** Sent / negotiating quotes with a follow-up due today or earlier, oldest first. */
  due: DueRow[];
  /** Open quotes whose validity ends within the next 3 days, soonest first. */
  expiring: ExpiringRow[];
  /** Counts for the summary tiles; the two "this month" counts start on the 1st (IST). */
  counts: { drafts: number; awaiting_reply: number; negotiating: number; won_this_month: number; lost_this_month: number };
}

/**
 * Company settings printed on every quote, from GET /settings and returned by PUT /settings and
 * POST /settings/logo. Everyone can read it; only admins can change it.
 */
export interface Settings {
  /**
   * Seller details on the PDF. `state_code` is the company's GST state code, compared with the buyer's;
   * `logo_path` is the internal storage path of the logo (show it through `logo_url` instead).
   */
  company: { name: string; address: string; phone: string; email: string; iec: string; gstin: string; state: string; state_code: string; logo_path?: string };
  /** Bank details printed on export quotes. */
  bank: { bank_name: string; branch: string; account_no: string; ifsc: string; swift: string; ad_code: string };
  /** Default terms and conditions copied onto a new export / domestic quote, one text per bullet. */
  export_terms: string[];
  domestic_terms: string[];
  /** Default number of days a new quote stays valid. */
  validity_days: number;
  /** Default number of days until the first follow-up after a quote is issued. */
  followup_days: number;
  /** Temporary (about 1 hour) signed link to the logo, or null when there is none. */
  logo_url: string | null;
}

/**
 * Result of an Excel import, from POST /import/:entity?mode=dry|commit (admin only; entity is 'buyers' or
 * 'products'). 'dry' only checks the file; 'commit' saves, and only if every row is valid.
 */
export interface ImportReport {
  mode: 'dry' | 'commit';
  /** Rows read from the sheet. */
  total: number;
  /** Rows that passed validation. */
  valid: number;
  /** Rows actually saved: 0 for a dry run or when any row had an error. */
  saved: number;
  /** Problems found: spreadsheet row number, the column (when known) and the message. */
  errors: { row: number; field?: string; message: string }[];
  /** The first 10 valid rows on a dry run (empty after a commit). */
  preview: Record<string, unknown>[];
}

/** The ways a quote can be sent straight to the buyer from the app. */
export type SendChannel = 'email' | 'whatsapp';

/**
 * From GET /send-channels: which channels the server can really send on (credentials configured). A false
 * channel is still offered, but as "opens your own mail program / WhatsApp" (the Share sheet).
 */
export type SendChannels = Record<SendChannel, boolean>;

/** Answer of POST /quotes/:id/revisions/:rev/send: where it went, and the printed quote number. */
export interface SendResult {
  channel: SendChannel;
  /** The e-mail address, or the WhatsApp number in digits. */
  to: string;
  number: string;
}

// ---- Marketing (e-mail campaigns) ----
/** Kinds of saved e-mail template. */
export type TemplateKind = 'company_intro' | 'catalogue' | 'product_promo' | 'new_crop' | 'price_update' | 'followup';

/** A saved e-mail template. Variables {buyer_name} {company} {product} {salesperson} {our_company} are filled in per buyer. */
export interface MarketingTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  subject: string;
  body: string;
  /** Text of the call-to-action button, e.g. "Request a Quotation"; null = no button. */
  cta_label: string | null;
  archived: boolean;
}

/** Kind of a marketing file. */
export type AssetKind = 'catalogue' | 'profile' | 'image' | 'other';

/** An uploaded marketing file (catalogue PDF, company profile, image) from GET /marketing/assets. */
export interface MarketingAsset {
  id: string;
  name: string;
  kind: AssetKind;
  content_type: string;
  size_bytes: number;
  product_id: string | null;
  created_at: string;
  /** Temporary (1 hour) link to open the file. */
  url: string | null;
}

/** The rules of "who gets this campaign" when mode is 'filtered'. Every empty list / null / false means no restriction. */
export interface AudienceFilters {
  type: 'all' | QuoteType;
  countries: string[];
  business_types: BusinessType[];
  /** Catalogue product names without grade. */
  products: string[];
  groups: ('prospect' | 'qualified' | 'opportunity' | 'customer' | 'lost')[];
  qualified_only: boolean;
  open_quotes_only: boolean;
  /** Only buyers with no logged contact for this many days (or never). */
  inactive_days: number | null;
}

/** Who a campaign goes to: every eligible buyer, those matching the filters, or the chosen buyers. */
export interface Audience {
  mode: 'all' | 'filtered' | 'selected';
  filters: AudienceFilters;
  buyer_ids: string[];
}

/** The content of a campaign, as sent to POST/PATCH /marketing/campaigns. */
export interface CampaignInput {
  name: string;
  template_id: string | null;
  subject: string;
  body: string;
  cta_label: string | null;
  product_ids: string[];
  asset_ids: string[];
  include_product_images: boolean;
  audience: Audience;
}

/** A campaign as stored. */
export interface Campaign extends CampaignInput {
  id: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

/** One row of the campaign history (GET /marketing/campaigns). */
export interface CampaignListRow {
  id: string;
  name: string;
  status: Campaign['status'];
  subject: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_by_name: string | null;
  total: number;
  sent: number;
  failed: number;
  queued: number;
  skipped: number;
  replied: number;
}

/** Why buyers matching an audience were not included. */
export interface AudienceExcluded { opted_out: number; no_email: number; invalid_email: number; duplicate_email: number }

/** Answer of POST /marketing/audience/preview. `count` = buyers who would really receive the e-mail. */
export interface AudiencePreview {
  matched: number;
  count: number;
  excluded: AudienceExcluded;
  buyers: { id: string; company_name: string; contact_name: string | null; email: string }[];
}

/** Answer of POST /marketing/campaigns/:id/preview: the finished e-mail and who would get it. */
export interface CampaignPreview {
  subject: string;
  html: string;
  text: string;
  recipients: { count: number; matched: number; excluded: AudienceExcluded; sample: { id: string; company_name: string; email: string }[] };
  files: { name: string; size: number }[];
  sample_buyer: { id: string; company_name: string };
}

/** One recipient of a sent campaign. */
export interface CampaignRecipient {
  id: string;
  buyer_id: string;
  email: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  sent_at: string | null;
  replied: boolean;
  replied_at: string | null;
  company_name: string;
  contact_name: string | null;
}

/** Answer of GET /marketing/campaigns/:id. */
export interface CampaignReport {
  campaign: Campaign;
  recipients: CampaignRecipient[];
  totals: { total: number; sent: number; failed: number; queued: number; skipped: number; replied: number };
  /** Quotations issued for the recipients since the send began; money per currency as decimal strings. */
  attribution: { quotes_created: number; by_currency: { currency: Currency; quoted: string; won: string }[] };
}

// ---- Trade Intelligence (market statistics, discovered importers, shipments) ----
/** A customs (HS) code being tracked, from GET /trade/hs. */
export interface HsCode { hs6: string; label: string; product_name: string | null; tracked: boolean; stats_rows: number; shipment_rows: number }

/** One country in a market report (USD and kg). */
export interface MarketCountry {
  country: string;
  years: Record<string, { value: number; qty: number }>;
  latest_value: number;
  latest_qty: number;
  /** USD per metric tonne in the latest year, or null. */
  unit_price_mt: number | null;
  /** Share of the latest year's total value, percent. */
  share: number;
  /** Change in value from the year before, percent, or null. */
  growth: number | null;
}

/** Answer of GET /trade/market. */
export interface MarketReport {
  hs6: string[];
  flow: 'export' | 'import';
  /** The data source used (only one is used, so nothing is counted twice). */
  source: string | null;
  sources: { source: string; rows: number }[];
  years: number[];
  latest_year: number | null;
  totals: Record<string, { value: number; qty: number }>;
  countries: MarketCountry[];
}

/** Numbers at the top of the Trade Intelligence tab (GET /trade/summary). */
export interface TradeSummary {
  companies: number; shortlisted: number; converted: number; with_shipments: number; shipments: number; last_shipment: string | null;
  stat_rows: number; first_year: number | null; last_year: number | null; imports: number; last_import: string | null;
}

/** Status of a discovered company. */
export type TradeStatus = 'new' | 'shortlisted' | 'converted' | 'rejected';
/** What kind of business a discovered company is. */
export type TradeRole = 'importer' | 'distributor' | 'exporter' | 'manufacturer' | 'retailer' | 'unknown';

/** A discovered company with its shipment evidence and score (a row of GET /trade/buyers). */
export interface TradeBuyerRow {
  id: string; name: string; country: string | null; role: TradeRole; status: TradeStatus; source: string;
  email: string | null; phone: string | null; website: string | null; contact_name: string | null; buyer_id: string | null;
  shipments: number; last_shipment: string | null; qty_12m: number; count_24m: number; india_shipments: number; unknown_origin: number; suppliers: number; hs6s: string[];
  /** 0-100, from shipment evidence; 0 with grade '-' when there is none. */
  score: number;
  grade: 'A' | 'B' | 'C' | '-';
  in_crm: boolean;
  crm_buyer_id: string | null;
}

/** One shipment record. */
export interface TradeShipment {
  id: string; shipment_date: string | null; hs6: string | null; hs_code?: string | null; description: string | null; quantity_kg: number | null; value_usd: number | null;
  origin_country: string | null; origin_port: string | null; destination_country: string | null; destination_port: string | null; supplier_name: string | null;
  bol_number: string | null; source: string; is_estimate: boolean;
}

/** Answer of GET /trade/buyers/:id. */
export interface TradeBuyerDetail {
  company: { id: string; name: string; country: string | null; role: TradeRole; status: TradeStatus; source: string; email: string | null; phone: string | null; website: string | null; contact_name: string | null; notes: string | null; buyer_id: string | null };
  evidence: { shipments: number; last_shipment: string | null; qty_12m: number; count_24m: number; india_shipments: number; unknown_origin: number };
  score: number;
  grade: 'A' | 'B' | 'C' | '-';
  parts: { recency: number; frequency: number; volume: number; india: number; match: number };
  shipments: TradeShipment[];
  monthly: { month: string; qty_kg: number }[];
  suppliers: { name: string; shipments: number; qty_kg: number; last: string | null }[];
  origins: { name: string; shipments: number; qty_kg: number; last: string | null }[];
  crm_buyer: { id: string; company_name: string; stage: Stage } | null;
}

/** A row of the shipment explorer. */
export interface TradeShipmentRow extends TradeShipment { company_id: string; company_name: string; company_country: string | null }

/** The kinds of file that can be imported. */
export type ImportKind = 'stats' | 'shipments' | 'companies';

/** Answer of POST /trade/imports/:kind (dry run or real import). */
export interface TradeImportReport {
  mode: 'dry' | 'commit';
  kind: ImportKind;
  total: number; valid: number; saved: number; duplicates: number; new_companies: number;
  errors: { row: number; message: string }[];
  summary: Record<string, string | number>;
  preview: Record<string, unknown>[];
  import_id: string | null;
}

/** One entry of the import history. */
export interface TradeImportRow {
  id: string; kind: ImportKind; filename: string | null; source: string; rows_total: number; rows_saved: number; rows_skipped: number;
  created_at: string; created_by_name: string | null;
}
