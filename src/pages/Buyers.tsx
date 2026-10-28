import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowDown, ArrowUp, Bell, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, ExternalLink, Filter, List, Columns3, Mail, MapPin, MoreHorizontal, Phone, Plus, Search, Users, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BuyerForm } from '@/components/BuyerForm';
import { StagePill } from '@/components/buyers/StagePill';
import { BuyerBoard } from '@/components/buyers/BuyerBoard';
import { Button, EmptyState, ErrorNote, PageHeader, Select, Sheet, Spinner, StatusBadge, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useBuyerSummary, useBuyers, useDebounced, useTeam } from '@/lib/hooks';
import { date, dateTime, todayIST } from '@/lib/format';
import { APPROVED_PRODUCT_NAMES, isApprovedProduct } from '@/lib/products';
import type { Buyer, BuyerDetail, BuyerSummary, QuoteList } from '@/lib/types';
import { STAGES } from '@/lib/crm';
import { t } from '@/strings';
import { useAuth } from '@/auth/AuthProvider';

type SortKey = 'company' | 'country' | 'products' | 'stage' | 'contact' | 'followup';
type DetailTab = 'Overview' | 'Contacts' | 'Requirements' | 'Quotations' | 'Activity';
const PAGE_SIZE = 10;
const stages = t.crm.stages;
const ownerLabel = (buyer: Buyer, team: { id: string; full_name: string }[]) => team.find((person) => person.id === buyer.assigned_to)?.full_name ?? 'Unassigned';

function Metric({ icon, label, value, detail, tint }: { icon: React.ReactNode; label: string; value: number | string; detail: string; tint: string }) {
  return <div className="glass-panel flex min-h-[104px] items-center gap-3 p-4">
    <span className={clsx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl [&>svg]:h-5 [&>svg]:w-5', tint)}>{icon}</span>
    <div className="min-w-0"><div className="text-sm font-medium text-slate-600">{label}</div><div className="mt-1 text-2xl font-bold leading-none tracking-tight text-crm-ink tabular-nums">{value}</div><div className="mt-1 truncate text-xs text-slate-500">{detail}</div></div>
  </div>;
}

function FollowupPill({ value }: { value?: string | null }) {
  if (!value) return <span className="text-slate-400">No follow-up</span>;
  const today = todayIST();
  const overdue = value < today;
  const due = value === today;
  return <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', overdue ? 'bg-rose-50 text-rose-800' : due ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700')}>
    {overdue || due ? <CircleAlert className="h-3.5 w-3.5" aria-hidden /> : <Clock3 className="h-3.5 w-3.5" aria-hidden />}{overdue ? 'Overdue · ' : due ? 'Today · ' : ''}{date(value)}
  </span>;
}

function BuyerDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (buyer: Buyer) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<DetailTab>('Overview');
  const query = useQuery({ queryKey: ['buyer', id], queryFn: () => api.get<BuyerDetail>(`/buyers/${id}`), enabled: !!id });
  const buyer = query.data;
  const done = useMutation({
    mutationFn: () => api.patch<Buyer>(`/buyers/${id}`, { next_followup: null, next_action: null }),
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['buyer', id] }), qc.invalidateQueries({ queryKey: ['buyers'] }), qc.invalidateQueries({ queryKey: ['buyers', 'summary'] })]); toast('Follow-up marked as done'); },
    onError: (error) => toast(error instanceof Error ? error.message : 'Could not update follow-up', 'error'),
  });
  const tabs: DetailTab[] = ['Overview', 'Contacts', 'Requirements', 'Quotations', 'Activity'];
  useEffect(() => {
    if (!id) return undefined;
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [id, onClose]);
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={buyer?.company_name ?? 'Buyer details'}>
    <button type="button" aria-label="Close buyer details" onClick={onClose} className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]" />
    <aside className="glass-panel-strong absolute inset-y-0 right-0 flex w-full max-w-[620px] flex-col overflow-hidden rounded-none border-l border-white/80 shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-5 sm:px-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-bold tracking-tight text-crm-ink sm:text-2xl">{buyer?.company_name ?? 'Buyer details'}</h2>{buyer && <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', buyer.archived ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800')}>{buyer.archived ? 'Archived' : 'Active'}</span>}</div>
          {buyer && <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" />{[buyer.city, buyer.country || buyer.state].filter(Boolean).join(', ') || 'Location not set'} <span className="mx-1 text-slate-300">·</span>{buyer.business_type ?? (buyer.type === 'export' ? 'Export buyer' : 'Domestic buyer')}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="tap -mr-2 grid place-items-center rounded-xl text-slate-600 hover:bg-white/70"><X className="h-5 w-5" /></button>
      </div>
      {buyer && <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3 sm:px-7">
        <div className="flex min-w-0 gap-2 overflow-x-auto" role="tablist" aria-label="Buyer details sections">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={clsx('tap whitespace-nowrap rounded-lg px-3 text-sm font-semibold', tab === item ? 'bg-crm-blue text-white' : 'text-slate-600 hover:bg-white/75')}>{item}</button>)}</div>
        <button type="button" onClick={() => onEdit(buyer)} className="tap ml-2 rounded-lg border border-slate-200 bg-white/70 px-3 text-sm font-semibold text-crm-ink hover:bg-white">Edit</button>
      </div>}
      <div className="flex-1 overflow-y-auto p-5 sm:p-7">
        {query.isPending ? <Spinner label="Loading buyer" /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : buyer ? <>
          {tab === 'Overview' && <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/90 bg-white/75 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quotations sent</div><div className="mt-1 text-2xl font-bold text-crm-ink">{buyer.performance.quotes_issued}</div></div><div className="rounded-2xl border border-white/90 bg-white/75 p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Won deals</div><div className="mt-1 text-2xl font-bold text-emerald-800">{buyer.performance.won}</div></div></div>
            <section className="rounded-2xl border border-white/90 bg-white/65 p-4"><h3 className="font-semibold text-crm-ink">Buyer information</h3><dl className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2"><Fact label="Contact person" value={buyer.contact_name} /><Fact label="Designation" value={buyer.designation} /><Fact label="Email" value={buyer.email} /><Fact label="Phone" value={buyer.phone} /><Fact label="Address" value={[buyer.address, buyer.city, buyer.country || buyer.state].filter(Boolean).join(', ')} /><Fact label="Buyer type" value={buyer.business_type ?? (buyer.type === 'export' ? 'Export buyer' : 'Domestic buyer')} /><Fact label="First inquiry" value={buyer.first_inquiry_date ? date(buyer.first_inquiry_date) : null} /><Fact label="Owner" value={buyer.assigned_name} /></dl></section>
            <section className="rounded-2xl border border-white/90 bg-white/65 p-4"><h3 className="font-semibold text-crm-ink">Product interests</h3><Tags products={buyer.interested_products} /></section>
            <section className="rounded-2xl border border-blue-100 bg-blue-50/65 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-crm-ink">Next follow-up</h3><p className="mt-1 text-sm text-slate-600">{buyer.next_action || 'No next action recorded'}</p><div className="mt-3"><FollowupPill value={buyer.next_followup} /></div></div>{buyer.next_followup && <Button variant="secondary" loading={done.isPending} onClick={() => done.mutate()}><Check className="h-4 w-4" />Mark as done</Button>}</div></section>
            {buyer.notes && <section className="rounded-2xl border border-white/90 bg-white/65 p-4"><h3 className="font-semibold text-crm-ink">Notes</h3><p className="mt-2 whitespace-pre-line text-sm text-slate-600">{buyer.notes}</p></section>}
          </div>}
          {tab === 'Contacts' && <section className="rounded-2xl border border-white/90 bg-white/70 p-5"><h3 className="font-semibold text-crm-ink">Primary contact</h3><p className="mt-1 text-sm text-slate-500">The current buyer record supports one primary contact.</p><dl className="mt-5 grid gap-4 sm:grid-cols-2"><Fact label="Name" value={buyer.contact_name} /><Fact label="Designation" value={buyer.designation} /><Fact label="Email" value={buyer.email} /><Fact label="Phone" value={buyer.phone} /><Fact label="WhatsApp" value={buyer.whatsapp} /></dl></section>}
          {tab === 'Requirements' && <div className="space-y-4"><section className="rounded-2xl border border-white/90 bg-white/70 p-5"><h3 className="font-semibold text-crm-ink">Interested products</h3><Tags products={buyer.interested_products} /></section><section className="rounded-2xl border border-white/90 bg-white/70 p-5"><h3 className="font-semibold text-crm-ink">Buying requirements</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{buyer.requirements || 'No requirements recorded yet.'}</p></section></div>}
          {tab === 'Quotations' && (buyer.quotes.length ? <ul className="divide-y divide-slate-200 rounded-2xl border border-white/90 bg-white/70">{buyer.quotes.map((quote) => <li key={quote.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><Link to={`/quotes/${quote.id}`} className="font-semibold text-blue-800 hover:underline">{quote.quote_no ?? 'Draft'}</Link><p className="mt-1 truncate text-xs text-slate-500">{quote.products || 'No products listed'} · {date(quote.activity_at)}</p></div><StatusBadge status={quote.status} /></li>)}</ul> : <div className="rounded-2xl border border-white/90 bg-white/70 p-5"><EmptyState title="No quotations yet" /></div>)}
          {tab === 'Activity' && (buyer.activities.length ? <ol className="space-y-3">{buyer.activities.map((activity) => <li key={activity.id} className="rounded-2xl border border-white/90 bg-white/70 p-4"><div className="flex justify-between gap-3"><span className="font-semibold capitalize text-crm-ink">{activity.kind.replace('_', ' ')}</span><time className="text-xs text-slate-500">{dateTime(activity.happened_at)}</time></div>{activity.body && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{activity.body}</p>}{activity.quote_no && <p className="mt-2 text-xs text-slate-500">Quotation {activity.quote_no}{activity.user_name ? ` · ${activity.user_name}` : ''}</p>}</li>)}</ol> : <div className="rounded-2xl border border-white/90 bg-white/70 p-5"><EmptyState title="No activity recorded" /></div>)}
        </> : null}
      </div>
      {buyer && <div className="flex flex-wrap gap-2 border-t border-slate-200/70 p-4 sm:px-7"><Link to={`/quotes/new?buyer=${buyer.id}`} className="tap inline-flex items-center justify-center gap-2 rounded-xl bg-crm-blue px-4 text-sm font-semibold text-white hover:bg-blue-900"><Plus className="h-4 w-4" />Create quotation</Link><a href={buyer.email ? `mailto:${buyer.email}` : undefined} aria-disabled={!buyer.email} className={clsx('tap inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold', buyer.email ? 'bg-white/75 text-crm-ink hover:bg-white' : 'pointer-events-none text-slate-400')}><Mail className="h-4 w-4" />Email</a><a href={buyer.phone ? `tel:${buyer.phone.replace(/[^\d+]/g, '')}` : undefined} aria-disabled={!buyer.phone} className={clsx('tap inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold', buyer.phone ? 'bg-white/75 text-crm-ink hover:bg-white' : 'pointer-events-none text-slate-400')}><Phone className="h-4 w-4" />Call</a></div>}
    </aside>
  </div>;
}

function Fact({ label, value }: { label: string; value?: string | null }) { return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{value || 'Not provided'}</dd></div>; }
function Tags({ products }: { products: string[] }) { const safe = products.filter((item) => isApprovedProduct(item.split(' (')[0] ?? item)); return safe.length ? <div className="mt-3 flex flex-wrap gap-2">{safe.map((item) => <span key={item} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">{item}</span>)}</div> : <p className="mt-2 text-sm text-slate-500">No product interests recorded.</p>; }

export default function Buyers({ initialView = 'table' }: { initialView?: 'board' | 'table' }) {
  const [view, setView] = useState<'board' | 'table'>(initialView);
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [stage, setStage] = useState('');
  const [product, setProduct] = useState('');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [type, setType] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'company', desc: false });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Buyer | null>(null);
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const { me } = useAuth();
  const delayedSearch = useDebounced(search.trim(), 250);
  const buyersQuery = useBuyers({ archived: status === 'all' ? 'all' : status === 'archived' ? 'true' : 'false' });
  const activeBuyersQuery = useBuyers({ archived: 'false' });
  const summaryQuery = useBuyerSummary();
  const quotesQuery = useQuery({ queryKey: ['buyers', 'kpi-quotes'], queryFn: () => api.get<QuoteList>('/quotes?limit=1000') });
  const team = useTeam();
  const buyers = buyersQuery.data ?? [];
  const activeBuyers = activeBuyersQuery.data ?? [];
  const countries = useMemo(() => [...new Set((status === 'archived' ? buyers : activeBuyers).map((item) => item.country).filter((value): value is string => !!value))].sort(), [buyers, activeBuyers, status]);
  const filtered = useMemo(() => buyers.filter((buyer) => {
    const q = delayedSearch.toLowerCase();
    const searchable = [buyer.company_name, buyer.contact_name, buyer.email, buyer.country, buyer.city, ...buyer.interested_products].filter(Boolean).join(' ').toLowerCase();
    return (!q || searchable.includes(q)) && (!country || buyer.country === country) && (!stage || buyer.stage === stage) && (!product || buyer.interested_products.some((p) => p.toLowerCase().includes(product.toLowerCase()))) && (!owner || buyer.assigned_to === owner) && (!type || buyer.type === type) && (!dueOnly || (!!buyer.next_followup && buyer.next_followup <= todayIST()));
  }), [buyers, delayedSearch, country, stage, product, owner, type, dueOnly]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const val = (item: Buyer): string => sort.key === 'company' ? item.company_name : sort.key === 'country' ? item.country ?? '' : sort.key === 'products' ? item.interested_products.join(', ') : sort.key === 'stage' ? stages[item.stage] : sort.key === 'contact' ? item.last_contact_at ?? '' : item.next_followup ?? '';
    const cmp = val(a).localeCompare(val(b), undefined, { sensitivity: 'base' });
    return (sort.desc ? -1 : 1) * cmp;
  }), [filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const summary: BuyerSummary | undefined = summaryQuery.data;
  const quotes = quotesQuery.data?.data ?? [];
  const activeCountries = new Set(activeBuyers.filter((b) => b.country).map((b) => b.country)).size;
  const allCurrentSelected = visible.length > 0 && visible.every((b) => selected.has(b.id));
  const toggleSort = (key: SortKey) => { setPage(0); setSort((current) => current.key === key ? { key, desc: !current.desc } : { key, desc: false }); };
  const sortButton = (key: SortKey, label: string) => <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-crm-ink">{label}{sort.key === key && (sort.desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />)}</button>;
  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const range = <span className="tabular-nums">{sorted.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</span>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <PageHeader title="Buyers" subtitle="Manage international buyers, contacts, requirements and sales activity." actions={<><Link to="/follow-ups" aria-label={`Follow-ups${summary?.totals.followups_due ? `, ${summary.totals.followups_due} due` : ''}`} className="tap relative grid place-items-center rounded-xl border border-white/90 bg-white/70 px-3 text-slate-700 shadow-sm hover:bg-white"><Bell className="h-5 w-5" />{!!summary?.totals.followups_due && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}</Link><div className="hidden items-center gap-2 rounded-xl border border-white/80 bg-white/55 px-3 py-1.5 sm:flex"><span className="grid h-8 w-8 place-items-center rounded-full bg-crm-navy text-xs font-bold text-white">{(me?.full_name ?? 'JM').slice(0, 2).toUpperCase()}</span><span className="max-w-28 truncate text-sm font-semibold text-crm-ink">{me?.full_name ?? 'JM Masala'}</span></div><Button onClick={() => setAdding(true)}><Plus className="h-5 w-5" />Add Buyer</Button></>} />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row xl:min-w-[480px] xl:justify-end">
        <label className="relative block min-w-0 flex-1"><span className="sr-only">Search buyers by company, country or product</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input className="h-11 w-full rounded-xl border border-white/90 bg-white/70 pl-10 pr-3 text-sm text-crm-ink shadow-sm backdrop-blur-xl placeholder:text-slate-500 focus:border-blue-300 focus:bg-white" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search buyers, countries, products…" type="search" /></label>
        <label className="sr-only" htmlFor="buyers-country-top">Country filter</label><select id="buyers-country-top" className="h-11 min-w-40 rounded-xl border border-white/90 bg-white/75 px-3 text-sm text-crm-ink shadow-sm focus:bg-white" value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }}><option value="">All countries</option>{countries.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
    </div>

    <section aria-label="Buyer metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Users />} label="Total Buyers" value={activeBuyersQuery.isPending ? '—' : activeBuyers.length} detail="Active buyer records" tint="bg-sky-100 text-sky-700" />
      <Metric icon={<MapPin />} label="Active Countries" value={activeBuyersQuery.isPending ? '—' : activeCountries} detail="Countries with active buyers" tint="bg-emerald-100 text-emerald-700" />
      <Metric icon={<Building2 />} label="Quotations Sent" value={quotesQuery.data ? quotes.filter((q) => q.status === 'sent').length : (summary?.totals.open_quotations ?? '—')} detail={quotesQuery.data ? 'Awaiting a buyer response' : 'Open quotations'} tint="bg-amber-100 text-amber-700" />
      <Metric icon={<Check />} label="Won Deals" value={quotesQuery.data ? quotes.filter((q) => q.status === 'won').length : (summary?.totals.customers ?? '—')} detail="Won quotations" tint="bg-violet-100 text-violet-700" />
    </section>

    <section className="glass-panel overflow-hidden" aria-labelledby="buyers-table-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/90 px-4 py-4 sm:px-5">
        <div><h2 id="buyers-table-heading" className="text-lg font-bold tracking-tight text-crm-ink">Buyer directory</h2><p className="text-sm text-slate-500">{buyersQuery.isPending ? 'Loading buyer records' : `${filtered.length} buyer${filtered.length === 1 ? '' : 's'} match your view`}</p></div>
        <div className="flex items-center gap-2"><div role="group" aria-label="Buyer view" className="inline-flex rounded-xl border border-slate-200 bg-white/65 p-1"><button type="button" aria-pressed={view === 'board'} onClick={() => setView('board')} className={clsx('tap inline-flex items-center gap-1.5 rounded-lg px-2 text-sm font-semibold', view === 'board' ? 'bg-crm-blue text-white' : 'text-slate-600')}><Columns3 className="h-4 w-4" />Board</button><button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} className={clsx('tap inline-flex items-center gap-1.5 rounded-lg px-2 text-sm font-semibold', view === 'table' ? 'bg-crm-blue text-white' : 'text-slate-600')}><List className="h-4 w-4" />Table</button></div><button type="button" onClick={() => setDueOnly((value) => !value)} aria-pressed={dueOnly} className={clsx('tap inline-flex items-center gap-2 rounded-xl border px-3 text-sm font-semibold', dueOnly ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-white')}><Filter className="h-4 w-4" />Due follow-ups</button><button type="button" onClick={() => setStatus((current) => current === 'active' ? 'all' : 'active')} className="tap inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 text-sm font-semibold text-slate-700 hover:bg-white"><Archive className="h-4 w-4" />{status === 'active' ? 'Active' : 'All statuses'}<ChevronDown className="h-4 w-4" /></button></div>
      </div>
      <div className="grid gap-3 border-b border-slate-200/70 bg-white/25 p-4 sm:grid-cols-2 xl:grid-cols-6">
        <Select label="Country" value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }}><option value="">All countries</option>{countries.map((item) => <option key={item}>{item}</option>)}</Select>
        <Select label="Stage" value={stage} onChange={(e) => { setStage(e.target.value); setPage(0); }}><option value="">All stages</option>{STAGES.map((item) => <option key={item} value={item}>{stages[item]}</option>)}</Select>
        <Select label="Product interest" value={product} onChange={(e) => { setProduct(e.target.value); setPage(0); }}><option value="">All products</option>{APPROVED_PRODUCT_NAMES.map((item) => <option key={item}>{item}</option>)}</Select>
        <Select label="Owner" value={owner} onChange={(e) => { setOwner(e.target.value); setPage(0); }}><option value="">All owners</option>{team.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</Select>
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All statuses</option></Select>
        <Select label="Buyer type" value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}><option value="">All types</option><option value="export">Export</option><option value="domestic">Domestic</option></Select>
      </div>
      {selected.size > 0 && <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-2 text-sm"><span className="font-medium text-blue-950">{selected.size} selected</span><div className="flex gap-2"><button type="button" onClick={() => { const first = visible.find((b) => selected.has(b.id)); if (first) setDetailId(first.id); }} className="tap rounded-lg px-3 font-semibold text-blue-800 hover:bg-white/75">View selected</button><button type="button" onClick={() => setSelected(new Set())} className="tap rounded-lg px-3 text-slate-600 hover:bg-white/75">Clear selection</button></div></div>}
      {buyersQuery.isPending ? <Spinner label="Loading buyers" /> : buyersQuery.isError ? <div className="p-5"><ErrorNote error={buyersQuery.error} onRetry={() => void buyersQuery.refetch()} /></div> : visible.length === 0 ? <div className="px-4 py-12"><EmptyState title={search || country || stage || product || owner || type || dueOnly ? 'No buyers match these filters' : 'No buyers yet'}>{search || country || stage || product || owner || type || dueOnly ? <button type="button" onClick={() => { setSearch(''); setCountry(''); setStage(''); setProduct(''); setOwner(''); setType(''); setDueOnly(false); }} className="mt-2 font-semibold text-blue-700 underline">Clear filters</button> : <button type="button" onClick={() => setAdding(true)} className="mt-2 font-semibold text-blue-700 underline">Add your first buyer</button>}</EmptyState></div> : view === 'board' ? <div className="p-4"><BuyerBoard buyers={sorted} /></div> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50/95"><tr className="border-b border-slate-200">
            <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select buyers on this page" checked={allCurrentSelected} onChange={(e) => setSelected((current) => { const next = new Set(current); visible.forEach((b) => e.target.checked ? next.add(b.id) : next.delete(b.id)); return next; })} className="h-4 w-4 rounded accent-blue-700" /></th>
            <th className="px-3 py-3">{sortButton('company', 'Company')}</th><th className="px-3 py-3">{sortButton('country', 'Country')}</th><th className="px-3 py-3">{sortButton('products', 'Main products')}</th><th className="px-3 py-3">{sortButton('stage', 'Stage')}</th><th className="px-3 py-3">{sortButton('contact', 'Last contact')}</th><th className="px-3 py-3">{sortButton('followup', 'Next follow-up')}</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody>{visible.map((buyer) => <tr key={buyer.id} onClick={() => setDetailId(buyer.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(buyer.id); } }} tabIndex={0} className="cursor-pointer bg-white/75 transition-colors hover:bg-blue-50/70 focus-visible:bg-blue-50/80">
            <td className="border-t border-slate-200/75 px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${buyer.company_name}`} checked={selected.has(buyer.id)} onChange={() => toggleSelected(buyer.id)} className="h-4 w-4 rounded accent-blue-700" /></td>
            <td className="border-t border-slate-200/75 px-3 py-3"><div className="font-semibold text-crm-ink">{buyer.company_name}</div><div className="mt-0.5 text-xs text-slate-500">{buyer.contact_name || 'Contact not set'}{buyer.email && <span> · {buyer.email}</span>}</div></td>
            <td className="border-t border-slate-200/75 px-3 py-3"><div className="font-medium text-slate-700">{buyer.country || 'India'}</div><div className="text-xs text-slate-500">{buyer.city || buyer.state || '—'}</div></td>
            <td className="border-t border-slate-200/75 px-3 py-3"><Tags products={buyer.interested_products} /></td>
            <td className="border-t border-slate-200/75 px-3 py-3"><StagePill stage={buyer.stage} /></td>
            <td className="border-t border-slate-200/75 px-3 py-3 text-slate-600">{buyer.last_contact_at ? date(buyer.last_contact_at) : 'No contact yet'}</td>
            <td className="border-t border-slate-200/75 px-3 py-3"><FollowupPill value={buyer.next_followup} /></td>
            <td className="border-t border-slate-200/75 px-3 py-3 text-slate-600">{ownerLabel(buyer, team)}</td>
            <td className="border-t border-slate-200/75 px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><div className="inline-flex items-center gap-1"><button type="button" aria-label={`Open ${buyer.company_name}`} onClick={() => setDetailId(buyer.id)} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><ExternalLink className="h-4 w-4" /></button><Link to={`/quotes/new?buyer=${buyer.id}`} aria-label={`Create quotation for ${buyer.company_name}`} className="tap grid place-items-center rounded-lg text-blue-700 hover:bg-blue-50"><Plus className="h-4 w-4" /></Link><button type="button" aria-label={`More actions for ${buyer.company_name}`} onClick={() => setDetailId(buyer.id)} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><MoreHorizontal className="h-4 w-4" /></button></div></td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/75 bg-white/45 px-4 py-3 text-sm text-slate-600"><span>{range}</span><div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 px-3 font-medium disabled:opacity-45"><ChevronLeft className="h-4 w-4" />Previous</button><span className="px-1">Page {page + 1} of {pageCount}</span><button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 px-3 font-medium disabled:opacity-45">Next<ChevronRight className="h-4 w-4" /></button></div></div>
      </>}
    </section>

    {detailId && <BuyerDrawer key={detailId} id={detailId} onClose={() => setDetailId(null)} onEdit={(buyer) => { setEditing(buyer); }} />}
    <Sheet wide open={adding} onClose={() => setAdding(false)} title="Add buyer"><BuyerForm onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); void buyersQuery.refetch(); void activeBuyersQuery.refetch(); void summaryQuery.refetch(); }} /></Sheet>
    <Sheet wide open={!!editing} onClose={() => setEditing(null)} title="Edit buyer"><BuyerForm initial={editing ?? undefined} onCancel={() => setEditing(null)} onSaved={(buyer) => { setEditing(null); setDetailId(buyer.id); void qc.invalidateQueries({ queryKey: ['buyer', buyer.id] }); void buyersQuery.refetch(); void activeBuyersQuery.refetch(); void summaryQuery.refetch(); }} /></Sheet>
  </div>;
}
