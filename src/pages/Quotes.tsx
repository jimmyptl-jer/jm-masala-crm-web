/**
 * Quotations list, route `/quotes` (alias `/quotations`; see web/src/router.tsx). See everything at a glance,
 * filter, and open a quotation. Layout follows DESIGN_SYSTEM.md and docs/UI-SCREENS.md.
 *
 * API: GET /quotes (paged, react-query infinite key ['quotes', filters]); one GET /quotes?limit=1 per status card for
 * the counts (key ['quotes', 'count', ...], so any quote change refreshes them); GET /quotes/export.xlsx (download); GET /buyers and GET /products for the
 * Country and Product filters; GET /quotes/:id (to duplicate) and the PDF link (useful for "Download PDF").
 * Filters live in the URL: ?status=&period=&from=&to=&product_id=&country=&q=. Period defaults to the current Indian
 * financial year (Apr to Mar). Money on a row is a decimal string formatted by `money`; nothing is added up here, so
 * the status cards show counts only (value totals need the API). The Quantity (MT) column and the item count under
 * the quote number need the API to return them.
 * The Country filter is not an API filter yet: while a country is chosen the list loads up to 500 quotes and is
 * filtered in the browser (the cards then count from those rows).
 */
import clsx from 'clsx';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { CalendarDays, Download, MoreHorizontal, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '@/lib/api';
import { date, money, todayIST } from '@/lib/format';
import { useBuyers, useDebounced, useProducts } from '@/lib/hooks';
import type { QuoteDetail, QuoteList, QuoteListRow, QuoteStatus } from '@/lib/types';
import { Button, EmptyState, ErrorNote, PageHeader, StatusBadge, errorMessage, useToast } from '@/components/ui';
import { DuplicateSheet } from '@/components/quote/DuplicateSheet';
import { hasRoute, PROBE_ID } from '@/lib/config';
import { QuoteRow } from '@/components/quote/QuoteRow';
import { RouterButton, usePdfFetcher } from '@/components/quote/shared';
import { t } from '@/strings';

const s = t.quotes;
const PAGE = 50;
/** Rows loaded at once while the browser-side country filter is on. */
const COUNTRY_LIMIT = 500;

/** The five status cards. `value` is the API status filter ('' = all). */
const CARDS: { value: QuoteStatus | ''; label: string; tone: string }[] = [
  { value: '', label: s.cardAll, tone: 'text-accent-ink' },
  { value: 'draft', label: s.cardDraft, tone: 'text-fg-secondary' },
  { value: 'sent', label: s.cardSent, tone: 'text-info-ink' },
  { value: 'won', label: s.cardAccepted, tone: 'text-success-ink' },
  { value: 'expired', label: s.cardExpired, tone: 'text-danger-ink' },
];
const STATUS_OPTIONS: QuoteStatus[] = ['draft', 'sent', 'negotiating', 'won', 'lost', 'expired'];

/** Indian financial year (April to March) containing `ymd`: its dates and a label like '2026-27'. */
function fyOf(ymd: string, back = 0) {
  const [y = 0, m = 1] = ymd.split('-').map(Number);
  const start = (m >= 4 ? y : y - 1) - back;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `${start}-${String(start + 1).slice(2)}` };
}

/** Whole days from `a` to `b` (both 'YYYY-MM-DD'). */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The row's "..." menu: Duplicate, Download PDF, and the two actions that wait for later features. */
function RowMenu({ q }: { q: QuoteListRow }) {
  const [open, setOpen] = useState(false);
  const [dup, setDup] = useState<QuoteDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const fetchPdf = usePdfFetcher();
  const label = q.number ?? s.draftNumber;
  const item = 'flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-fg-placeholder disabled:hover:bg-transparent';

  const duplicate = async () => {
    setOpen(false);
    setBusy(true);
    try { setDup(await api.get<QuoteDetail>(`/quotes/${q.id}`)); } catch { toast(s.loadFailedDetail, 'error'); } finally { setBusy(false); }
  };
  const pdf = async () => {
    setOpen(false);
    if (q.current_revision === null) return;
    try { window.open((await fetchPdf(q.id, q.current_revision)).url, '_blank', 'noopener'); } catch (e) { toast(errorMessage(e) || s.pdfFailed, 'error'); }
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={s.menuLabel(label)} aria-expanded={open} disabled={busy} onClick={() => setOpen((v) => !v)}
        className="tap grid place-items-center rounded-lg text-fg-muted hover:bg-surface-muted"><MoreHorizontal className="h-4 w-4" /></button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-line-strong bg-surface p-1 shadow-pop">
            {hasRoute('POST', `/quotes/${PROBE_ID}/duplicate`) && <button type="button" role="menuitem" className={item} onClick={() => void duplicate()}>{s.menuDuplicate}</button>}
            <button type="button" role="menuitem" className={item} disabled={q.current_revision === null} title={q.current_revision === null ? s.menuNoPdf : undefined} onClick={() => void pdf()}>{s.menuPdf}</button>
            <button type="button" role="menuitem" className={item} disabled title={s.menuPiNote}>{s.menuPi}</button>
            <button type="button" role="menuitem" className={item} disabled title={s.menuArchiveNote}>{s.menuArchive}</button>
          </div>
        </>
      )}
      {dup && <DuplicateSheet open onClose={() => setDup(null)} quote={dup} />}
    </div>
  );
}

/** Valid-until cell: the date, orange when 3 days or fewer remain, red when expired. */
function Valid({ q, today }: { q: QuoteListRow; today: string }) {
  if (!q.valid_until) return <span className="text-fg-placeholder">{'—'}</span>;
  const left = daysBetween(today, q.valid_until);
  const expired = q.status === 'expired' || left < 0;
  const soon = !expired && left <= 3 && (q.status === 'sent' || q.status === 'negotiating');
  return (
    <div className={clsx(expired ? 'text-danger-ink' : soon ? 'text-warning-ink' : 'text-fg-secondary')}>
      <div className={clsx((expired || soon) && 'font-bold')}>{date(q.valid_until)}</div>
      {expired ? <div className="text-xs">{s.expiredWord}</div> : soon ? <div className="text-xs">{s.inDays(left)}</div> : null}
    </div>
  );
}

/** Quotations screen. Local state: the search box text, which mirrors the `q` URL param. */
export default function Quotes() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();
  const today = todayIST();
  const status = params.get('status') ?? '';
  const productId = params.get('product_id') ?? '';
  const country = params.get('country') ?? '';
  const urlQ = params.get('q') ?? '';
  const period = params.get('period') ?? 'fy';
  const [exporting, setExporting] = useState(false);

  const setParam = (changes: Record<string, string>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    }, { replace: true });

  // search box <-> URL (same two-effect pattern as before: typing is debounced, outside changes are copied in)
  const [search, setSearch] = useState(urlQ);
  const debounced = useDebounced(search, 300);
  const written = useRef(urlQ);
  useEffect(() => {
    const v = debounced.trim();
    if (v !== urlQ) { written.current = v; setParam({ q: v }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    if (urlQ !== written.current) { written.current = urlQ; setSearch(urlQ); }
  }, [urlQ]);

  // period -> from/to
  const fy = fyOf(today);
  const lastFy = fyOf(today, 1);
  const range = period === 'all' ? { from: '', to: '' }
    : period === 'lfy' ? { from: lastFy.from, to: lastFy.to }
    : period === 'custom' ? { from: params.get('from') ?? '', to: params.get('to') ?? '' }
    : { from: fy.from, to: fy.to };

  const buyers = useBuyers({ archived: 'all' });
  const products = useProducts({ archived: 'all' });
  const countries = useMemo(() => [...new Set((buyers.data ?? []).map((b) => b.country).filter((c): c is string => !!c))].sort(), [buyers.data]);
  const countryOf = useMemo(() => new Map((buyers.data ?? []).map((b) => [b.id, b.country ?? b.state ?? ''])), [buyers.data]);

  // everything except the status goes to the API; with a country chosen the status is applied in the browser too
  const clientMode = !!country;
  const base = { product_id: productId, from: range.from, to: range.to, q: urlQ };
  const filters = useMemo(() => ({ ...base, status: clientMode ? '' : status }), [productId, range.from, range.to, urlQ, status, clientMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useInfiniteQuery({
    queryKey: ['quotes', filters, clientMode],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<QuoteList>(`/quotes${qs({ ...filters, limit: clientMode ? COUNTRY_LIMIT : PAGE, offset: pageParam })}`),
    getNextPageParam: (last) => (last.offset + last.data.length < last.total ? last.offset + last.limit : undefined),
  });
  const loaded = list.data?.pages.flatMap((p) => p.data) ?? [];
  const rows = clientMode
    ? loaded.filter((r) => countryOf.get(r.buyer_id) === country && (!status || r.status === status))
    : loaded;
  const total = clientMode ? rows.length : (list.data?.pages[0]?.total ?? 0);

  // card counts: one tiny request per status (same filters), or counted from the loaded rows in country mode
  const counts = useQueries({
    queries: CARDS.map((c) => ({
      queryKey: ['quotes', 'count', { ...base, status: c.value }],
      queryFn: () => api.get<QuoteList>(`/quotes${qs({ ...base, status: c.value, limit: 1, offset: 0 })}`).then((r) => r.total),
      enabled: !clientMode,
    })),
  });
  const countOf = (i: number): string => {
    const c = CARDS[i]!;
    if (clientMode) {
      const inCountry = loaded.filter((r) => countryOf.get(r.buyer_id) === country);
      return String(c.value ? inCountry.filter((r) => r.status === c.value).length : inCountry.length);
    }
    return counts[i]?.data === undefined ? '—' : String(counts[i]!.data);
  };

  const anyFilter = Boolean(status || urlQ || productId || country || period !== 'fy');
  const clearAll = () => { setSearch(''); setParams({}, { replace: true }); };

  const exportXlsx = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await api.download(`/quotes/export.xlsx${qs(filters)}`, 'quotes.xlsx');
      toast(s.exported);
    } catch (e) {
      toast(errorMessage(e) || s.exportFailed, 'error');
    } finally {
      setExporting(false);
    }
  };

  const open = (q: QuoteListRow) => navigate(q.latest_state === 'draft' && q.quote_no === null ? `/quotes/${q.id}/edit` : `/quotes/${q.id}`);
  const ctl = 'h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

  return (
    <div className="space-y-4">
      <PageHeader
        title={s.pageTitle}
        subtitle={s.pageSubtitle}
        actions={(
          <>
            {hasRoute('GET', '/quotes/export.xlsx') && <Button variant="secondary" onClick={() => void exportXlsx()} loading={exporting} disabled={exporting}>{!exporting && <Download className="h-4 w-4" aria-hidden />}{s.export}</Button>}
            <RouterButton to="/quotes/new" variant="gold">{s.newQuotation}</RouterButton>
          </>
        )}
      />

      {/* status cards: count each; the active card is brand brown with white text; click to filter */}
      <div role="group" aria-label={s.cardsLabel} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {CARDS.map((c, i) => {
          const active = status === c.value;
          return (
            <button key={c.value || 'all'} type="button" aria-pressed={active} onClick={() => setParam({ status: c.value })}
              className={clsx('tap rounded-xl border p-4 text-left shadow-card transition-colors', active ? 'border-paprika bg-paprika text-white' : 'border-line bg-surface hover:border-line-strong')}>
              <span className={clsx('block text-[11px] font-bold uppercase tracking-[0.06em]', active ? 'text-paprika-100' : c.tone)}>{c.label}</span>
              <span className="mt-1 block text-[28px] font-bold leading-8 tabular-nums">{countOf(i)}</span>
            </button>
          );
        })}
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-[220px] flex-1">
          <span className="sr-only">{s.searchLabel}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={s.searchPlaceholder} className={clsx(ctl, 'w-full pl-9')} />
        </label>
        <select aria-label={s.statusFilter2} value={status} onChange={(e) => setParam({ status: e.target.value })} className={ctl}>
          <option value="">{s.allStatuses}</option>
          {STATUS_OPTIONS.map((v) => <option key={v} value={v}>{t.common.status[v]}</option>)}
        </select>
        <select aria-label={s.country} value={country} onChange={(e) => setParam({ country: e.target.value })} className={ctl}>
          <option value="">{s.allCountries}</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label={s.productFilter} value={productId} onChange={(e) => setParam({ product_id: e.target.value })} className={ctl}>
          <option value="">{s.allProducts}</option>
          {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.grade ? ` – ${p.grade}` : ''}</option>)}
        </select>
        <label className="relative">
          <span className="sr-only">{s.period}</span>
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <select value={period} onChange={(e) => setParam({ period: e.target.value === 'fy' ? '' : e.target.value, from: '', to: '' })} className={clsx(ctl, 'pl-9')}>
            <option value="fy">{s.periodFy(fy.label)}</option>
            <option value="lfy">{s.periodLastFy(lastFy.label)}</option>
            <option value="all">{s.periodAll}</option>
            <option value="custom">{s.periodCustom}</option>
          </select>
        </label>
        {period === 'custom' && (
          <>
            <input type="date" aria-label={t.quotes.dateFrom} value={range.from} max={range.to || undefined} onChange={(e) => setParam({ from: e.target.value })} className={ctl} />
            <input type="date" aria-label={t.quotes.dateTo} value={range.to} min={range.from || undefined} onChange={(e) => setParam({ to: e.target.value })} className={ctl} />
          </>
        )}
        {anyFilter && <Button variant="ghost" onClick={clearAll}>{s.clearAllFilters}</Button>}
      </div>

      {list.isError && <ErrorNote error={list.error} onRetry={() => void list.refetch()} />}

      {list.isLoading && (
        <div className="space-y-2" role="status" aria-label={t.common.loading}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl border border-line-strong bg-surface-muted" />)}
        </div>
      )}

      {list.isSuccess && rows.length === 0 && (
        <div className="glass-panel p-6">
          {anyFilter ? (
            <EmptyState title={s.filteredEmpty}>{s.filteredEmptyHint}</EmptyState>
          ) : (
            <EmptyState title={s.emptyTitle}>{s.emptyHint}</EmptyState>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* wide screens: a table; click a row to open it */}
          <div className="glass-panel hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-[13.5px]">
              <thead className="bg-surface-muted">
                <tr className="text-[11px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                  <th className="px-4 py-2.5">{s.colQuoteNo}</th><th className="px-4 py-2.5">{s.colBuyer}</th>
                  <th className="px-4 py-2.5 text-right">{s.colValue}</th><th className="px-4 py-2.5">{s.colValid}</th><th className="px-4 py-2.5">{s.colStatus}</th><th className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((q) => (
                  <tr key={q.id} tabIndex={0} onClick={() => open(q)} onKeyDown={(e) => { if (e.key === 'Enter') open(q); }}
                    aria-label={s.rowAria(q.number ?? s.draftNumber, q.buyer_name)} className="cursor-pointer align-top hover:bg-brand-50 focus-visible:bg-brand-50">
                    <td className="px-4 py-3"><div className="font-bold text-fg">{q.number ?? s.draftNumber}</div><div className="max-w-[16rem] truncate text-xs text-fg-muted">{q.products || s.noProducts}</div></td>
                    <td className="px-4 py-3"><div className="font-bold text-fg">{q.buyer_name}</div><div className="text-xs text-fg-muted">{countryOf.get(q.buyer_id) || '—'}</div></td>
                    <td className="num whitespace-nowrap px-4 py-3 font-bold text-fg">{money(q.grand_total, q.currency)}</td>
                    <td className="px-4 py-3"><Valid q={q} today={today} /></td>
                    <td className="px-4 py-3"><StatusBadge status={q.status} /></td>
                    <td className="px-2 py-2"><RowMenu q={q} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* phones: one card per quotation */}
          <ul className="grid gap-3 md:hidden">{rows.map((q) => <li key={q.id}><QuoteRow q={q} /></li>)}</ul>

          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-fg-muted" aria-live="polite">{s.showing(rows.length, total)}{clientMode && ` · ${s.countryNote}`}</p>
            {!clientMode && list.hasNextPage && (
              <Button variant="secondary" className="w-full max-w-xs" onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>{s.loadMore}</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
