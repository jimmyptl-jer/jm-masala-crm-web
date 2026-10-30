/**
 * Form model of the quote screen: the state shape (FormState, LineState) and the pure functions that
 * convert between that state and the API's request/response shapes.
 *
 * Used by pages/QuoteForm.tsx and the other files in this folder. No React and no API calls here.
 * Key rule: money and quantities stay as decimal STRINGS from typing to sending; there is no arithmetic in
 * this file (the API's calculator does all of it, BR-11). Also encodes BR-09/BR-10 (currency and freight /
 * insurance rules per quote type) and the field-key mapping of API validation errors onto inputs.
 * Endpoints whose bodies are built here: POST /quotes/calculate, POST /quotes, PUT /quotes/:id/draft.
 */
// Form model for the quote screen. Money and quantities stay as decimal STRINGS; no arithmetic here.
import type { Buyer, Currency, DraftInput, DraftLineInput, Incoterm, Product, QuoteDetail, QuoteType, Revision } from '@/lib/types';
import { t } from '@/strings';

// currencies selectable on an export quote (domestic quotes are always INR); same as the API's list
export const EXPORT_CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'AED'];
// delivery terms offered on export quotes (the API accepts exactly these four)
export const INCOTERMS: Incoterm[] = ['FOB', 'CIF', 'CFR', 'EXW'];
// sentinel option value meaning "Other (type your own)" in the payment-terms and packing dropdowns
export const OTHER = '__other__';

/**
 * One product line as the form holds it. Every number is TEXT (see the file header).
 *  - uid: stable client-side id (`line-1`, ...) used as the React key and to find the line; not sent to the
 *    API.
 *  - product_id: chosen product, '' = none yet.
 *  - packing: packing text (a preset option of the product or free text); `packingOther` = the user chose
 *    "Other", so the free-text box stays visible even while the text is empty.
 *  - quantity / rate: what the user typed (may be "5." or ".5" while typing; see `normNum`).
 *  - cost_rate: internal purchase cost per unit, '' = unknown (never printed, NFR-04).
 */
export interface LineState {
  uid: string;
  product_id: string;
  packing: string;
  packingOther: boolean;
  quantity: string;
  rate: string;
  cost_rate: string;
}

/**
 * Whole quote form state. All amounts and numbers are strings, exactly as typed (never `number`).
 *  - buyer_id: chosen buyer, '' = none yet.  - type / currency / incoterm: '' incoterm = not chosen.
 *  - port_loading / port_discharge / payment_terms / delivery_time / notes: free text.
 *  - paymentOther: the user chose "Other" for payment terms (keeps the text box visible).
 *  - validity: validity days as typed ('' = use the Settings default on the server).
 *  - freight / insurance / discount: decimal text, '' = none.
 *  - terms: the printed terms & conditions list; `undefined` means "untouched": the API fills the defaults
 *    from Settings for the quote type; otherwise the list is sent back unchanged.
 *  - lines: the product lines.
 */
export interface FormState {
  buyer_id: string;
  type: QuoteType;
  currency: Currency;
  incoterm: Incoterm | '';
  port_loading: string;
  port_discharge: string;
  payment_terms: string;
  paymentOther: boolean;
  delivery_time: string;
  validity: string;
  freight: string;
  insurance: string;
  discount: string;
  notes: string;
  /** undefined = let the API fill the defaults from Settings; otherwise sent back unchanged. */
  terms: string[] | undefined;
  lines: LineState[];
}

// module-level counter behind `newUid`; only ever increases, so ids are unique within a page session
let counter = 0;
/** Returns a new unique line id like `line-7` (client-side only). */
export const newUid = () => `line-${++counter}`;

/** An empty product line (all fields blank). */
export const newLine = (): LineState => ({ uid: newUid(), product_id: '', packing: '', packingOther: false, quantity: '', rate: '', cost_rate: '' });

/**
 * The starting state of a brand-new quote form: export, USD, no buyer, no terms chosen, one empty line.
 * The validity-days default is filled in later from Settings (see QuoteForm).
 */
export const emptyForm = (): FormState => ({
  buyer_id: '', type: 'export', currency: 'USD', incoterm: '', port_loading: '', port_discharge: '',
  payment_terms: '', paymentOther: false, delivery_time: '', validity: '', freight: '', insurance: '', discount: '',
  notes: '', terms: undefined, lines: [newLine()],
});

/**
 * Do freight and insurance apply to this quote? Only for EXPORT quotes with Incoterm CIF or CFR (BR-10).
 * @param type - 'export' | 'domestic'.
 * @param incoterm - the Incoterm text ('' when not chosen).
 * Mirrors `chargesApply` in api/src/services/calc.ts, which is the authority; keep the two in step.
 * Used to show/hide the freight and insurance inputs and to send 0 for them when they do not apply.
 */
export const chargesApply = (type: QuoteType, incoterm: string) => type === 'export' && (incoterm === 'CIF' || incoterm === 'CFR');

/**
 * Normalises a half-typed decimal string so the API accepts it.
 * @param s - what the user typed.
 * @returns the trimmed text with a leading "." turned into "0." (".5" -> "0.5") and a trailing "." removed
 *   ("5." -> "5"). The API rejects both forms. No numeric conversion: the digits are kept as text.
 */
export function normNum(s: string): string {
  let v = s.trim();
  if (v.startsWith('.')) v = `0${v}`;
  if (v.endsWith('.')) v = v.slice(0, -1);
  return v;
}
// true if the text has at least one non-zero digit, i.e. is > 0 ("0", "0.00", "" are not)
const isPositive = (s: string) => /[1-9]/.test(normNum(s));
// true for plain decimal text like "12" or "12.50" (after normNum); zero is allowed
const isNumber = (s: string) => /^\d+(\.\d+)?$/.test(normNum(s));
// API sends "0.00" for unused freight/insurance/discount; show those as empty inputs instead
const zeroToBlank = (v: string | null | undefined) => (!v || /^0*\.?0*$/.test(v) ? '' : v);

/**
 * Should the payment-terms dropdown show "Other" with a free-text box?
 * True when the user chose "Other" explicitly, or when the saved text is not one of the preset options
 * (so a draft saved with custom terms re-opens showing them in the text box).
 */
export const isOtherPayment = (f: Pick<FormState, 'payment_terms' | 'paymentOther'>) =>
  f.paymentOther || (f.payment_terms !== '' && !t.quoteForm.paymentOptions.includes(f.payment_terms));

/**
 * Should this line's packing dropdown show "Other" with a free-text box?
 * @param l - the line.
 * @param product - the line's product (undefined if unknown).
 * True when "Other" was chosen explicitly, or the packing text is not one of the product's packing options.
 */
export const isOtherPacking = (l: LineState, product: Product | undefined) =>
  l.packingOther || (l.packing !== '' && !!product && !product.packing_options.includes(l.packing));

/**
 * Are the buyer-derived shipping terms already filled in, so the Terms card can start collapsed?
 * Domestic: always true. Export: needs an Incoterm, and a port of discharge for CIF/CFR or a port of loading
 * (place of pickup for EXW) for FOB/EXW. Same rule the API applies when issuing (`cannot_issue`).
 */
export function shippingComplete(f: FormState): boolean {
  if (f.type === 'domestic') return true;
  if (!f.incoterm) return false;
  return f.incoterm === 'CIF' || f.incoterm === 'CFR' ? !!f.port_discharge.trim() : !!f.port_loading.trim();
}

/**
 * The form values a buyer pre-fills when chosen (FR-15 quick-add and the buyer picker both use it).
 * @param b - the buyer.
 * @returns `{ type, currency, incoterm, port_discharge }`: domestic buyers give INR and no Incoterm/port;
 *   export buyers give their default currency (USD if none or INR), default Incoterm and default port.
 */
export function buyerDefaults(b: Buyer): Pick<FormState, 'type' | 'currency' | 'incoterm' | 'port_discharge'> {
  const domestic = b.type === 'domestic';
  return {
    type: b.type,
    currency: domestic ? 'INR' : b.default_currency && b.default_currency !== 'INR' ? b.default_currency : 'USD',
    incoterm: domestic ? '' : b.default_incoterm ?? '',
    port_discharge: domestic ? '' : b.default_port ?? '',
  };
}

/**
 * Converts a saved draft revision (from GET /quotes/:id) into form state for editing.
 * @param d - the quote (buyer id, type).
 * @param rev - the draft revision whose terms and lines are loaded.
 * @returns FormState with nulls turned into '' and numbers kept as the API's strings; freight, insurance and
 *   discount of 0 become empty inputs; `validity` is the saved days as text; `paymentOther` starts false (it
 *   is derived by `isOtherPayment`); a revision without lines gets one empty line.
 */
export function formFromRevision(d: QuoteDetail, rev: Revision): FormState {
  return {
    buyer_id: d.buyer_id,
    type: d.type,
    currency: rev.currency,
    incoterm: rev.incoterm ?? '',
    port_loading: rev.port_loading ?? '',
    port_discharge: rev.port_discharge ?? '',
    payment_terms: rev.payment_terms ?? '',
    paymentOther: false,
    delivery_time: rev.delivery_time ?? '',
    validity: String(rev.validity_days),
    freight: zeroToBlank(rev.freight),
    insurance: zeroToBlank(rev.insurance),
    discount: zeroToBlank(rev.discount),
    notes: rev.notes ?? '',
    terms: rev.terms,
    lines: rev.lines.length
      ? rev.lines.map((l) => ({
        uid: newUid(), product_id: l.product_id, packing: l.packing ?? '', packingOther: false,
        quantity: l.quantity, rate: l.rate, cost_rate: l.cost_rate ?? '',
      }))
      : [newLine()],
  };
}

/**
 * Converts one form line into the API's line shape: packing trimmed ('' -> null), quantity and rate
 * normalised with `normNum`, empty cost rate -> null.
 */
const lineInput = (l: LineState): DraftLineInput => ({
  product_id: l.product_id,
  packing: l.packing.trim() || null,
  quantity: normNum(l.quantity),
  rate: normNum(l.rate),
  cost_rate: normNum(l.cost_rate) || null,
});

/**
 * Builds the request body shared by POST /quotes/calculate, POST /quotes and PUT /quotes/:id/draft.
 * @param f - the form state.
 * @param lines - the already converted lines to include (the caller decides which lines count).
 * Rules applied: domestic quotes send INR and null Incoterm/ports; freight and insurance are sent only when
 * `chargesApply`, otherwise "0"; blank discount is "0"; blank texts become null; `validity_days` is sent only
 * for a whole number from 1 to 365 (otherwise omitted so the API uses the Settings default); `terms` is sent
 * only when the user's list exists (undefined = let the API choose).
 */
function baseBody(f: FormState, lines: DraftLineInput[]): DraftInput {
  const domestic = f.type === 'domestic';
  const charges = chargesApply(f.type, f.incoterm);
  // whole days, not money (so parseInt is fine); an out-of-range or empty value is simply not sent
  const days = /^\d+\.?$/.test(f.validity) ? parseInt(f.validity, 10) : undefined; // whole days, not money
  return {
    buyer_id: f.buyer_id,
    type: f.type,
    currency: domestic ? 'INR' : f.currency,
    incoterm: domestic ? null : f.incoterm || null,
    port_loading: domestic ? null : f.port_loading.trim() || null,
    port_discharge: domestic ? null : f.port_discharge.trim() || null,
    payment_terms: f.payment_terms.trim() || null,
    delivery_time: f.delivery_time.trim() || null,
    ...(days !== undefined && days >= 1 && days <= 365 ? { validity_days: days } : {}),
    freight: charges ? normNum(f.freight) || '0' : '0',
    insurance: charges ? normNum(f.insurance) || '0' : '0',
    discount: normNum(f.discount) || '0',
    notes: f.notes.trim() || null,
    ...(f.terms ? { terms: f.terms } : {}),
    lines,
  };
}

/**
 * Is this line complete enough for the live calculation? It needs a product, a quantity above zero and a
 * numeric rate. Incomplete lines are skipped by `buildCalcInput` so half-typed rows do not cause errors.
 */
const complete = (l: LineState) => !!l.product_id && isPositive(l.quantity) && isNumber(l.rate);

/**
 * Input for the live calculation: `body` is the request body; `uids[i]` is the form line id of
 * `body.lines[i]`, so the response's i-th line can be matched back to the right line card.
 */
export interface CalcInput { body: DraftInput; uids: string[] }

/**
 * Builds the body for POST /quotes/calculate (live totals, nothing saved).
 * @param f - the form state.
 * @returns `{ body, uids }`, or null when there is no buyer yet or no COMPLETE line (then no request is
 *   made). Only complete lines are included; `uids` records which form lines they are.
 */
export function buildCalcInput(f: FormState): CalcInput | null {
  if (!f.buyer_id) return null;
  const used = f.lines.filter(complete);
  if (!used.length) return null;
  return { body: baseBody(f, used.map(lineInput)), uids: used.map((l) => l.uid) };
}

/**
 * Builds the body for saving the draft (POST /quotes or PUT /quotes/:id/draft).
 * @param f - the form state.
 * @returns `{ body, sentIdx }`. Rows that are completely empty are dropped; every other row is sent, even if
 *   incomplete, so the API/validateForm can report what is missing. `sentIdx[i]` is the FORM index of the
 *   i-th sent line; it is needed to map server errors like `lines.2.rate` back to the right line
 *   (mapServerFields).
 */
export function buildSaveBody(f: FormState): { body: DraftInput; sentIdx: number[] } {
  const sentIdx: number[] = [];
  const lines: DraftLineInput[] = [];
  f.lines.forEach((l, i) => {
    // a row where nothing was typed is ignored
    if (!l.product_id && !l.quantity && !l.rate && !l.cost_rate) return;
    sentIdx.push(i);
    lines.push(lineInput(l));
  });
  return { body: baseBody(f, lines), sentIdx };
}

/**
 * Client-side checks that give friendlier text than the API's. Run before saving or issuing.
 * @param f - the form state.
 * @returns a map of error key -> message (empty object = OK). Keys match the API's field keys so the same
 *   inputs show them: `buyer_id`, `lines.<i>.product_id`, `lines.<i>.quantity` (must be above zero),
 *   `lines.<i>.rate` (must be a number) and `lines` (no line at all). Completely empty rows are ignored.
 * Not checked here (the API checks them when issuing, error `cannot_issue`): payment terms, Incoterm and the
 * matching port. A draft may be saved without them.
 */
export function validateForm(f: FormState): Record<string, string> {
  const s = t.quoteForm;
  const e: Record<string, string> = {};
  if (!f.buyer_id) e.buyer_id = s.buyerRequired;
  let any = false;
  f.lines.forEach((l, i) => {
    // same rule as buildSaveBody: untouched rows are not validated
    if (!l.product_id && !l.quantity && !l.rate && !l.cost_rate) return;
    any = true;
    if (!l.product_id) e[`lines.${i}.product_id`] = s.productRequired;
    if (!isPositive(l.quantity)) e[`lines.${i}.quantity`] = s.quantityRequired;
    if (!isNumber(l.rate)) e[`lines.${i}.rate`] = s.rateRequired;
  });
  if (!any) e.lines = s.atLeastOneProduct;
  return e;
}

// error keys that have an input on the page; a server error with any other key goes to the page-level note
const FIELD_KEYS = new Set(['buyer_id', 'type', 'currency', 'incoterm', 'port_loading', 'port_discharge', 'payment_terms', 'delivery_time', 'validity_days', 'freight', 'insurance', 'discount', 'notes', 'lines']);
// fields inside the Terms card; when one has an error the card is forced open so the error is visible
export const SHIPPING_KEYS = ['type', 'currency', 'incoterm', 'port_loading', 'port_discharge'];

/**
 * Maps the API's validation errors (`ApiError.fields`) onto form inputs.
 * @param fields - key -> message from the API response (nested inputs use dotted paths like `lines.2.rate`; the
 *   issue step uses `lines`, `payment_terms`, `incoterm`, `port_loading`, `port_discharge`, ...).
 * @param sentIdx - from `buildSaveBody`: form index of each line that was sent.
 * @returns `{ errors, other }`: `errors` = messages keyed for the inputs (line keys re-indexed: the API's
 *   `lines.N` is the N-th SENT line, so it becomes `lines.<sentIdx[N]>`); `other` = messages for keys that
 *   have no input (shown together as the page-level error).
 */
export function mapServerFields(fields: Record<string, string>, sentIdx: number[]): { errors: Record<string, string>; other: string[] } {
  const errors: Record<string, string> = {};
  const other: string[] = [];
  for (const [k, msg] of Object.entries(fields)) {
    // `lines.<n>.<field>`: n is the position in the sent array, translate it to the form's line index
    const m = /^lines\.(\d+)\.(.+)$/.exec(k);
    if (m) { errors[`lines.${sentIdx[Number(m[1])] ?? Number(m[1])}.${m[2]}`] = msg; continue; }
    if (FIELD_KEYS.has(k)) errors[k] = msg; else other.push(msg);
  }
  return { errors, other };
}
