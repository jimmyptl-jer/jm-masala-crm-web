/**
 * Samples list: /samples. One row per sample with the columns Sample ID, Requested, Buyer, Product, Weight, Courier / tracking, Sent,
 * Status, Result, Assigned to, Cost (administrators only) and Actions (view, edit). Filters: search, status, result, buyer, product,
 * owner and archived. API: GET /samples (key ['samples', opts]); the whole list is loaded and the text search, sorting and paging
 * happen in the browser, like the Inquiries page. "New sample" opens /samples/new.
 */
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { SampleResultPill, SampleStatusPill } from '@/components/samples/SamplePills';
import { Button, EmptyState, ErrorNote, PageHeader, Select, Spinner } from '@/components/ui';
import { date } from '@/lib/format';
import { useBuyers, useDebounced, useSamples, useTeam } from '@/lib/hooks';
import { APPROVED_PRODUCT_NAMES } from '@/lib/products';
import { SAMPLE_RESULTS, SAMPLE_STATUSES, type Sample } from '@/lib/samples';
import { t } from '@/strings';

const s = t.samples;
const PAGE_SIZE = 10;
const CELL = 'border-t border-slate-200/75 px-3 py-3';

type SortKey = 'code' | 'requested' | 'buyer' | 'product' | 'weight' | 'sent' | 'status' | 'result' | 'owner';

/** One summary tile; a button that shows the samples it counts in the list below. */
function Metric({ label, value, detail, onOpen }: { label: string; value: number | string; detail: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-label={`${label}: ${value}. Show them in the list`} className="glass-panel block w-full p-4 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paprika/40"><div className="text-xs font-medium text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums text-crm-ink">{value}</div><div className="mt-0.5 text-xs text-slate-500">{detail}</div></button>;
}

export default function Samples() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [buyer, setBuyer] = useState('');
  const [product, setProduct] = useState('');
  const [owner, setOwner] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'requested', desc: true });
  const [page, setPage] = useState(0);
  const delayed = useDebounced(search.trim(), 250);
  const query = useSamples({ archived: showArchived ? 'all' : 'false' });
  const buyersQuery = useBuyers({ archived: 'false' });
  const team = useTeam();
  const all = query.data ?? [];
  const reset = () => setPage(0);

  const filtered = useMemo(() => all.filter((x) => {
    const q = delayed.toLowerCase();
    const text = [x.sample_code, x.buyer_name, x.product_name, x.courier, x.tracking_no].filter(Boolean).join(' ').toLowerCase();
    return (!q || text.includes(q)) && (!status || x.status === status) && (!result || x.result === result) && (!buyer || x.buyer_id === buyer) && (!product || x.product_name === product) && (!owner || x.assigned_to === owner);
  }), [all, delayed, status, result, buyer, product, owner]);

  const ownerLabel = (x: Sample) => team.find((p) => p.id === x.assigned_to)?.full_name ?? s.unassigned;
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const val = (x: Sample): string => sort.key === 'code' ? x.sample_code : sort.key === 'requested' ? x.requested_at : sort.key === 'buyer' ? x.buyer_name : sort.key === 'product' ? x.product_name : sort.key === 'weight' ? String(x.weight_g).padStart(8, '0') : sort.key === 'sent' ? x.sent_at ?? '' : sort.key === 'status' ? s.status[x.status] : sort.key === 'result' ? s.result[x.result] : ownerLabel(x);
    return (sort.desc ? -1 : 1) * val(a).localeCompare(val(b), undefined, { sensitivity: 'base' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, sort, team]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const filtering = !!(search || status || result || buyer || product || owner);
  const count = (pick: (x: Sample) => boolean) => all.filter((x) => !x.archived && pick(x)).length;

  /** A tile was clicked: show exactly those samples (no other filter), then scroll to the list. */
  const show = (next: { status?: string; result?: string }) => {
    setSearch(''); setBuyer(''); setProduct(''); setOwner(''); setStatus(next.status ?? ''); setResult(next.result ?? ''); setPage(0);
    window.setTimeout(() => document.getElementById('samples-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const toggleSort = (key: SortKey) => { reset(); setSort((c) => (c.key === key ? { key, desc: !c.desc } : { key, desc: false })); };
  const sortButton = (key: SortKey, label: string) => <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-crm-ink">{label}{sort.key === key && (sort.desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />)}</button>;
  const pending = query.isPending;

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <PageHeader title={s.title} subtitle={s.subtitle} actions={<Button onClick={() => navigate('/samples/new')}><Plus className="h-5 w-5" />{s.add}</Button>} />
      <label className="relative mb-3 block min-w-0 xl:w-[420px]"><span className="sr-only">{s.search}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3 text-sm text-crm-ink shadow-sm placeholder:text-slate-500 focus:border-blue-300 focus:bg-white" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder={s.search} type="search" /></label>
    </div>

    <section aria-label="Sample metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={s.metricRequested} value={pending ? '—' : count((x) => x.status === 'requested')} detail={s.metricRequestedSub} onOpen={() => show({ status: 'requested' })} />
      <Metric label={s.metricDispatched} value={pending ? '—' : count((x) => x.status === 'dispatched')} detail={s.metricDispatchedSub} onOpen={() => show({ status: 'dispatched' })} />
      <Metric label={s.metricApproved} value={pending ? '—' : count((x) => x.result === 'approved')} detail={s.metricApprovedSub} onOpen={() => show({ result: 'approved' })} />
      <Metric label={s.metricRejected} value={pending ? '—' : count((x) => x.result === 'rejected')} detail={s.metricRejectedSub} onOpen={() => show({ result: 'rejected' })} />
    </section>

    <section className="glass-panel overflow-hidden" aria-labelledby="samples-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div><h2 id="samples-heading" className="text-lg font-bold tracking-tight text-crm-ink">{s.directory}</h2><p className="text-sm text-slate-500">{pending ? s.loading : s.match(filtered.length)}</p></div>
        <button type="button" onClick={() => { setShowArchived((v) => !v); reset(); }} aria-pressed={showArchived} className={clsx('tap inline-flex items-center gap-2 rounded-xl border px-3 text-sm font-semibold', showArchived ? 'border-line-strong bg-surface-muted text-ink' : 'border-line-strong bg-surface text-slate-600 hover:bg-white')}>{s.archivedToggle}</button>
      </div>
      <div className="grid gap-3 border-b border-slate-200/70 bg-surface p-4 sm:grid-cols-2 xl:grid-cols-5">
        <Select label={s.filters.status} value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}><option value="">{s.filters.allStatuses}</option>{SAMPLE_STATUSES.map((x) => <option key={x} value={x}>{s.status[x]}</option>)}</Select>
        <Select label={s.filters.result} value={result} onChange={(e) => { setResult(e.target.value); reset(); }}><option value="">{s.filters.allResults}</option>{SAMPLE_RESULTS.map((x) => <option key={x} value={x}>{s.result[x]}</option>)}</Select>
        <Select label={s.filters.buyer} value={buyer} onChange={(e) => { setBuyer(e.target.value); reset(); }}><option value="">{s.filters.allBuyers}</option>{(buyersQuery.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.company_name}</option>)}</Select>
        <Select label={s.filters.product} value={product} onChange={(e) => { setProduct(e.target.value); reset(); }}><option value="">{s.filters.allProducts}</option>{APPROVED_PRODUCT_NAMES.map((n) => <option key={n}>{n}</option>)}</Select>
        <Select label={s.filters.owner} value={owner} onChange={(e) => { setOwner(e.target.value); reset(); }}><option value="">{s.filters.allOwners}</option>{team.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
      </div>

      {pending ? <Spinner label={s.loading} /> : query.isError ? <div className="p-5"><ErrorNote error={query.error} onRetry={() => void query.refetch()} /></div> : visible.length === 0 ? <div className="px-4 py-12"><EmptyState title={filtering ? s.noneMatch : s.none}>
        {filtering ? <button type="button" onClick={() => { setSearch(''); setStatus(''); setResult(''); setBuyer(''); setProduct(''); setOwner(''); }} className="mt-2 font-semibold text-crm-blue underline">{s.clear}</button> : <Link to="/samples/new" className="mt-2 font-semibold text-crm-blue underline">{s.addFirst}</Link>}</EmptyState></div> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[1200px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50/95"><tr className="border-b border-slate-200">
            <th className="px-4 py-3">{sortButton('code', s.cols.code)}</th><th className="px-3 py-3">{sortButton('requested', s.cols.requested)}</th><th className="px-3 py-3">{sortButton('buyer', s.cols.buyer)}</th><th className="px-3 py-3">{sortButton('product', s.cols.product)}</th>
            <th className="px-3 py-3 text-right">{sortButton('weight', s.cols.weight)}</th><th className="px-3 py-3">{s.cols.courier}</th><th className="px-3 py-3">{sortButton('sent', s.cols.sent)}</th>
            <th className="px-3 py-3">{sortButton('status', s.cols.status)}</th><th className="px-3 py-3">{sortButton('result', s.cols.result)}</th><th className="px-3 py-3">{sortButton('owner', s.cols.owner)}</th>
            {isAdmin && <th className="px-3 py-3 text-right">{s.cols.cost}</th>}<th className="px-3 py-3 text-right">{s.cols.actions}</th>
          </tr></thead>
          <tbody>{visible.map((x) => <tr key={x.id} onClick={() => navigate(`/samples/${x.id}`)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/samples/${x.id}`); }} className={clsx('cursor-pointer bg-surface transition-colors hover:bg-forest-50 focus-visible:bg-blue-50/80', x.archived && 'opacity-60')}>
            <td className={clsx(CELL, 'whitespace-nowrap pl-4 font-mono text-xs font-semibold text-slate-600')}>{x.sample_code}</td>
            <td className={clsx(CELL, 'whitespace-nowrap text-slate-600')}>{date(x.requested_at)}</td>
            <td className={clsx(CELL, 'font-semibold text-crm-ink')}>{x.buyer_name}</td>
            <td className={CELL}><div className="font-medium text-slate-700">{x.product_name}</div>{x.grade && <div className="text-xs text-slate-500">{x.grade}</div>}</td>
            <td className={clsx(CELL, 'whitespace-nowrap text-right tabular-nums text-slate-700')}>{s.grams(x.weight_g)}</td>
            <td className={CELL}><div className="text-slate-700">{x.courier || '—'}</div>{x.tracking_no && <div className="font-mono text-xs text-slate-500">{x.tracking_no}</div>}</td>
            <td className={clsx(CELL, 'whitespace-nowrap text-slate-600')}>{x.sent_at ? date(x.sent_at) : '—'}</td>
            <td className={CELL}><SampleStatusPill status={x.status} /></td>
            <td className={CELL}><SampleResultPill result={x.result} /></td>
            <td className={clsx(CELL, 'text-slate-600')}>{ownerLabel(x)}</td>
            {isAdmin && <td className={clsx(CELL, 'whitespace-nowrap text-right tabular-nums text-slate-700')}>{x.cost_inr ? `₹${Number(x.cost_inr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}</td>}
            <td className={clsx(CELL, 'text-right')} onClick={(e) => e.stopPropagation()}><div className="inline-flex items-center gap-1">
              <Link to={`/samples/${x.id}`} aria-label={`${s.actions.view} ${x.sample_code}`} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><ExternalLink className="h-4 w-4" /></Link>
              <Link to={`/samples/${x.id}/edit`} aria-label={`${s.actions.edit} ${x.sample_code}`} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><Pencil className="h-4 w-4" /></Link>
            </div></td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/75 bg-surface px-4 py-3 text-sm text-slate-600">
          <span className="tabular-nums">{sorted.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</span>
          <div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((v) => Math.max(0, v - 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 font-medium disabled:opacity-45"><ChevronLeft className="h-4 w-4" />Previous</button><span className="px-1">Page {page + 1} of {pageCount}</span><button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((v) => Math.min(pageCount - 1, v + 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 font-medium disabled:opacity-45">Next<ChevronRight className="h-4 w-4" /></button></div>
        </div>
      </>}
    </section>
  </div>;
}
