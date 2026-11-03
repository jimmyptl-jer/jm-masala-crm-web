/**
 * Buyer pipeline, route `/pipeline`: every relationship from enquiry to customer, as a board or a list.
 * Layout follows DESIGN_SYSTEM.md and docs/UI-SCREENS.md.
 *
 * API: GET /buyers (useBuyers, active only), GET /buyers/summary (useBuyerSummary: win rate, qualified, follow-ups
 * due), GET /quotes?limit=100 (each buyer's latest quote and expiry), GET /team (owner names and filter),
 * GET /buyers/:id inside the drawer. Filters and the view live in the URL: ?view=board|list&q=&country=&product=&owner=&due=1.
 * No money is added up here, so there is no pipeline value or weighted forecast; that needs deals with values and stage
 * probabilities from the API. Stage changes stay in the buyer profile (drag-and-drop needs server-side stage rules).
 * Local state: the open buyer in the drawer, the buyer being edited, the Add buyer sheet, the phone stage selector,
 * the list sort, and the search box text (mirrors the `q` param).
 */
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Columns3, Filter, List, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BuyerForm } from '@/components/BuyerForm';
import { BuyerBoard } from '@/components/buyers/BuyerBoard';
import { StagePill } from '@/components/buyers/StagePill';
import { useMediaQuery } from '@/components/quote/shared';
import { Button, EmptyState, ErrorNote, PageHeader, Sheet, Spinner } from '@/components/ui';
import { stageColors } from '@/lib/design-tokens';
import { api } from '@/lib/api';
import { hasRoute } from '@/lib/config';
import { date, todayIST } from '@/lib/format';
import { useBuyerSummary, useBuyers, useDebounced, useTeam } from '@/lib/hooks';
import { APPROVED_PRODUCT_NAMES } from '@/lib/products';
import type { Buyer, QuoteList, Stage } from '@/lib/types';
import { t } from '@/strings';
import { BuyerDrawer } from '@/pages/Buyers';

const p = t.pipeline;

/** The seven board columns (same grouping as BuyerBoard), with the funnel colour of each. */
const FUNNEL: { key: Stage; label: string; stages: Stage[]; color: string }[] = [
  { key: 'new_lead', label: 'New leads', stages: ['new_lead'], color: stageColors.enquiry },
  { key: 'contacted', label: 'Contacted', stages: ['contacted'], color: stageColors.sample_sent },
  { key: 'qualified', label: 'Qualified', stages: ['qualified', 'requirements_received'], color: stageColors.quotation },
  { key: 'quotation_sent', label: 'Quotation sent', stages: ['quotation_sent', 'sample_requested', 'sample_payment_pending', 'sample_dispatched', 'sample_approved'], color: stageColors.pi_issued },
  { key: 'negotiation', label: 'Negotiation', stages: ['negotiation', 'po_received'], color: stageColors.negotiation },
  { key: 'won', label: 'Won', stages: ['won'], color: stageColors.fully_paid },
  { key: 'lost', label: 'Lost', stages: ['lost'], color: stageColors.lost },
];

type SortKey = 'buyer' | 'country' | 'stage' | 'next' | 'owner' | 'activity';

/** One KPI card. `hero` is the highlighted first card; `onClick` makes it a button. */
function Kpi({ label, value, sub, hero, tone, onClick }: { label: string; value: string | number; sub: string; hero?: boolean; tone?: 'danger'; onClick?: () => void }) {
  const cls = clsx('rounded-xl border p-5 text-left shadow-card', hero ? 'border-paprika-200 bg-surface' : 'border-line bg-surface', onClick && 'hover:border-line-strong');
  const body = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent-ink">{label}</p>
      <p className={clsx('mt-2 text-[28px] font-bold leading-8 tabular-nums', tone === 'danger' ? 'text-danger-ink' : hero ? 'text-accent-strong' : 'text-fg')}>{value}</p>
      <p className="mt-1 text-xs text-fg-muted">{sub}</p>
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

/** Pipeline screen. */
export default function Pipeline() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'board';
  const urlQ = params.get('q') ?? '';
  const country = params.get('country') ?? '';
  const product = params.get('product') ?? '';
  const owner = params.get('owner') ?? '';
  const dueOnly = params.get('due') === '1';
  const today = todayIST();
  const wide = useMediaQuery('(min-width: 768px)');

  const setParam = (changes: Record<string, string>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
      return next;
    }, { replace: true });

  // search box <-> URL (debounced; outside changes such as Back are copied in)
  const [search, setSearch] = useState(urlQ);
  const debounced = useDebounced(search.trim(), 250);
  const written = useRef(urlQ);
  useEffect(() => {
    if (debounced !== urlQ) { written.current = debounced; setParam({ q: debounced }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    if (urlQ !== written.current) { written.current = urlQ; setSearch(urlQ); }
  }, [urlQ]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Buyer | null>(null);
  const [adding, setAdding] = useState(false);
  const [mobileStage, setMobileStage] = useState<Stage>('new_lead');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'next', desc: false });

  const buyersQuery = useBuyers({ archived: 'false' });
  const summary = useBuyerSummary();
  const quotes = useQuery({ queryKey: ['pipeline', 'quotes'], queryFn: () => api.get<QuoteList>('/quotes?limit=100') });
  const team = useTeam();
  const ownerName = (b: Buyer) => team.find((m) => m.id === b.assigned_to)?.full_name ?? '—';

  const all = buyersQuery.data ?? [];
  const countries = useMemo(() => [...new Set(all.map((b) => b.country).filter((x): x is string => !!x))].sort(), [all]);
  const overdueOf = (b: Buyer) => !!b.next_followup && b.next_followup < today && b.stage !== 'won' && b.stage !== 'lost';
  const dueOf = (b: Buyer) => !!b.next_followup && b.next_followup <= today && b.stage !== 'won' && b.stage !== 'lost';

  const filtered = useMemo(() => all.filter((b) => {
    const text = [b.company_name, b.contact_name, b.country, b.city, ...b.interested_products].filter(Boolean).join(' ').toLowerCase();
    return (!urlQ || text.includes(urlQ.toLowerCase()))
      && (!country || b.country === country)
      && (!product || b.interested_products.some((x) => x.toLowerCase().includes(product.toLowerCase())))
      && (!owner || b.assigned_to === owner)
      && (!dueOnly || dueOf(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [all, urlQ, country, product, owner, dueOnly, today]);

  const sorted = useMemo(() => {
    const val = (b: Buyer): string => ({
      buyer: b.company_name, country: b.country ?? '', stage: t.crm.stages[b.stage], next: b.next_followup ?? '9999',
      owner: ownerName(b), activity: b.last_contact_at ?? '',
    })[sort.key];
    return [...filtered].sort((a, b) => (sort.desc ? -1 : 1) * val(a).localeCompare(val(b), undefined, { sensitivity: 'base' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, team]);

  const open = all.filter((b) => b.stage !== 'won' && b.stage !== 'lost');
  const overdue = all.filter(overdueOf).length;
  const dueCount = all.filter(dueOf).length;
  const counts = FUNNEL.map((f) => ({ ...f, n: filtered.filter((b) => f.stages.includes(b.stage)).length }));
  const totalN = Math.max(1, counts.reduce((n, c) => n + c.n, 0));
  const s = summary.data;
  const summaryOn = hasRoute('GET', '/buyers/summary');
  const filtering = !!(urlQ || country || product || owner || dueOnly);
  const ctl = 'h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';
  const toggleSort = (key: SortKey) => setSort((cur) => (cur.key === key ? { key, desc: !cur.desc } : { key, desc: false }));
  const head = (key: SortKey, label: string) => (
    <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 uppercase tracking-[0.06em] hover:text-fg">{label}{sort.key === key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}</button>
  );
  const scrollToColumn = (key: Stage) => {
    if (view !== 'board') setParam({ view: '' });
    if (wide) setTimeout(() => document.getElementById(`col-${key}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), 50);
    else setMobileStage(key);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={p.title}
        subtitle={p.subtitle}
        actions={(
          <>
            <div role="group" aria-label={p.viewLabel} className="inline-flex rounded-lg border border-line-strong bg-surface p-1">
              {([['board', p.viewBoard, <Columns3 key="b" className="h-4 w-4" />], ['list', p.viewList, <List key="l" className="h-4 w-4" />]] as const).map(([key, label, icon]) => (
                <button key={key} type="button" aria-pressed={view === key} onClick={() => setParam({ view: key === 'board' ? '' : key })}
                  className={clsx('tap inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-bold', view === key ? 'bg-brand text-white' : 'text-fg-secondary hover:bg-brand-50')}>{icon}{label}</button>
              ))}
            </div>
            <Button variant="gold" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />{p.newDeal}</Button>
          </>
        )}
      />

      <section aria-label={p.kpiLabel} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi hero label={p.kpiOpen} value={buyersQuery.isPending ? '—' : open.length} sub={p.kpiOpenSub} />
        <Kpi label={p.kpiQualified} value={s ? s.totals.qualified : '—'} sub={summaryOn ? p.kpiQualifiedSub : t.common.notAvailable} />
        <Kpi label={p.kpiWin} value={s ? (s.totals.conversion_rate === null ? '—' : `${s.totals.conversion_rate}%`) : '—'} sub={summaryOn ? p.kpiWinSub : t.common.notAvailable} />
        <Kpi label={p.kpiDue} value={buyersQuery.isPending ? '—' : dueCount} tone={overdue > 0 ? 'danger' : undefined} sub={overdue > 0 ? p.kpiDueOverdue(overdue) : p.kpiDueNone}
          onClick={() => setParam({ due: dueOnly ? '' : '1' })} />
      </section>

      {quotes.data && quotes.data.total > quotes.data.data.length && <p role="status" className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">{t.common.listTruncated(quotes.data.data.length, quotes.data.total)}</p>}

      {/* funnel: one bar, segment width = buyers per stage; click a segment to jump to its column */}
      {!buyersQuery.isPending && (
        <div className="glass-panel p-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={p.funnelLabel}>
            {counts.filter((c) => c.n > 0).map((c) => <button key={c.key} type="button" title={`${c.label} ${c.n}`} aria-label={`${c.label} ${c.n}`} onClick={() => scrollToColumn(c.key)} style={{ width: `${(c.n / totalN) * 100}%`, backgroundColor: c.color }} className="h-full" />)}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary">
            {counts.map((c) => <li key={c.key}><button type="button" onClick={() => scrollToColumn(c.key)} className="inline-flex items-center gap-1.5 hover:text-fg"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />{c.label} <b className="tabular-nums">{c.n}</b></button></li>)}
          </ul>
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block min-w-[200px] flex-1">
          <span className="sr-only">{p.searchLabel}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={p.searchPlaceholder} className={clsx(ctl, 'w-full pl-9')} />
        </label>
        <select aria-label={p.country} value={country} onChange={(e) => setParam({ country: e.target.value })} className={ctl}><option value="">{p.allCountries}</option>{countries.map((c) => <option key={c}>{c}</option>)}</select>
        <select aria-label={p.product} value={product} onChange={(e) => setParam({ product: e.target.value })} className={ctl}><option value="">{p.allProducts}</option>{APPROVED_PRODUCT_NAMES.map((n) => <option key={n}>{n}</option>)}</select>
        <select aria-label={p.owner} value={owner} onChange={(e) => setParam({ owner: e.target.value })} className={ctl}><option value="">{p.allOwners}</option>{team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select>
        <button type="button" aria-pressed={dueOnly} onClick={() => setParam({ due: dueOnly ? '' : '1' })}
          className={clsx('tap inline-flex items-center gap-2 rounded-lg border px-3 text-sm font-bold', dueOnly ? 'border-accent bg-surface-muted text-ink-muted' : 'border-line bg-surface text-fg-secondary hover:bg-brand-50')}><Filter className="h-4 w-4" aria-hidden />{p.needsFollowup}</button>
        {filtering && <Button variant="ghost" onClick={() => { setSearch(''); setParams(view === 'list' ? { view: 'list' } : {}, { replace: true }); }}>{p.clearFilters}</Button>}
      </div>

      {buyersQuery.isPending ? <Spinner label={p.loading} /> : buyersQuery.isError ? <ErrorNote error={buyersQuery.error} onRetry={() => void buyersQuery.refetch()} /> : filtered.length === 0 ? (
        <section className="glass-panel p-6">
          <EmptyState title={filtering ? p.noMatch : p.none}>
            <button type="button" className="mt-2 font-bold text-accent-ink underline" onClick={() => (filtering ? (setSearch(''), setParams({}, { replace: true })) : setAdding(true))}>{filtering ? p.clearFilters : p.addFirst}</button>
          </EmptyState>
        </section>
      ) : view === 'board' ? (
        wide ? (
          <section className="glass-panel p-3" aria-label={p.boardLabel}><BuyerBoard buyers={filtered} quotes={quotes.data?.data} onOpen={(b) => setOpenId(b.id)} /></section>
        ) : (
          <section aria-label={p.boardLabel} className="space-y-3">
            <label className="block"><span className="sr-only">{p.stageSelect}</span>
              <select value={mobileStage} onChange={(e) => setMobileStage(e.target.value as Stage)} className={clsx(ctl, 'w-full')}>
                {counts.map((c) => <option key={c.key} value={c.key}>{c.label} ({c.n})</option>)}
              </select>
            </label>
            <BuyerBoard buyers={filtered} quotes={quotes.data?.data} onOpen={(b) => setOpenId(b.id)} only={mobileStage} />
          </section>
        )
      ) : (
        <section className="glass-panel overflow-x-auto" aria-label={p.listLabel}>
          <table className="rt w-full min-w-[820px] text-left text-[13.5px]">
            <thead className="bg-surface-muted"><tr className="text-[11px] font-bold text-fg-muted">
              <th className="px-4 py-2.5">{head('buyer', p.colBuyer)}</th><th className="px-4 py-2.5">{head('country', p.colCountry)}</th><th className="px-4 py-2.5">{head('stage', p.colStage)}</th>
              <th className="px-4 py-2.5">{head('next', p.colNext)}</th><th className="px-4 py-2.5">{head('owner', p.colOwner)}</th><th className="px-4 py-2.5">{head('activity', p.colActivity)}</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {sorted.map((b) => (
                <tr key={b.id} tabIndex={0} onClick={() => setOpenId(b.id)} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(b.id); }} className="cursor-pointer align-top hover:bg-brand-50 focus-visible:bg-brand-50">
                  <td className="px-4 py-3 font-bold text-fg">{b.company_name}</td>
                  <td className="px-4 py-3 text-fg-secondary">{b.country ?? b.state ?? '—'}</td>
                  <td className="px-4 py-3"><StagePill stage={b.stage} /></td>
                  <td className="px-4 py-3">{b.next_followup ? <span className={clsx(overdueOf(b) ? 'font-bold text-danger-ink' : 'text-fg-secondary')}>{[b.next_action, date(b.next_followup)].filter(Boolean).join(' · ')}</span> : <span className="text-warning-ink">{t.crm.cardNoNextAction}</span>}</td>
                  <td className="px-4 py-3 text-fg-secondary">{ownerName(b)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">{b.last_contact_at ? date(b.last_contact_at) : t.crm.noContactYet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {openId && <BuyerDrawer key={openId} id={openId} onClose={() => setOpenId(null)} onEdit={(b) => setEditing(b)} />}
      <Sheet wide open={adding} onClose={() => setAdding(false)} title={p.addBuyerTitle}>
        <BuyerForm onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); void buyersQuery.refetch(); void summary.refetch(); }} />
      </Sheet>
      <Sheet wide open={!!editing} onClose={() => setEditing(null)} title={p.editBuyerTitle}>
        <BuyerForm initial={editing ?? undefined} onCancel={() => setEditing(null)} onSaved={(b) => { setEditing(null); setOpenId(b.id); void buyersQuery.refetch(); void summary.refetch(); }} />
      </Sheet>
    </div>
  );
}
