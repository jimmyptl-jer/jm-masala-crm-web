/**
 * Quotes list screen, route `/quotes` (see web/src/router.tsx). Lists, filters and exports quotes.
 *
 * API: GET /quotes (paged, react-query infinite key ['quotes', filters]); GET /quotes/export.xlsx (download);
 * GET /buyers and GET /products for the filter pickers (via useBuyers/useProducts).
 * Composes: QuoteRow (one list row), RouterButton, SearchSelect, and the ui kit (Button, Input, Segmented,
 * EmptyState, ErrorNote, PageHeader, Spinner, toast). Filters live in the URL query string (useSearchParams).
 * Linked from: Today's count tiles (`/quotes?status=...`) and the Layout navigation.
 * Money on each row is a decimal string formatted by QuoteRow; nothing is calculated here.
 */
import clsx from 'clsx';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Download, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '@/lib/api';
import { useBuyers, useDebounced, useProducts } from '@/lib/hooks';
import type { QuoteList, QuoteStatus } from '@/lib/types';
import { SearchSelect } from '@/components/SearchSelect';
import { Button, EmptyState, ErrorNote, Input, PageHeader, Segmented, Spinner, errorMessage, useToast } from '@/components/ui';
import { QuoteRow } from '@/components/quote/QuoteRow';
import { RouterButton } from '@/components/quote/shared';
import { t } from '@/strings';

// rows fetched per request (GET /quotes `limit`); "Load more" fetches the next PAGE rows
const PAGE = 50;
// status filter chips, in the order they are shown after "All" (same values as the API's `status` filter)
const STATUSES: QuoteStatus[] = ['draft', 'sent', 'negotiating', 'won', 'lost', 'expired'];
// URL params behind the collapsible "More filters" panel; used to count active extra filters
const FILTER_KEYS = ['type', 'buyer_id', 'product_id', 'from', 'to'] as const;

/**
 * Quotes screen (route `/quotes`): searchable, filterable list of every quote, with Excel export.
 *
 * What the user sees: a "New quote" button; a row of status chips (All, Draft, Sent, Negotiating, Won, Lost,
 * Expired); a search box (quote number or buyer name); a "More filters" button (with a count of active extra
 * filters), an "Export to Excel" button and, when any filter is on, "Clear all filters"; an optional
 * filter panel (type, buyer, product, date from/to; the dates match the quote's latest issue date, or its
 * creation date for a never-issued draft, in India time); then one QuoteRow per quote (two columns on md+),
 * a "Showing X of Y" line and a "Load more" button while more rows exist.
 *
 * The URL is the single source of truth for the filters: `?status=&type=&buyer_id=&product_id=&from=&to=&q=`.
 * That makes filtered lists linkable (Today's count tiles link here) and keeps the back button sane.
 * Changing a filter rewrites the URL with `replace`, so filtering does not pile up history entries.
 *
 * API:
 *  - GET /quotes?...filters&limit=50&offset=N via useInfiniteQuery, key ['quotes', filters]. Response is
 *    `{ data, total, limit, offset }`; the next page is requested while `offset + data.length < total`.
 *    Quote mutations elsewhere invalidate ['quotes'], which refetches this list.
 *  - GET /quotes/export.xlsx?...same filters (no paging; the API returns up to 5000 rows) downloaded through
 *    `api.download` because a plain link cannot send the bearer token.
 *  - GET /buyers and GET /products (archived=all, so old quotes can still be filtered by an archived buyer
 *    or product) feed the two pickers. Keys ['buyers', opts] and ['products', opts].
 *
 * Local state: `showMore` (filter panel open; starts open if the URL already has extra filters), `exporting`
 * (blocks double export clicks), `search` (text in the search box, see the debounce note below).
 */
export default function Quotes() {
  // URL search params = filter state; every read below falls back to '' (meaning "no filter")
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const buyerId = params.get('buyer_id') ?? '';
  const productId = params.get('product_id') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const urlQ = params.get('q') ?? '';

  // how many of the "More filters" fields are set; shown in the button label
  const activeExtra = FILTER_KEYS.filter((k) => params.get(k)).length;
  // open the panel straight away when arriving via a link that already carries extra filters
  const [showMore, setShowMore] = useState(activeExtra > 0);
  const [exporting, setExporting] = useState(false);

  /**
   * Writes one or more filter values into the URL.
   * @param changes - map of param name -> new value; an empty string REMOVES that param.
   * Uses the functional form of `setParams` so several quick changes do not overwrite each other, and
   * `replace: true` so each change replaces the history entry instead of adding one.
   */
  const setParam = (changes: Record<string, string>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    }, { replace: true });

  // Search box: `search` is what the user typed; it is copied into the URL (`q`) 300 ms after typing stops,
  // so we do not send a request per keystroke.
  const [search, setSearch] = useState(urlQ);
  const debounced = useDebounced(search, 300);
  // last `q` value this component wrote to the URL; lets us tell our own URL updates from outside ones
  const written = useRef(urlQ);
  // Effect 1 (box -> URL): when the debounced text differs from the URL's `q`, remember it in `written` and
  // write it to the URL (trimmed). Runs only when `debounced` changes (deps lint rule disabled on purpose).
  useEffect(() => {
    const v = debounced.trim();
    if (v !== urlQ) { written.current = v; setParam({ q: v }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // Effect 2 (URL -> box): if `q` changed from OUTSIDE (back button, "Clear all filters", a link), copy it
  // into the box. The `written` check skips our own writes, so typing is never overwritten mid-keystroke.
  useEffect(() => {
    if (urlQ !== written.current) { written.current = urlQ; setSearch(urlQ); }
  }, [urlQ]);

  // the filter set sent to the API and used in the react-query key; rebuilt only when a filter changes
  const filters = useMemo(
    () => ({ status, type, buyer_id: buyerId, product_id: productId, from, to, q: urlQ }),
    [status, type, buyerId, productId, from, to, urlQ],
  );

  // paged list: `pageParam` is the row offset of the page to fetch (0, 50, 100, ...)
  const list = useInfiniteQuery({
    queryKey: ['quotes', filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<QuoteList>(`/quotes${qs({ ...filters, limit: PAGE, offset: pageParam })}`),
    getNextPageParam: (last) => (last.offset + last.data.length < last.total ? last.offset + last.limit : undefined),
  });

  // all loaded pages flattened into one array; `total` (matching rows overall) is read from the first page
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  // pickers include archived buyers/products ('all') so quotes for them can still be found
  const buyers = useBuyers({ archived: 'all' });
  const products = useProducts({ archived: 'all' });
  // buyers/products -> {value,label,sub} options for SearchSelect (sub line: city, country / grade)
  const buyerOpts = useMemo(() => (buyers.data ?? []).map((b) => ({ value: b.id, label: b.company_name, sub: [b.city, b.country].filter(Boolean).join(', ') || undefined })), [buyers.data]);
  const productOpts = useMemo(() => (products.data ?? []).map((p) => ({ value: p.id, label: p.name, sub: p.grade ?? undefined })), [products.data]);

  // shows the "Clear all filters" button when anything (status, search or an extra filter) is set
  const anyFilter = Boolean(status || urlQ || activeExtra);
  /** Clears the search box and removes every filter param from the URL (one history-neutral replace). */
  const clearAll = () => { setSearch(''); setParams({}, { replace: true }); };

  /**
   * "Export to Excel" button handler: downloads the CURRENT filtered list as `quotes.xlsx`.
   * Calls GET /quotes/export.xlsx with the same `filters` as the list (no limit/offset; the API caps at 5000
   * rows). On success a toast confirms; on failure an error toast shows the API message or a generic one.
   * Double-click guard: returns immediately while `exporting` is true, and the button is disabled+spinning.
   */
  const exportXlsx = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await api.download(`/quotes/export.xlsx${qs(filters)}`, 'quotes.xlsx');
      toast(t.quotes.exported);
    } catch (e) {
      toast(errorMessage(e) || t.quotes.exportFailed, 'error');
    } finally {
      setExporting(false);
    }
  };

  // status chips: an "All" chip (empty value clears the filter) followed by one chip per status
  const chips: { value: string; label: string }[] = [{ value: '', label: t.quotes.all }, ...STATUSES.map((s) => ({ value: s, label: t.common.status[s] }))];

  return (
    <div>
      <PageHeader
        title={t.quotes.title}
        subtitle={list.isSuccess ? t.quotes.total(total) : undefined}
        actions={<RouterButton to="/quotes/new" variant="gold"><Plus className="h-5 w-5" aria-hidden />{t.quotes.newQuote}</RouterButton>}
      />

      {/* status chips: scroll sideways on phones (negative margin lets them reach the screen edge) */}
      <div role="group" aria-label={t.quotes.statusFilter} className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((c) => (
          <button
            key={c.value || 'all'} type="button" aria-pressed={status === c.value} onClick={() => setParam({ status: c.value })}
            className={clsx('tap shrink-0 rounded-full border px-4 py-2 text-base font-semibold',
              status === c.value ? 'border-forest-900 bg-forest-900 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}
          >{c.label}</button>
        ))}
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/40" aria-hidden />
        <input
          type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.quotes.search} aria-label={t.quotes.searchLabel}
          className="min-h-tap w-full rounded-lg border border-forest-900/25 bg-white py-2 pl-10 pr-3 text-base placeholder:text-ink/40 focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {showMore ? t.quotes.lessFilters : t.quotes.moreFilters}{activeExtra > 0 && ` (${activeExtra})`}
        </Button>
        <Button variant="secondary" onClick={() => void exportXlsx()} loading={exporting} disabled={exporting}>
          {!exporting && <Download className="h-4 w-4" aria-hidden />}
          {exporting ? t.quotes.exporting : t.quotes.exportExcel}
        </Button>
        {anyFilter && <Button variant="ghost" onClick={clearAll}>{t.quotes.clearFilters}</Button>}
      </div>

      {showMore && (
        <div className="card mb-4 space-y-3 p-4">
          <Segmented<string>
            label={t.quotes.type} value={type} onChange={(v) => setParam({ type: v })}
            options={[{ value: '', label: t.quotes.anyType }, { value: 'export', label: t.common.type.export }, { value: 'domestic', label: t.common.type.domestic }]}
          />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SearchSelect label={t.quotes.buyer} value={buyerId} options={buyerOpts} onChange={(v) => setParam({ buyer_id: v })}
                placeholder={t.quotes.chooseBuyer} searchPlaceholder={t.quotes.buyerSearch} emptyText={t.common.noResults} />
            </div>
            {buyerId && <Button variant="ghost" onClick={() => setParam({ buyer_id: '' })}>{t.quotes.clear}</Button>}
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SearchSelect label={t.quotes.product} value={productId} options={productOpts} onChange={(v) => setParam({ product_id: v })}
                placeholder={t.quotes.chooseProduct} searchPlaceholder={t.quotes.productSearch} emptyText={t.common.noResults} />
            </div>
            {productId && <Button variant="ghost" onClick={() => setParam({ product_id: '' })}>{t.quotes.clear}</Button>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" label={t.quotes.dateFrom} value={from} max={to || undefined} onChange={(e) => setParam({ from: e.target.value })} />
            <Input type="date" label={t.quotes.dateTo} value={to} min={from || undefined} onChange={(e) => setParam({ to: e.target.value })} />
          </div>
        </div>
      )}

      {list.isLoading && <Spinner />}
      {list.isError && <ErrorNote error={list.error} onRetry={() => void list.refetch()} />}

      {list.isSuccess && rows.length === 0 && (
        <EmptyState title={t.quotes.emptyTitle}>{t.quotes.emptyHint}</EmptyState>
      )}

      {rows.length > 0 && (
        <>
          <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((q) => <li key={q.id}><QuoteRow q={q} /></li>)}
          </ul>
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="text-sm text-ink/65" aria-live="polite">{t.quotes.showing(rows.length, total)}</p>
            {list.hasNextPage && (
              <Button variant="secondary" className="w-full max-w-xs" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                {t.quotes.loadMore}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
