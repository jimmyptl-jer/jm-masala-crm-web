/**
 * Quote form screen: create a new draft quote or edit the open draft revision. Routes `/quotes/new` and
 * `/quotes/:id/edit` (see web/src/router.tsx); both render QuoteFormPage.
 *
 * API: POST /quotes/calculate (live totals, key ['quote-calc', body, uids]); POST /quotes (create draft);
 * PUT /quotes/:id/draft (save draft); POST /quotes/:id/issue (issue); GET /quotes/:id (edit mode, key
 * ['quote', id]); GET /buyers, GET /products, GET /settings (pickers and defaults); price hints are loaded by
 * LineCard -> PriceHintChips (GET /products/:id/price-hints). Invalidates ['quotes'] after save and
 * ['quote', id], ['quotes'], ['dashboard'] after issue.
 * Composes: LineCard, TotalsBar (components/quoteform), SearchSelect, BuyerForm (quick-add, FR-15) and the ui
 * kit. Form state and the form <-> API conversions live in components/quoteform/model.ts.
 * Implements: BR-01 (numbering on issue), BR-02 (editing a revision draft), BR-03 (issue freezes it), BR-04 /
 * FR-32 (price hints), BR-09 / BR-10 (currency and charges rules), NFR-04 (cost is internal only).
 * Unsaved-changes guard: useUnsavedChanges(dirty). Money is held and sent as decimal strings; the API does
 * all calculation.
 */
import clsx from 'clsx';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, Lock, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, ErrorNote, Input, NumberInput, Segmented, Select, Sheet, Spinner, StatusBadge, Textarea, errorMessage, useToast } from '@/components/ui';
import { SearchSelect, type Option } from '@/components/SearchSelect';
import { BuyerForm } from '@/components/BuyerForm';
import { LineCard } from '@/components/quoteform/LineCard';
import { IssueSheet } from '@/components/quoteform/IssueSheet';
import { TotalsBar } from '@/components/quoteform/TotalsBar';
import { QuotePreview } from '@/components/quoteform/QuotePreview';
import { SummaryPanel, type CheckItem } from '@/components/quoteform/SummaryPanel';
import type { SendChoice } from '@/components/quote/SendPicker';
import {
  EXPORT_CURRENCIES, INCOTERMS, OTHER, SHIPPING_KEYS, buildCalcInput, buildSaveBody, buyerDefaults, chargesApply, emptyForm,
  formFromRevision, isOtherPayment, mapServerFields, newLine, shippingComplete, validateForm, type FormState, type LineState,
} from '@/components/quoteform/model';
import { ApiError, api } from '@/lib/api';
import { money, qty } from '@/lib/format';
import { useBuyers, useDebounced, useProducts, useSendChannels, useSettings, useUnsavedChanges } from '@/lib/hooks';
import type { Buyer, CalcResult, Currency, Incoterm, Product, QuoteDetail, QuoteType, SendResult } from '@/lib/types';
import { isApprovedProduct } from '@/lib/products';
import { t } from '@/strings';

// all words on this screen (labels, errors, toasts) come from strings/quoteForm.ts
const s = t.quoteForm;

/**
 * Route component for BOTH `/quotes/new` (no `:id`) and `/quotes/:id/edit`. It only reads the `id` param and
 * renders QuoteFormScreen with `key={id ?? 'new'}`. The key makes React throw away ALL form state whenever
 * the id changes (for example after the first "Save draft" navigates from `/quotes/new` to
 * `/quotes/:id/edit`, or when jumping between two drafts), so one quote's data never leaks into another.
 */
export default function QuoteFormPage() {
  const { id } = useParams();
  return <QuoteFormScreen key={id ?? 'new'} quoteId={id} />;
}

/**
 * Layout helper: one numbered card of the form (Buyer, Terms, Products, Charges, Notes).
 * @param props.title - heading text of the card.
 * @param props.action - optional element at the right of the heading (e.g. the "Edit/Done" toggle).
 * @param props.columns - lay the fields out in two columns from md width up (the form is wide on a desktop).
 *   A child that needs the full row gets the class `md:col-span-2`.
 * @param props.children - the fields; they are stacked with a small gap (12 px).
 */
function Section({ id, n, active, onActive, title, action, columns, children }: { id?: string; n?: number; active?: boolean; onActive?: () => void; title: string; action?: ReactNode; columns?: boolean; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24" onFocusCapture={onActive} onPointerDownCapture={onActive}>
      <Card className="p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2.5 text-[17px] font-bold leading-6 text-ink">
            {n !== undefined && <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold', active ? 'bg-paprika text-white' : 'bg-surface-muted text-ink-secondary')} aria-hidden>{n}</span>}
            {title}
          </h2>
          {action}
        </div>
        <div className={columns ? 'grid gap-3 md:grid-cols-2 md:gap-x-4' : 'space-y-3'}>{children}</div>
      </Card>
    </div>
  );
}

/**
 * Builds a stand-in Product for a line whose product is no longer in the product list (it was archived after
 * the quote was drafted), so the line still shows its product name and can be saved. Edit mode only.
 * @param l - a saved quote line; `l.product` holds the product fields (name, grade, unit, gst_rate ...).
 * @returns a Product marked `archived: true` with no packing options and no reference rates.
 * Used by `productMap` below.
 */
const archivedProduct = (l: QuoteDetail['revisions'][number]['lines'][number]): Product => ({
  ...l.product, unit: l.product.unit as Product['unit'], packing_options: [], cleaning: null, purity: null, moisture: null, ref_rate_usd: null, ref_rate_inr: null, archived: true, updated_at: '',
});

/**
 * The quote form (create a new draft, or edit the open draft revision of an existing quote).
 *
 * What the user sees: a page with five cards - 1 Buyer (searchable picker with "add new buyer"; shown locked
 * with a padlock once the quote has ever been issued), 2 Terms (Export/Domestic switch, currency, Incoterm,
 * ports, payment terms, delivery time, validity days; collapses to a one-line summary once complete),
 * 3 Products (one LineCard per product line, "Add product", a show/hide-cost toggle that reveals cost rate
 * and margin), 4 Charges (freight and insurance only for CIF/CFR export quotes, plus discount), 5 Notes - and
 * a fixed totals bar at the bottom (TotalsBar) with live totals and the "Save draft" / "Issue" buttons.
 *
 * Actions -> API:
 *  - Typing: after a 400 ms pause POST /quotes/calculate returns totals (nothing is saved).
 *  - Pick a product: each LineCard loads GET /products/:id/price-hints (PriceHintChips).
 *  - Save draft: POST /quotes (new) or PUT /quotes/:id/draft (existing). A new quote then switches the URL to
 *    `/quotes/:id/edit` (replace). Toast "draft saved".
 *  - Issue: asks for confirmation, saves the draft (same call as above), then POST /quotes/:id/issue, which
 *    numbers, freezes and prices the revision and renders the PDF (BR-01, BR-03). On success: toast and go to
 *    `/quotes/:id`. If only the PDF step failed the quote IS issued and a different toast says so.
 *  - Quick-add buyer (FR-15): opens BuyerForm in a Sheet; the new buyer is selected automatically.
 *
 * Validation: `validateForm` checks the obvious things first (buyer, product/quantity/rate on each used line)
 * with friendly text. Anything the API still rejects comes back as `ApiError.fields`, which `mapServerFields`
 * maps onto the same inputs (see `handleError`). Fields without an input are joined into one error note.
 *
 * Cache: the saved/issued QuoteDetail is written into ['quote', id] with setQueryData; ['quotes'] is
 * invalidated after save, and ['quote', id], ['quotes'] and ['dashboard'] after issue.
 *
 * @param props.quoteId - the `:id` route param, or undefined when creating a new quote.
 *
 * Local state (why each exists):
 *  - `form`: the whole form as strings (FormState in quoteform/model.ts); money stays text, not numbers.
 *  - `ready`: false until the existing draft has been copied into `form` (edit mode); true at once for new.
 *  - `dirty`: unsaved edits exist; drives the "leave page?" guard (useUnsavedChanges).
 *  - `errors`: field key -> message shown under inputs (keys like `buyer_id`, `lines.2.rate`).
 *  - `errorTick`: counter bumped on every error display so the page scrolls to the first error each time.
 *  - `formError`: page-level error text (network failures, API errors without field keys).
 *  - `termsOpen`: whether the Terms card shows its fields (true) or the one-line summary (false).
 *  - `showCost`: whether internal cost-rate inputs and margin are visible (never printed on the PDF, NFR-04).
 *  - `busy`: 'save' | 'issue' | null; disables the form and buttons while a request runs.
 *  - `addBuyerOpen`: quick-add buyer sheet visibility; `addedBuyers`: buyers created in that sheet.
 *  - `goto`: URL to navigate to; navigation is done from an effect (see below).
 * Refs: `busyRef` (synchronous double-click guard), `initRef` (edit data copied only once),
 * `validityDefaulted` / `preselected` (one-time defaults), `createdId` (draft created by this screen),
 * `formRef` (to find the first error element).
 */
function QuoteFormScreen({ quoteId }: { quoteId: string | undefined }) {
  // query cache handle: used to store saved quotes and to invalidate lists after save/issue
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  // URL query string; only `?buyer=<id>` is read (see the preselect effect)
  const [sp] = useSearchParams();

  // shared lists/settings; buyers = active buyers only (the API default hides archived ones)
  const buyersQ = useBuyers();
  const productsQ = useProducts();
  const settingsQ = useSettings();
  // the quote being edited (edit mode only): GET /quotes/:id, key ['quote', quoteId]
  const quoteQ = useQuery({
    queryKey: ['quote', quoteId],
    queryFn: () => api.get<QuoteDetail>(`/quotes/${quoteId}`),
    enabled: !!quoteId,
  });

  // ---- local state: see the component comment for what each value is for ----
  const [form, setForm] = useState<FormState>(emptyForm);
  const [ready, setReady] = useState(!quoteId);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorTick, setErrorTick] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [termsOpen, setTermsOpen] = useState(true);
  const [showCost, setShowCost] = useState(false);
  const [busy, setBusy] = useState<'save' | 'issue' | null>(null);
  const [addBuyerOpen, setAddBuyerOpen] = useState(false);
  const [addedBuyers, setAddedBuyers] = useState<Buyer[]>([]);
  const [goto, setGoto] = useState<string | null>(null);
  // the "Issue this quote" sheet (confirmation plus the Email / WhatsApp choice) is open
  const [issueOpen, setIssueOpen] = useState(false);
  // which channels the server can send on itself; the others fall back to the Share sheet
  const channels = useSendChannels();

  // Refs (do not cause re-renders):
  //  busyRef            true while a save/issue request runs; a sync guard because `busy` state updates late
  //  initRef            edit mode: set after the draft was copied into the form, so refetches cannot
  //  overwrite edits validityDefaulted  set after the Settings validity-days default was applied
  //  preselected        set after the ?buyer= preselection ran
  const busyRef = useRef(false);
  const initRef = useRef(false);
  const validityDefaulted = useRef(false);
  const preselected = useRef(false);
  const createdId = useRef<string | null>(null); // a draft created by this screen but not yet navigated to
  const formRef = useRef<HTMLFormElement>(null);

  // ask before leaving with unsaved edits (in-app navigation to another path, and tab close/refresh)
  useUnsavedChanges(dirty, t.common.unsavedChanges);
  // preview sheet, and autosave bookkeeping: `autosaving` while a silent save runs, `autoFailed` after one failed
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeSec, setActiveSec] = useState(1);
  const [autosaving, setAutosaving] = useState(false);
  const [autoFailed, setAutoFailed] = useState(false);
  // always points at the latest autosave function (assigned after `persist` below), so the 10 s timer never uses stale form data
  const autosaveRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    const timer = setInterval(() => { void autosaveRef.current(); }, 10_000);
    return () => clearInterval(timer);
  }, []);

  /**
   * Effect: performs the navigation requested through `setGoto(url)` and replaces the history entry (so Back
   * does not return to the form). It runs in an effect rather than inline so that `setDirty(false)` (called
   * just before) has already been rendered and the unsaved-changes guard does not block our own navigation.
   */
  useEffect(() => { if (goto) navigate(goto, { replace: true }); }, [goto, navigate]);

  // ---- edit mode: load the open draft revision ----------------------------------------------
  const detail = quoteQ.data;
  /**
   * Effect (edit mode): copies the open draft revision of the loaded quote into the form, exactly once.
   * Waits until the query has finished fetching (not just cached data) so we never start from a stale copy.
   * Picks the revision named by `open_draft_revision` (or any draft); if the quote has no draft at all (for
   * example it was already issued) it redirects to the detail page `/quotes/:id`.
   * Then: fills `form` via formFromRevision, collapses the Terms card when shipping terms are complete, shows
   * the cost inputs if any line already has a cost rate, and marks the form `ready`. `initRef` makes sure a
   * later background refetch cannot overwrite what the user has typed.
   */
  useEffect(() => {
    if (!quoteId || initRef.current || !quoteQ.isSuccess || quoteQ.isFetching || !detail) return;
    initRef.current = true;
    const rev = detail.revisions.find((r) => r.state === 'draft' && r.revision === detail.open_draft_revision)
      ?? detail.revisions.find((r) => r.state === 'draft');
    if (!rev) { setGoto(`/quotes/${quoteId}`); return; }
    const f = formFromRevision(detail, rev);
    setForm(f);
    setTermsOpen(!shippingComplete(f));
    setShowCost(rev.lines.some((l) => !!l.cost_rate));
    setReady(true);
  }, [quoteId, quoteQ.isSuccess, quoteQ.isFetching, detail, navigate]);

  // Once a quote has a number (was issued) the API refuses to change its buyer or type (409 buyer_locked,
  // type_locked)
  const locked = !!quoteId && !!detail?.quote_no; // buyer and type cannot change after first issue

  // ---- pickers --------------------------------------------------------------------------------
  // Buyer list for the picker and lookups: active buyers from the API, plus buyers added through quick-add
  // (not in the cached list yet) and this quote's own buyer (might be archived and therefore missing).
  const buyers = useMemo(() => {
    const list = [...(buyersQ.data ?? [])];
    for (const b of [...addedBuyers, ...(detail ? [detail.buyer] : [])]) if (!list.some((x) => x.id === b.id)) list.push(b);
    return list;
  }, [buyersQ.data, addedBuyers, detail]);
  // the currently selected buyer object (undefined until one is chosen)
  const buyer = buyers.find((b) => b.id === form.buyer_id);
  // SearchSelect options for buyers. Archived buyers are hidden, except the one already selected on this
  // quote. The small second line is "city, country", or the buyer type when both are empty.
  const buyerOptions: Option[] = useMemo(
    () => buyers.filter((b) => !b.archived || b.id === form.buyer_id)
      .map((b) => ({ value: b.id, label: b.company_name, sub: [b.city, b.country].filter(Boolean).join(', ') || t.common.type[b.type] })),
    [buyers, form.buyer_id],
  );

  // id -> Product lookup for every product the form may show: the active product list plus placeholders for
  // products used on saved lines that are no longer listed (archived).
  const productMap = useMemo(() => {
    const m = new Map<string, Product>((productsQ.data ?? []).filter((p) => isApprovedProduct(p.name)).map((p) => [p.id, p]));
    for (const rev of detail?.revisions ?? []) for (const l of rev.lines) if (!m.has(l.product_id)) m.set(l.product_id, archivedProduct(l));
    return m;
  }, [productsQ.data, detail]);
  // SearchSelect options for products ("Name - Grade", with the unit on the second line). Archived products
  // are listed only while a line on this form still uses them.
  const productOptions: Option[] = useMemo(
    () => [...productMap.values()].filter((p) => (isApprovedProduct(p.name) && !p.archived) || form.lines.some((l) => l.product_id === p.id))
      .map((p) => ({ value: p.id, label: p.grade ? `${p.name} – ${p.grade}` : p.name, sub: p.unit })),
    [productMap, form.lines],
  );

  // ---- form helpers ---------------------------------------------------------------------------
  /**
   * Removes the given error keys from `errors` (used when the user edits the field concerned).
   * @param keys - error keys such as `incoterm` or `lines.1.rate`.
   * Returns the same state object when nothing changes, so React skips a re-render.
   */
  const clearErrors = (keys: string[]) => {
    if (!keys.length) return;
    setErrors((e) => {
      if (!keys.some((k) => k in e)) return e;
      const n = { ...e };
      for (const k of keys) delete n[k];
      return n;
    });
  };
  /**
   * Applies a change to top-level form fields (everything except product lines).
   * @param patch - partial FormState to merge in.
   * @param clear - error keys to clear; defaults to the keys of `patch`, so editing a field clears its error.
   * Also marks the form dirty (arms the unsaved-changes guard).
   */
  const upd = (patch: Partial<FormState>, clear: string[] = Object.keys(patch)) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
    clearErrors(clear);
  };
  /**
   * Applies a change to one product line.
   * @param uid - the line's stable client id (LineState.uid), not its array position.
   * @param patch - partial LineState to merge into that line.
   * @param clear - line field names whose error should be cleared, e.g. ['rate'] clears `lines.<i>.rate`.
   * The page-level `lines` error ("add at least one product") is always cleared too. Marks the form dirty.
   */
  const updLine = (uid: string, patch: Partial<LineState>, clear: string[] = []) => {
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) }));
    setDirty(true);
    const i = form.lines.findIndex((l) => l.uid === uid);
    clearErrors([...clear.map((k) => `lines.${i}.${k}`), 'lines']);
  };

  /**
   * Selects a buyer and applies that buyer's defaults to the form.
   * @param b - the chosen buyer (from the picker, `?buyer=` or quick-add).
   * Sets `buyer_id` and, via buyerDefaults, the type, currency, Incoterm and (for export) default discharge
   * port. If the new buyer's type differs from the form's current type, `terms` is reset to undefined so the
   * API fills the default terms for the new type (export vs domestic) from Settings. Re-evaluates whether the
   * Terms card can stay collapsed, marks the form dirty and clears the buyer/shipping errors.
   */
  const applyBuyer = (b: Buyer) => {
    const next: FormState = { ...form, ...buyerDefaults(b), buyer_id: b.id, terms: form.type === b.type ? form.terms : undefined };
    setForm(next);
    setTermsOpen(!shippingComplete(next));
    setDirty(true);
    clearErrors(['buyer_id', ...SHIPPING_KEYS]);
  };

  /**
   * Effect: `?buyer=<id>` preselect. The Buyer detail screen links to `/quotes/new?buyer=<id>`; once the
   * buyer list has loaded this applies that buyer's defaults to a fresh form. New quotes only, and only once
   * (`preselected`). It does not mark the form dirty, so leaving without typing is not blocked.
   */
  useEffect(() => {
    const id = sp.get('buyer');
    if (quoteId || !id || preselected.current || !buyersQ.data) return;
    preselected.current = true;
    const b = buyersQ.data.find((x) => x.id === id);
    if (b) {
      const next: FormState = { ...emptyForm(), ...buyerDefaults(b), buyer_id: b.id, lines: form.lines };
      setForm(next);
      setTermsOpen(!shippingComplete(next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyersQ.data, quoteId, sp]);

  /**
   * Effect: for a NEW quote, pre-fills "validity days" from Settings (`validity_days`) once Settings have
   * loaded, but only if the field is still empty. Done once (`validityDefaulted`). Not marked dirty.
   */
  useEffect(() => {
    if (quoteId || validityDefaulted.current || !settingsQ.data) return;
    validityDefaulted.current = true;
    setForm((f) => (f.validity === '' ? { ...f, validity: String(settingsQ.data.validity_days) } : f));
  }, [quoteId, settingsQ.data]);

  /**
   * Handler for the Export / Domestic switch.
   * @param type - the type the user picked; ignored if it equals the current type.
   * Resets `terms` to undefined (API supplies the defaults for the new type). Domestic forces INR and clears
   * the Incoterm; export keeps the current currency (or the buyer's default export currency, or USD when it
   * was INR) and fills Incoterm / discharge port from the buyer's defaults only if currently empty.
   * Re-checks whether the Terms card can collapse; clears the shipping errors; marks the form dirty.
   * The switch is disabled once the quote has been issued (`locked`).
   */
  const changeType = (type: QuoteType) => {
    if (type === form.type) return;
    const domestic = type === 'domestic';
    const d = buyer ? buyerDefaults(buyer) : null;
    const next: FormState = {
      ...form, type, terms: undefined,
      currency: domestic ? 'INR' : d && d.type === 'export' ? d.currency : form.currency === 'INR' ? 'USD' : form.currency,
      incoterm: domestic ? '' : form.incoterm || (d && d.type === 'export' ? d.incoterm : ''),
      port_discharge: domestic ? form.port_discharge : form.port_discharge || (d && d.type === 'export' ? d.port_discharge : ''),
    };
    setForm(next);
    setDirty(true);
    setTermsOpen(!shippingComplete(next));
    clearErrors(SHIPPING_KEYS);
  };

  /**
   * Handler for choosing a product on a line.
   * @param uid - the line's client id.
   * @param productId - the picked product's id.
   * Sets the product, preselects that product's FIRST packing option (or '' when it has none), turns off the
   * "Other packing" free-text mode and clears the product/packing errors of that line.
   */
  const changeProduct = (uid: string, productId: string) => {
    const p = productMap.get(productId);
    updLine(uid, { product_id: productId, packing: p?.packing_options[0] ?? '', packingOther: false }, ['product_id', 'packing']);
  };

  /** "Add product" button: appends an empty line, marks the form dirty and clears the `lines` error. */
  const addLine = () => { setForm((f) => ({ ...f, lines: [...f.lines, newLine()] })); setDirty(true); clearErrors(['lines']); };
  /**
   * Removes one product line (the trash button; it is hidden when only one line exists, and this also refuses
   * to remove the last line). Clears ALL `lines*` errors because the remaining lines shift to new indexes,
   * so old per-line messages would point at the wrong line.
   * @param uid - the client id of the line to remove.
   */
  const removeLine = (uid: string) => {
    setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((l) => l.uid !== uid) : f.lines }));
    setDirty(true);
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('lines'))));
  };

  // ---- live calculation (debounced 400 ms) ---------------------------------------------------
  // Live calculation. `buildCalcInput` returns null until a buyer and at least one COMPLETE line (product,
  // quantity > 0, rate) exist. It builds a new object on every render, so we key the memo on its JSON text:
  // `calcInput` then changes identity only when the content really changes, which is what the 400 ms debounce
  // and the react-query key need. All numbers come back from the API; the browser never does the arithmetic.
  const calcKey = JSON.stringify(buildCalcInput(form));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const calcInput = useMemo(() => buildCalcInput(form), [calcKey]);
  // follows `calcInput` but only after 400 ms without a change, so one request per typing pause
  const debounced = useDebounced(calcInput, 400);
  // POST /quotes/calculate with the debounced snapshot (a preview only; nothing is written). `uids` travel
  // with the result so each returned calc line can be matched to its form line. `keepPreviousData` keeps
  // showing the last totals while a new calculation is loading; no retry (the error is shown instead);
  // results are reused for 30 s if the same input comes back.
  const calcQ = useQuery({
    queryKey: ['quote-calc', debounced?.body, debounced?.uids],
    queryFn: async () => {
      const input = debounced!; // enabled only when set; closed over the debounced snapshot, never live form state
      const calc = await api.post<CalcResult>('/quotes/calculate', input.body);
      return { calc, uids: input.uids };
    },
    enabled: !!debounced,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
  });
  // latest calculation result, hidden when the form no longer has a calculable input
  const calc = calcInput ? calcQ.data?.calc : undefined;
  // true from the first keystroke until the new result arrives (input not yet debounced, or request running)
  const calcPending = !!calcInput && (calcInput !== debounced || calcQ.isFetching);
  // message shown in the totals bar when the calculate request failed (e.g. a network or server error)
  const calcError = calcInput && calcQ.isError ? `${s.calcFailed} ${errorMessage(calcQ.error)}` : null;
  /**
   * Finds the calculation result (amount, GST split, margin) for one form line.
   * @param uid - the line's client id.
   * @returns the matching entry of `calc.lines`, or undefined when that line was not part of the calculation
   *   (incomplete line) or no result exists yet. Uses the `uids` list stored with the query result, because
   *   incomplete lines are left out of the request, so form index and calc index can differ.
   */
  const calcLineFor = (uid: string) => {
    const i = calcQ.data?.uids.indexOf(uid) ?? -1;
    return i >= 0 ? calc?.lines[i] : undefined;
  };

  // ---- save / issue ---------------------------------------------------------------------------
  /**
   * Displays a set of validation errors on the form.
   * @param e - field key -> message (shown under the matching inputs).
   * @param other - extra messages with no input of their own; joined into the page-level `formError` note.
   * If any error belongs to the shipping/terms fields, the Terms card is expanded so the error is visible.
   * Bumps `errorTick`, which triggers the scroll-to-first-error effect below.
   */
  const showErrors = (e: Record<string, string>, other: string[] = []) => {
    setErrors(e);
    setFormError(other.length ? other.join(' ') : null);
    if (SHIPPING_KEYS.some((k) => k in e)) setTermsOpen(true);
    setErrorTick((n) => n + 1);
  };
  // after errors render, scroll the first error message (an element with role="alert") to mid-screen
  useEffect(() => {
    if (!errorTick) return;
    formRef.current?.querySelector('p[role="alert"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [errorTick]);

  /**
   * Saves the draft and returns the quote id (or null on failure). Shared by "Save draft" and "Issue".
   *
   * Steps: 1) `validateForm`; on problems shows them, toasts "fix the highlighted fields" and returns null
   * (no request). 2) `buildSaveBody` makes the request body and `sentIdx` (which form line each sent line
   * came from; completely empty rows are not sent). 3) Sends PUT /quotes/:id/draft when the quote already
   * exists, else POST /quotes. 4) Remembers the id in `createdId`, writes the returned QuoteDetail into the
   * ['quote', id] cache, clears dirty/errors and returns the id.
   * Gotcha: `quoteId ?? createdId.current` - if a first save created the draft but we have not navigated to
   * its edit URL yet (for example Issue after the save step, or a quick second tap), the next save updates
   * that draft instead of creating a duplicate quote.
   * Failures go to `handleError`.
   */
  const persist = async (silent = false): Promise<string | null> => {
    const local = validateForm(form);
    if (Object.keys(local).length) {
      if (silent) return null;
      showErrors(local);
      toast(s.fixHighlighted, 'error');
      return null;
    }
    const { body, sentIdx } = buildSaveBody(form);
    try {
      const id = quoteId ?? createdId.current;
      const saved = id
        ? await api.put<QuoteDetail>(`/quotes/${id}/draft`, body)
        : await api.post<QuoteDetail>('/quotes', body);
      createdId.current = saved.id;
      qc.setQueryData(['quote', saved.id], saved);
      setDirty(false);
      setErrors({});
      setFormError(null);
      return saved.id;
    } catch (e) {
      if (!silent) handleError(e, sentIdx);
      return null;
    }
  };

  /**
   * Autosave (every 10 s while there are unsaved edits): saves the draft quietly with the same call as Save draft.
   * Skips while another save runs, when nothing changed, or when the form is not complete enough to save yet
   * (no errors are shown and no toast). A failed request only turns the "Saved" indicator into a warning.
   */
  autosaveRef.current = async () => {
    if (busyRef.current || !dirty || Object.keys(validateForm(form)).length) return;
    setAutosaving(true);
    const id = await persist(true);
    setAutosaving(false);
    setAutoFailed(id === null);
    if (id) void qc.invalidateQueries({ queryKey: ['quotes'] });
  };

  /**
   * Shows a failed save/issue request.
   * @param e - the thrown error (usually ApiError).
   * @param sentIdx - for each line in the request body, its index in the form (see buildSaveBody).
   * If the API sent `fields` (validation_error / cannot_issue / unknown_product ...), they are mapped with
   * `mapServerFields` onto the form inputs (`lines.N.x` is re-indexed through `sentIdx`; keys without an
   * input go to the page note) and a toast shows the API message. Otherwise the plain error message is put in
   * the page-level note and shown as a toast.
   */
  const handleError = (e: unknown, sentIdx: number[]) => {
    if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) {
      const { errors: fe, other } = mapServerFields(e.fields, sentIdx);
      showErrors(fe, other);
      toast(e.message || s.fixHighlighted, 'error');
    } else {
      setFormError(errorMessage(e));
      toast(errorMessage(e), 'error');
    }
  };

  /**
   * "Save draft" button handler (passed to TotalsBar).
   * Ignored while another save/issue runs (`busyRef`). Calls `persist`; on success shows the "draft saved"
   * toast, invalidates ['quotes'] so the list refreshes, and - for a quote that was new - navigates to
   * `/quotes/:id/edit` (replace) so further saves update the same draft. `busy` is 'save' during the request.
   */
  const onSave = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('save');
    try {
      const id = await persist();
      if (!id) return;
      toast(s.draftSaved);
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      if (!quoteId) setGoto(`/quotes/${id}/edit`);
    } finally { busyRef.current = false; setBusy(null); }
  };

  /**
   * "Issue" button handler (passed to TotalsBar): validate, then open the Issue sheet.
   * Checks the form locally (same as Save) and shows the highlighted errors; nothing is saved or issued until
   * the user confirms in IssueSheet (issuing makes the revision permanent, BR-03). Ignored while a request runs.
   */
  const onIssue = () => {
    if (busyRef.current) return;
    const local = validateForm(form);
    if (Object.keys(local).length) { showErrors(local); toast(s.fixHighlighted, 'error'); return; }
    setIssueOpen(true);
  };

  /**
   * Confirmed in the Issue sheet: save, issue, then send if asked.
   *
   * Steps: `persist` (save draft); POST /quotes/:id/issue (the API checks completeness, recalculates, numbers
   * the quote (BR-01), freezes it and renders the PDF); then, depending on `choice`:
   *  - 'none': go to the quote page;
   *  - a channel the server can send on: POST /quotes/:id/revisions/:rev/send with the note. Success: toast with
   *    the recipient. Failure: the quote IS issued, so a toast says it was not sent and the quote page opens
   *    with the Share sheet (`?share=1`) to try again;
   *  - a channel the server cannot send on: open the quote page with the Share sheet, which has the
   *    "open WhatsApp / mail program" buttons.
   * Also stores the quote in the cache and invalidates ['quote', id], ['quotes'] and ['dashboard'].
   * If the issue request itself fails after the save worked, the errors are shown like any save error plus a
   * toast saying the draft was saved but not issued; the user stays on the form.
   * @param choice — 'none' | 'email' | 'whatsapp'. @param note — optional text added to a direct message.
   */
  const issueAndSend = async (choice: SendChoice, note: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('issue');
    try {
      const id = await persist();
      if (!id) { setIssueOpen(false); return; }
      const { sentIdx } = buildSaveBody(form);
      try {
        const res = await api.post<QuoteDetail>(`/quotes/${id}/issue`);
        qc.setQueryData(['quote', id], res);
        void qc.invalidateQueries({ queryKey: ['quote', id] });
        void qc.invalidateQueries({ queryKey: ['quotes'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
        setIssueOpen(false);
        if (res.pdf?.status === 'failed') { toast(s.issuedPdfFailed, 'error'); setGoto(`/quotes/${id}`); return; }
        if (choice === 'none') { toast(s.issued); setGoto(`/quotes/${id}`); return; }
        if (!channels[choice]) { toast(t.send.issuedShareNext); setGoto(`/quotes/${id}?share=1`); return; }
        try {
          const sent = await api.post<SendResult>(`/quotes/${id}/revisions/${res.current_revision ?? 0}/send`, { channel: choice, ...(note ? { note } : {}) });
          void qc.invalidateQueries({ queryKey: ['quote', id] });
          toast(t.send.issuedAndSent(sent.to));
          setGoto(`/quotes/${id}`);
        } catch (e) {
          toast(t.send.issuedSendFailed(errorMessage(e)), 'error');
          setGoto(`/quotes/${id}?share=1`);
        }
      } catch (e) {
        setIssueOpen(false);
        handleError(e, sentIdx);
        toast(s.issueAfterSaveFailed, 'error');
      }
    } finally { busyRef.current = false; setBusy(null); }
  };

  // ---- render ---------------------------------------------------------------------------------
  // edit mode: the quote could not be loaded -> show the error with Retry instead of the form
  if (quoteId && quoteQ.isError) return <ErrorNote error={quoteQ.error} onRetry={() => void quoteQ.refetch()} />;
  // edit mode: wait until the draft has been copied into the form
  if (!ready) return <Spinner />;

  // ---- values derived on every render (no state of their own) ----
  // domestic / currency: domestic quotes are always INR; showCharges: freight+insurance only for CIF/CFR
  // export (BR-10); payOther: payment terms are free text (not one of the preset options); loadingLabel: EXW
  // asks for the place of pickup instead of a port of loading; needDischarge: CIF/CFR require a port of
  // discharge (FOB/EXW a loading port instead); termsSummary: the one-line text shown when the Terms card is
  // collapsed. The root element's bottom padding (pb-56 / md:pb-44) leaves room for the fixed totals bar
  // (and, on phones, the tab bar below it) so the last card is never hidden behind them.
  const domestic = form.type === 'domestic';
  const currency: Currency = domestic ? 'INR' : form.currency;
  const showCharges = chargesApply(form.type, form.incoterm);
  const payOther = isOtherPayment(form);
  const loadingLabel = form.incoterm === 'EXW' ? s.placeOfPickup : s.portLoading;
  const needDischarge = form.incoterm === 'CIF' || form.incoterm === 'CFR';
  const termsSummary = domestic
    ? s.termsSummaryDomestic
    : s.termsSummaryExport(form.currency, form.incoterm, needDischarge ? form.port_discharge : form.port_loading);
  // error messages for one line, looked up by form index i (keys look like `lines.2.rate`)
  const lineErr = (i: number) => ({
    product_id: errors[`lines.${i}.product_id`], packing: errors[`lines.${i}.packing`], quantity: errors[`lines.${i}.quantity`],
    rate: errors[`lines.${i}.rate`], cost_rate: errors[`lines.${i}.cost_rate`],
  });
  // printed number of the quote being revised (e.g. QT/26-27/0042-R1), shown as the page subtitle
  const revNumber = detail?.number ?? detail?.quote_no ?? null;
  // save indicator, shared by the top bar and the summary panel
  const saveState = busy === 'save' || autosaving ? 'saving' : autoFailed && dirty ? 'failed' : dirty ? 'unsaved' : (quoteId ?? createdId.current) ? 'saved' : 'new';
  const saveText = { saved: s.savedState, saving: s.savingState, unsaved: s.unsavedState, failed: s.autosaveFailed, new: s.notSavedYet }[saveState];
  // checklist of what is missing before the quote can be finalised, and the "14 MT . 2 items" line under the total
  const doneLines = form.lines.filter((l) => !!l.product_id && !!l.quantity && !!l.rate);
  const portOk = needDischarge ? !!form.port_discharge.trim() : !!form.port_loading.trim();
  const checklist: CheckItem[] = [
    { label: s.checkBuyer, ok: !!form.buyer_id },
    ...(domestic ? [] : [{ label: needDischarge ? s.checkPortDischarge : s.checkPortLoading, ok: portOk }]),
    { label: s.checkProduct, ok: doneLines.length > 0 },
    { label: s.checkTerms, ok: !!form.payment_terms.trim() },
  ];
  const lineUnits = [...new Set(doneLines.map((l) => productMap.get(l.product_id)?.unit))];
  // total quantity: an exact sum of the typed quantities in thousandths (a quantity, not money); only when every line has the same unit
  const milli = (v: string) => { const [whole = '0', frac = ''] = v.split('.'); return BigInt(whole + `${frac}000`.slice(0, 3)); };
  const qtySum = doneLines.reduce((acc, l) => acc + milli(l.quantity), BigInt(0));
  const qtyLine = doneLines.length === 0 ? '' : `${lineUnits.length === 1 && lineUnits[0] ? `${qty(`${qtySum / BigInt(1000)}.${(qtySum % BigInt(1000)).toString().padStart(3, '0')}`)} ${lineUnits[0]} · ` : ''}${doneLines.length === 1 ? '1 item' : `${doneLines.length} items`}`;

  return (
    <div className="mx-auto max-w-7xl pb-56 md:pb-10">
      {/* top bar: back, title, status, lifecycle stepper */}
      <div className="glass-panel mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/quotes" aria-label={s.back} title={s.back} className="tap grid place-items-center rounded-lg text-fg-secondary hover:bg-brand-50"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-8 tracking-tight text-ink">{quoteId ? s.editTitle : s.newTitle}</h1>
          {quoteId && revNumber && <p className="text-sm text-fg-muted">{s.revisingSubtitle(revNumber)}</p>}
        </div>
        <StatusBadge status={detail?.status ?? 'draft'} />
        <span className={clsx('ml-auto text-sm', saveState === 'failed' ? 'text-danger-ink' : 'text-ink-muted')} role="status">{saveText}</span>
      </div>
      {formError && <div className="mb-4"><ErrorNote error={formError} /></div>}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-5">

      {/* Enter key must not submit: saving/issuing happens only through the TotalsBar buttons; noValidate
         because we validate in code */}
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} noValidate>
        {/* disabling the fieldset locks every input while a save/issue request is running */}
        <fieldset disabled={busy !== null} className="min-w-0 space-y-3">
          {/* 1. Buyer */}
          {/* Buyer: locked (read-only) after first issue, otherwise a searchable picker with quick-add */}
          <Section id="step-buyer" n={1} active={activeSec === 1} onActive={() => setActiveSec(1)} title={s.secBuyer}>
            {locked ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-cream-100 px-3 py-2 text-base font-semibold text-forest-900">
                  <Lock className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 truncate">{detail?.buyer.company_name}</span>
                  <span className="ml-auto text-sm font-normal text-fg-muted">{t.common.type[form.type]}</span>
                </div>
                <p className="text-sm text-fg-secondary">{s.buyerLockedNote}</p>
              </div>
            ) : (
              <SearchSelect
                label={s.buyer} value={form.buyer_id} options={buyerOptions} onChange={(id) => { const b = buyers.find((x) => x.id === id); if (b) applyBuyer(b); }}
                placeholder={s.buyerPlaceholder} searchPlaceholder={s.buyerSearch} emptyText={s.noBuyers} error={errors.buyer_id}
                onAddNew={() => setAddBuyerOpen(true)} addNewLabel={s.addBuyer}
              />
            )}
          </Section>

          {/* 2. Shipment */}
          <Section
            id="step-terms"
            n={2} active={activeSec === 2} onActive={() => setActiveSec(2)}
            title={s.secShipment}
            columns
            action={form.buyer_id ? (
              <Button variant="ghost" className="-mr-2" onClick={() => setTermsOpen((o) => !o)} aria-expanded={termsOpen}>
                {termsOpen ? s.doneTerms : s.editTerms}
              </Button>
            ) : undefined}
          >
            {/* full fields while open or before a buyer is chosen, otherwise a one-line summary */}
            {termsOpen || !form.buyer_id ? (
              <>
                <div className="md:col-span-2">
                  <Segmented<QuoteType>
                    label={s.typeLabel} value={form.type} onChange={changeType} disabled={locked}
                    options={[{ value: 'export', label: t.common.type.export }, { value: 'domestic', label: t.common.type.domestic }]}
                  />
                </div>
                {domestic ? (
                  <Select label={s.currency} value="INR" disabled onChange={() => undefined} wrapperClassName="md:col-span-2"><option value="INR">INR</option></Select>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 md:col-span-2 md:gap-x-4">
                      <Select label={s.currency} value={form.currency} error={errors.currency} onChange={(e) => upd({ currency: e.target.value as Currency })}>
                        {EXPORT_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                      <div>
                        <Segmented<Incoterm | ''> label={s.incoterm} value={form.incoterm} onChange={(v) => upd({ incoterm: v })} options={INCOTERMS.map((x) => ({ value: x, label: x }))} />
                        {errors.incoterm && <p role="alert" className="mt-1 text-xs text-danger-ink">{errors.incoterm}</p>}
                      </div>
                    </div>
                    <datalist id="loading-ports">{s.loadingPorts.map((p) => <option key={p} value={p} />)}</datalist>
                    <Input label={loadingLabel} optional={needDischarge || !form.incoterm} list="loading-ports" value={form.port_loading} error={errors.port_loading}
                      onChange={(e) => upd({ port_loading: e.target.value })} />
                    <Input label={s.portDischarge} optional={!needDischarge} value={form.port_discharge} error={errors.port_discharge}
                      onChange={(e) => upd({ port_discharge: e.target.value })} />
                  </>
                )}
              </>
            ) : (
              <p className="text-base font-medium text-forest-900 md:col-span-2">{termsSummary}</p>
            )}

            <Select
              label={s.paymentTerms} value={payOther ? OTHER : form.payment_terms} error={payOther ? undefined : errors.payment_terms}
              onChange={(e) => {
                // "Other" reveals a free-text box. When switching to it, keep the current text if it was a
                // custom value, but clear it if it was one of the preset options.
                const v = e.target.value;
                if (v === OTHER) upd({ paymentOther: true, payment_terms: s.paymentOptions.includes(form.payment_terms) ? '' : form.payment_terms });
                else upd({ paymentOther: false, payment_terms: v });
              }}
            >
              <option value="">{s.paymentChoose}</option>
              {s.paymentOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              <option value={OTHER}>{s.paymentOther}</option>
            </Select>
            {payOther && (
              <Input label={s.paymentOtherLabel} wrapperClassName="md:col-span-2" value={form.payment_terms} maxLength={500} error={errors.payment_terms}
                onChange={(e) => upd({ payment_terms: e.target.value })} />
            )}
            <Input label={s.deliveryTime} optional hint={s.deliveryHint} value={form.delivery_time} maxLength={300} error={errors.delivery_time}
              onChange={(e) => upd({ delivery_time: e.target.value })} />
            <NumberInput label={s.validityDays} decimals={0} value={form.validity} error={errors.validity_days}
              onChange={(v) => upd({ validity: v }, ['validity', 'validity_days'])} />
          </Section>

          {/* 3. Products */}
          <Section
            id="step-products"
            n={3} active={activeSec === 3} onActive={() => setActiveSec(3)}
            title={s.secProducts}
            action={(
              <Button variant="ghost" className="-mr-2" onClick={() => setShowCost((v) => !v)} aria-pressed={showCost}>
                {showCost ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                {showCost ? s.hideCost : s.showCost}
              </Button>
            )}
          >
            {errors.lines && <p role="alert" className="text-sm text-red-700">{errors.lines}</p>}
            {form.lines.map((l, i) => (
              <LineCard
                key={l.uid} index={i} line={l} product={productMap.get(l.product_id)} productOptions={productOptions}
                currency={currency} type={form.type} buyerId={form.buyer_id} showCost={showCost}
                calcLine={calcLineFor(l.uid)} errors={lineErr(i)} canRemove={form.lines.length > 1}
                onChange={(patch, clear) => updLine(l.uid, patch, clear as string[] | undefined)}
                onProduct={(pid) => changeProduct(l.uid, pid)} onRemove={() => removeLine(l.uid)}
              />
            ))}
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1 text-sm font-bold text-paprika hover:text-paprika-700"><Plus className="h-4 w-4" aria-hidden />{s.addProduct}</button>

            {domestic && calc && calc.tax_mode && (
              <p className="text-sm text-fg-secondary">{s.taxMode[calc.tax_mode] ?? calc.tax_mode}</p>
            )}
            {calc?.warnings?.map((w) => <p key={w} role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{w}</p>)}
            {showCost && calc && (
              <div className="space-y-1 rounded-lg border border-dashed border-amber-600 bg-amber-50 p-3 text-amber-900">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{s.totalMargin}</span>
                  <span className="text-lg font-bold tabular-nums">
                    {calc.margin.total ? money(calc.margin.total, currency) : '—'}
                    {calc.margin.pct ? <span className="ml-2 text-sm font-medium">({calc.margin.pct}%)</span> : null}
                  </span>
                </div>
                <p className="text-xs">{s.costNotPrinted}</p>
                {!calc.margin.complete && <p className="text-xs">{s.marginIncomplete}</p>}
              </div>
            )}
          </Section>

          {/* 4. Charges */}
          <Section n={4} active={activeSec === 4} onActive={() => setActiveSec(4)} title={s.secPayment}>
            {showCharges && (
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label={s.freight(currency)} optional decimals={2} value={form.freight} error={errors.freight} onChange={(v) => upd({ freight: v })} />
                <NumberInput label={s.insurance(currency)} optional decimals={2} value={form.insurance} error={errors.insurance} onChange={(v) => upd({ insurance: v })} />
              </div>
            )}
            <NumberInput label={s.discount(currency)} optional decimals={2} value={form.discount} error={errors.discount} onChange={(v) => upd({ discount: v })} />
          
            <Textarea label={s.notes} optional hint={s.notesHint} value={form.notes} maxLength={2000} error={errors.notes} onChange={(e) => upd({ notes: e.target.value })} />
          </Section>
        </fieldset>
      </form>

        {/* summary: beside the form on wide screens (sticky), under it on phones */}
        <aside className="mt-4 xl:sticky xl:top-4 xl:mt-0">
          <SummaryPanel
            calc={calc} currency={currency} type={form.type} pending={calcPending} calcError={calcError} hasInput={!!calcInput}
            qtyLine={qtyLine} checklist={checklist} showMargin={showCost} busy={busy} saveState={saveState}
            onFinalise={onIssue} onPreview={() => setPreviewOpen(true)} onSave={() => void onSave()}
          />
        </aside>
      </div>

      {/* 6. Fixed totals bar */}
      {/* totals and buttons are fixed to the bottom of the viewport: see TotalsBar */}
      <div className="md:hidden"><TotalsBar
        calc={calc} currency={currency} type={form.type} pending={calcPending} calcError={calcError} hasInput={!!calcInput}
        busy={busy} onSave={() => void onSave()} onIssue={onIssue}
      /></div>

      {/* Preview PDF: the quotation document on the letterhead */}
      <Sheet huge open={previewOpen} onClose={() => setPreviewOpen(false)} title={s.previewSheetTitle}>
        <QuotePreview settings={settingsQ.data} buyer={buyer} form={form} products={productMap} calc={calc} currency={currency} number={revNumber} lineAmount={(uid) => calcLineFor(uid)?.amount} />
      </Sheet>

      {/* Issue sheet: confirm, and choose Email / WhatsApp / don't send */}
      <IssueSheet open={issueOpen} onClose={() => setIssueOpen(false)} buyer={buyer} busy={busy === 'issue'} onConfirm={(c, n) => void issueAndSend(c, n)} />

      {/* quick-add buyer: on save the new buyer is remembered locally and selected right away */}
      <Sheet wide open={addBuyerOpen} onClose={() => setAddBuyerOpen(false)} title={s.addBuyerTitle}>
        <BuyerForm
          defaultType={form.type}
          onCancel={() => setAddBuyerOpen(false)}
          onSaved={(b) => { setAddedBuyers((x) => [...x, b]); applyBuyer(b); setAddBuyerOpen(false); }}
        />
      </Sheet>
    </div>
  );
}
