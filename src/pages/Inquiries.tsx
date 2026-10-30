/**
 * Inquiries list: /inquiries. One row per inquiry with the columns Inquiry ID, Date, Buyer, Product, Grade / purity, Quantity, Destination,
 * Trade terms, Source, Status, Assigned to, Next follow-up and Actions (view, edit, create quotation). Filters: search, status, buyer,
 * product, owner, due follow-ups and archived. API: GET /inquiries (key ['inquiries', opts]); the whole list is loaded and the text
 * search, sorting and paging happen in the browser, like the Buyers page. "New inquiry" opens /inquiries/new.
 */
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, FilePlus2, Filter, Pencil, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InquiryStatusPill } from '@/components/inquiries/InquiryStatusPill';
import { Button, EmptyState, ErrorNote, PageHeader, Select, Spinner } from '@/components/ui';
import { date, todayIST } from '@/lib/format';
import { useBuyers, useDebounced, useInquiries, useTeam } from '@/lib/hooks';
import { APPROVED_PRODUCT_NAMES } from '@/lib/products';
import type { Inquiry, InquiryStatus } from '@/lib/types';
import { t } from '@/strings';

const s = t.inquiries;
const STATUSES = Object.keys(s.status) as InquiryStatus[];
const PAGE_SIZE = 10;
const CELL = 'border-t border-slate-200/75 px-3 py-3';
const OPEN: InquiryStatus[] = ['new', 'reviewing', 'quoted'];

type SortKey = 'code' | 'date' | 'buyer' | 'product' | 'destination' | 'source' | 'status' | 'owner' | 'followup';

const firstLine = (i: Inquiry) => i.products[0];
const destination = (i: Inquiry) => [i.destination_port, i.destination_country].filter(Boolean).join(', ');
const sourceLabel = (i: Inquiry) => (i.source ? s.source[i.source] : '');

/** One summary tile; a button that shows the inquiries it counts in the list below. */
function Metric({ label, value, detail, onOpen }: { label: string; value: number | string; detail: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-label={`${label}: ${value}. Show them in the list`} className="glass-panel block w-full p-4 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paprika/40"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums text-crm-ink">{value}</div><div className="mt-0.5 text-xs text-slate-500">{detail}</div></button>;
}

export default function Inquiries() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [buyer, setBuyer] = useState('');
  const [product, setProduct] = useState('');
  const [owner, setOwner] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });
  const [page, setPage] = useState(0);
  const delayed = useDebounced(search.trim(), 250);
  const query = useInquiries({ archived: showArchived ? 'all' : 'false' });
  const buyersQuery = useBuyers({ archived: 'false' });
  const team = useTeam();
  const all = query.data ?? [];
  const reset = () => setPage(0);

  const filtered = useMemo(() => all.filter((i) => {
    const q = delayed.toLowerCase();
    const text = [i.inquiry_code, i.buyer_name, i.destination_country, i.destination_port, ...i.products.map((p) => p.product_name)].filter(Boolean).join(' ').toLowerCase();
    return (!q || text.includes(q)) && (!status || i.status === status) && (!buyer || i.buyer_id === buyer) && (!product || i.products.some((p) => p.product_name === product)) && (!owner || i.assigned_to === owner)
      && (!dueOnly || (!!i.next_followup && i.next_followup <= todayIST() && OPEN.includes(i.status))) && (!openOnly || i.status === 'new' || i.status === 'reviewing');
  }), [all, delayed, status, buyer, product, owner, dueOnly, openOnly]);

  const ownerLabel = (i: Inquiry) => team.find((p) => p.id === i.assigned_to)?.full_name ?? s.unassigned;
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const val = (i: Inquiry): string => sort.key === 'code' ? i.inquiry_code : sort.key === 'date' ? i.inquiry_date : sort.key === 'buyer' ? i.buyer_name : sort.key === 'product' ? firstLine(i)?.product_name ?? '' : sort.key === 'destination' ? destination(i) : sort.key === 'source' ? sourceLabel(i) : sort.key === 'status' ? s.status[i.status] : sort.key === 'owner' ? ownerLabel(i) : i.next_followup ?? '9999';
    return (sort.desc ? -1 : 1) * val(a).localeCompare(val(b), undefined, { sensitivity: 'base' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, sort, team]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const filtering = !!(search || status || buyer || product || owner || dueOnly || openOnly);
  const open = all.filter((i) => i.status === 'new' || i.status === 'reviewing').length;
  const due = all.filter((i) => !!i.next_followup && i.next_followup <= todayIST() && OPEN.includes(i.status) && !i.archived).length;

  /** A tile was clicked: show exactly those inquiries (no other filter), then scroll to the list. */
  const show = ({ status: next, due = false, open: openNow = false }: { status: string; due?: boolean; open?: boolean }) => {
    setSearch(''); setBuyer(''); setProduct(''); setOwner(''); setStatus(next); setDueOnly(due); setOpenOnly(openNow); setPage(0);
    window.setTimeout(() => document.getElementById('inquiries-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const toggleSort = (key: SortKey) => { reset(); setSort((c) => (c.key === key ? { key, desc: !c.desc } : { key, desc: false })); };
  const sortButton = (key: SortKey, label: string) => <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-crm-ink">{label}{sort.key === key && (sort.desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />)}</button>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <PageHeader title={s.title} subtitle={s.subtitle} actions={<Button onClick={() => navigate('/inquiries/new')}><Plus className="h-5 w-5" />{s.add}</Button>} />
      <label className="relative mb-3 block min-w-0 xl:w-[420px]"><span className="sr-only">{s.search}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3 text-sm text-crm-ink shadow-sm placeholder:text-slate-500 focus:border-blue-300 focus:bg-white" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder={s.search} type="search" /></label>
    </div>

    <section aria-label="Inquiry metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={s.metricOpen} value={query.isPending ? '—' : open} detail={s.metricOpenSub} onOpen={() => show({ status: '', open: true })} />
      <Metric label={s.metricNew} value={query.isPending ? '—' : all.filter((i) => i.status === 'new').length} detail={s.metricNewSub} onOpen={() => show({ status: 'new' })} />
      <Metric label={s.metricQuoted} value={query.isPending ? '—' : all.filter((i) => i.status === 'quoted').length} detail={s.metricQuotedSub} onOpen={() => show({ status: 'quoted' })} />
      <Metric label={s.metricDue} value={query.isPending ? '—' : due} detail={s.metricDueSub} onOpen={() => show({ status: '', due: true })} />
    </section>

    <section className="glass-panel overflow-hidden" aria-labelledby="inquiries-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div><h2 id="inquiries-heading" className="text-lg font-bold tracking-tight text-crm-ink">{s.directory}</h2><p className="text-sm text-slate-500">{query.isPending ? s.loading : s.match(filtered.length)}</p></div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setDueOnly((v) => !v); reset(); }} aria-pressed={dueOnly} className={clsx('tap inline-flex items-center gap-2 rounded-xl border px-3 text-sm font-semibold', dueOnly ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-line-strong bg-surface text-slate-600 hover:bg-white')}><Filter className="h-4 w-4" />{s.dueOnly}</button>
          <button type="button" onClick={() => { setShowArchived((v) => !v); reset(); }} aria-pressed={showArchived} className={clsx('tap inline-flex items-center gap-2 rounded-xl border px-3 text-sm font-semibold', showArchived ? 'border-line-strong bg-surface-muted text-ink' : 'border-line-strong bg-surface text-slate-600 hover:bg-white')}>{s.archivedToggle}</button>
        </div>
      </div>
      <div className="grid gap-3 border-b border-slate-200/70 bg-surface p-4 sm:grid-cols-2 xl:grid-cols-4">
        <Select label={s.filters.status} value={status} onChange={(e) => { setStatus(e.target.value); setOpenOnly(false); reset(); }}><option value="">{s.filters.allStatuses}</option>{STATUSES.map((x) => <option key={x} value={x}>{s.status[x]}</option>)}</Select>
        <Select label={s.filters.buyer} value={buyer} onChange={(e) => { setBuyer(e.target.value); reset(); }}><option value="">{s.filters.allBuyers}</option>{(buyersQuery.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.company_name}</option>)}</Select>
        <Select label={s.filters.product} value={product} onChange={(e) => { setProduct(e.target.value); reset(); }}><option value="">{s.filters.allProducts}</option>{APPROVED_PRODUCT_NAMES.map((n) => <option key={n}>{n}</option>)}</Select>
        <Select label={s.filters.owner} value={owner} onChange={(e) => { setOwner(e.target.value); reset(); }}><option value="">{s.filters.allOwners}</option>{team.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
      </div>

      {query.isPending ? <Spinner label={s.loading} /> : query.isError ? <div className="p-5"><ErrorNote error={query.error} onRetry={() => void query.refetch()} /></div> : visible.length === 0 ? <div className="px-4 py-12"><EmptyState title={filtering ? s.noneMatch : s.none}>
        {filtering ? <button type="button" onClick={() => { setSearch(''); setStatus(''); setBuyer(''); setProduct(''); setOwner(''); setDueOnly(false); setOpenOnly(false); }} className="mt-2 font-semibold text-crm-blue underline">{s.clear}</button> : <Link to="/inquiries/new" className="mt-2 font-semibold text-crm-blue underline">{s.addFirst}</Link>}</EmptyState></div> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[1400px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50/95"><tr className="border-b border-slate-200">
            <th className="px-4 py-3">{sortButton('code', s.cols.code)}</th><th className="px-3 py-3">{sortButton('date', s.cols.date)}</th><th className="px-3 py-3">{sortButton('buyer', s.cols.buyer)}</th><th className="px-3 py-3">{sortButton('product', s.cols.product)}</th>
            <th className="px-3 py-3">{s.cols.grade}</th><th className="px-3 py-3 text-right">{s.cols.quantity}</th><th className="px-3 py-3">{sortButton('destination', s.cols.destination)}</th><th className="px-3 py-3">{s.cols.terms}</th>
            <th className="px-3 py-3">{sortButton('source', s.cols.source)}</th><th className="px-3 py-3">{sortButton('status', s.cols.status)}</th><th className="px-3 py-3">{sortButton('owner', s.cols.owner)}</th><th className="px-3 py-3">{sortButton('followup', s.cols.followup)}</th><th className="px-3 py-3 text-right">{s.cols.actions}</th>
          </tr></thead>
          <tbody>{visible.map((i) => {
            const first = firstLine(i);
            const more = i.products.length - 1;
            return <tr key={i.id} onClick={() => navigate(`/inquiries/${i.id}`)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/inquiries/${i.id}`); }} className={clsx('cursor-pointer bg-surface transition-colors hover:bg-forest-50 focus-visible:bg-blue-50/80', i.archived && 'opacity-60')}>
              <td className={clsx(CELL, 'whitespace-nowrap pl-4 font-mono text-xs font-semibold text-slate-600')}>{i.inquiry_code}</td>
              <td className={clsx(CELL, 'whitespace-nowrap text-slate-600')}>{date(i.inquiry_date)}</td>
              <td className={clsx(CELL, 'font-semibold text-crm-ink')}>{i.buyer_name}</td>
              <td className={CELL}><div className="font-medium text-slate-700">{first?.product_name ?? '—'}</div>{more > 0 && <div className="text-xs text-slate-500">{s.moreProducts(more)}</div>}</td>
              <td className={clsx(CELL, 'text-slate-600')}>{[first?.grade, first?.purity].filter(Boolean).join(' · ') || '—'}</td>
              <td className={clsx(CELL, 'whitespace-nowrap text-right tabular-nums text-slate-700')}>{first ? `${first.quantity} ${first.unit}` : '—'}</td>
              <td className={clsx(CELL, 'text-slate-600')}>{destination(i) || '—'}</td>
              <td className={clsx(CELL, 'whitespace-nowrap text-slate-600')}>{[i.incoterm, i.currency].filter(Boolean).join(' · ') || '—'}</td>
              <td className={clsx(CELL, 'text-slate-600')}>{sourceLabel(i) || '—'}</td>
              <td className={CELL}><InquiryStatusPill status={i.status} /></td>
              <td className={clsx(CELL, 'text-slate-600')}>{ownerLabel(i)}</td>
              <td className={clsx(CELL, 'whitespace-nowrap', i.next_followup && i.next_followup <= todayIST() && OPEN.includes(i.status) ? 'font-semibold text-danger-ink' : 'text-slate-600')}>{i.next_followup ? date(i.next_followup) : '—'}</td>
              <td className={clsx(CELL, 'text-right')} onClick={(e) => e.stopPropagation()}><div className="inline-flex items-center gap-1">
                <Link to={`/inquiries/${i.id}`} aria-label={`${s.actions.view} ${i.inquiry_code}`} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><ExternalLink className="h-4 w-4" /></Link>
                <Link to={`/inquiries/${i.id}/edit`} aria-label={`${s.actions.edit} ${i.inquiry_code}`} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><Pencil className="h-4 w-4" /></Link>
                <Link to={`/quotes/new?buyer=${i.buyer_id}&inquiry=${i.id}`} aria-label={`${s.actions.quote} ${i.inquiry_code}`} className="tap grid place-items-center rounded-lg text-crm-blue hover:bg-forest-50"><FilePlus2 className="h-4 w-4" /></Link>
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/75 bg-surface px-4 py-3 text-sm text-slate-600">
          <span className="tabular-nums">{sorted.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</span>
          <div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((v) => Math.max(0, v - 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 font-medium disabled:opacity-45"><ChevronLeft className="h-4 w-4" />Previous</button><span className="px-1">Page {page + 1} of {pageCount}</span><button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((v) => Math.min(pageCount - 1, v + 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 font-medium disabled:opacity-45">Next<ChevronRight className="h-4 w-4" /></button></div>
        </div>
      </>}
    </section>
  </div>;
}
