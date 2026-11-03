import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowDown, ArrowUp, Building2, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, ExternalLink, Filter, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, Search, Users, X } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BuyerForm } from '@/components/BuyerForm';
import { Button, EmptyState, ErrorNote, PageHeader, Select, Sheet, Spinner, StatusBadge, useDialogFocus, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useBuyerSummary, useBuyers, useDebounced, useTeam } from '@/lib/hooks';
import { date, dateTime, todayIST } from '@/lib/format';
import { APPROVED_PRODUCT_NAMES, isApprovedProduct } from '@/lib/products';
import type { Buyer, BuyerDetail, BuyerSummary, QuoteList } from '@/lib/types';
import { STAGES, STATUS_STYLE, buyerStatus } from '@/lib/crm';
import { t } from '@/strings';

type SortKey = 'code' | 'company' | 'country' | 'type' | 'products' | 'source' | 'stage' | 'owner' | 'contact' | 'followup' | 'quotes';
type DetailTab = 'Overview' | 'Contacts' | 'Requirements' | 'Quotations' | 'Activity';
const PAGE_SIZE = 10;
const stages = t.crm.stages;
const bp = t.buyersPage;
const CELL = 'border-t border-slate-200/75 px-3 py-3';
const sourceLabel = (buyer: Buyer) => buyer.lead_source || (buyer.channel ? t.crm.channels[buyer.channel] : '—');
const ownerLabel = (buyer: Buyer, team: { id: string; full_name: string }[]) => !buyer.assigned_to ? bp.unassigned : team.find((person) => person.id === buyer.assigned_to)?.full_name ?? '—';

/** One summary tile; a button that opens whatever its number is made of (`opens` says what, for screen readers). */
function Metric({ icon, label, value, detail, tint, onOpen, opens }: { icon: React.ReactNode; label: string; value: number | string; detail: string; tint: string; onOpen: () => void; opens: string }) {
  return <button type="button" onClick={onOpen} aria-label={`${label}: ${value}. ${opens}`} className="glass-panel flex min-h-[84px] w-full items-center gap-3 p-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paprika/40 sm:min-h-[104px] sm:p-4">
    <span className={clsx('hidden h-12 w-12 shrink-0 place-items-center rounded-2xl sm:grid [&>svg]:h-5 [&>svg]:w-5', tint)}>{icon}</span>
    <div className="min-w-0"><div className="truncate text-xs font-medium text-slate-600 sm:text-sm">{label}</div><div className="mt-1 text-2xl font-bold leading-none tracking-tight text-crm-ink tabular-nums">{value}</div><div className="mt-1 truncate text-[11px] text-slate-500 sm:text-xs">{detail}</div></div>
  </button>;
}

export function FollowupPill({ value }: { value?: string | null }) {
  if (!value) return <span className="text-fg-muted">{bp.noFollowup}</span>;
  const today = todayIST();
  const overdue = value < today;
  const due = value === today;
  return <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', overdue ? 'bg-rose-50 text-rose-800' : due ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700')}>
    {overdue || due ? <CircleAlert className="h-3.5 w-3.5" aria-hidden /> : <Clock3 className="h-3.5 w-3.5" aria-hidden />}{overdue ? bp.overduePrefix : due ? bp.todayPrefix : ''}{date(value)}
  </span>;
}

export function BuyerDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (buyer: Buyer) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<DetailTab>('Overview');
  const query = useQuery({ queryKey: ['buyer', id], queryFn: () => api.get<BuyerDetail>(`/buyers/${id}`), enabled: !!id });
  const buyer = query.data;
  const done = useMutation({
    mutationFn: () => api.patch<Buyer>(`/buyers/${id}`, { next_followup: null, next_action: null }),
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['buyer', id] }), qc.invalidateQueries({ queryKey: ['buyers'] }), qc.invalidateQueries({ queryKey: ['buyers', 'summary'] })]); toast(bp.followupDone); },
    onError: (error) => toast(error instanceof Error ? error.message : bp.followupFailed, 'error'),
  });
  const panelRef = useRef<HTMLElement>(null);
  useDialogFocus(panelRef, true);
  const tabs: DetailTab[] = ['Overview', 'Contacts', 'Requirements', 'Quotations', 'Activity'];
  useEffect(() => {
    if (!id) return undefined;
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [id, onClose]);
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={buyer?.company_name ?? bp.drawerTitle}>
    <button type="button" aria-label={bp.closeDrawer} onClick={onClose} className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]" />
    <aside ref={panelRef} tabIndex={-1} className="glass-panel-strong focus:outline-none absolute inset-y-0 right-0 flex w-full max-w-[620px] flex-col overflow-hidden rounded-none border-l border-line shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-5 sm:px-7">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-bold tracking-tight text-crm-ink sm:text-2xl">{buyer?.company_name ?? bp.drawerTitle}</h2>{buyer && <span className={clsx('rounded-full px-2.5 py-1 text-xs font-semibold', buyer.archived ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800')}>{buyer.archived ? bp.archived : bp.active}</span>}</div>
          {buyer && <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" />{[buyer.city, buyer.country || buyer.state].filter(Boolean).join(', ') || bp.locationNotSet} <span className="mx-1 text-fg-muted">·</span>{buyer.business_type ?? (buyer.type === 'export' ? bp.exportBuyer : bp.domesticBuyer)}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={bp.close} className="tap -mr-2 grid place-items-center rounded-xl text-slate-600 hover:bg-brand-50"><X className="h-5 w-5" /></button>
      </div>
      {buyer && <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-3 sm:px-7">
        <div className="flex min-w-0 flex-wrap gap-2 md:flex-nowrap md:overflow-x-auto" role="tablist" aria-label={bp.sectionsLabel}>{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={clsx('tap whitespace-nowrap rounded-lg px-3 text-sm font-semibold', tab === item ? 'bg-crm-blue text-white' : 'text-slate-600 hover:bg-brand-50')}>{bp.tabs[item]}</button>)}</div>
        <button type="button" onClick={() => onEdit(buyer)} className="tap ml-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-crm-ink hover:bg-white">{bp.edit}</button>
      </div>}
      <div className="flex-1 overflow-y-auto p-5 sm:p-7">
        {query.isPending ? <Spinner label={bp.loadingBuyer} /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : buyer ? <>
          {tab === 'Overview' && <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-line bg-surface-muted p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{bp.quotationsSent}</div><div className="mt-1 text-2xl font-bold text-crm-ink">{buyer.performance.quotes_issued}</div></div><div className="rounded-2xl border border-line bg-surface-muted p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{bp.wonDealsLabel}</div><div className="mt-1 text-2xl font-bold text-emerald-800">{buyer.performance.won}</div></div></div>
            <section className="rounded-2xl border border-line bg-surface-muted p-4"><h3 className="font-semibold text-crm-ink">{bp.info}</h3><dl className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2"><Fact label={bp.contactPerson} value={buyer.contact_name} /><Fact label={bp.designation} value={buyer.designation} /><Fact label={bp.email} value={buyer.email} /><Fact label={bp.phone} value={buyer.phone} /><Fact label={bp.address} value={[buyer.address, buyer.city, buyer.country || buyer.state].filter(Boolean).join(', ')} /><Fact label={bp.buyerType} value={buyer.business_type ?? (buyer.type === 'export' ? bp.exportBuyer : bp.domesticBuyer)} /><Fact label={bp.firstInquiry} value={buyer.first_inquiry_date ? date(buyer.first_inquiry_date) : null} /><Fact label={bp.owner} value={buyer.assigned_name} /></dl></section>
            <section className="rounded-2xl border border-line bg-surface-muted p-4"><h3 className="font-semibold text-crm-ink">{bp.interests}</h3><Tags products={buyer.interested_products} /></section>
            <section className="rounded-2xl border border-blue-100 bg-blue-50/65 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-crm-ink">{bp.nextFollowup}</h3><p className="mt-1 text-sm text-slate-600">{buyer.next_action || bp.noNextAction}</p><div className="mt-3"><FollowupPill value={buyer.next_followup} /></div></div>{buyer.next_followup && <Button variant="secondary" loading={done.isPending} onClick={() => done.mutate()}><Check className="h-4 w-4" />{bp.markDone}</Button>}</div></section>
            {buyer.notes && <section className="rounded-2xl border border-line bg-surface-muted p-4"><h3 className="font-semibold text-crm-ink">{bp.notes}</h3><p className="mt-2 whitespace-pre-line text-sm text-slate-600">{buyer.notes}</p></section>}
          </div>}
          {tab === 'Contacts' && <section className="rounded-2xl border border-line bg-surface-muted p-5"><h3 className="font-semibold text-crm-ink">{bp.primaryContact}</h3><p className="mt-1 text-sm text-slate-500">{bp.primaryContactHint}</p><dl className="mt-5 grid gap-4 sm:grid-cols-2"><Fact label={bp.name} value={buyer.contact_name} /><Fact label={bp.designation} value={buyer.designation} /><Fact label={bp.email} value={buyer.email} /><Fact label={bp.phone} value={buyer.phone} /><Fact label={bp.whatsapp} value={buyer.whatsapp} /></dl></section>}
          {tab === 'Requirements' && <div className="space-y-4"><section className="rounded-2xl border border-line bg-surface-muted p-5"><h3 className="font-semibold text-crm-ink">{bp.interestedProducts}</h3><Tags products={buyer.interested_products} /></section><section className="rounded-2xl border border-line bg-surface-muted p-5"><h3 className="font-semibold text-crm-ink">{bp.requirements}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{buyer.requirements || bp.noRequirements}</p></section></div>}
          {tab === 'Quotations' && (buyer.quotes.length ? <ul className="divide-y divide-slate-200 rounded-2xl border border-line bg-surface-muted">{buyer.quotes.map((quote) => <li key={quote.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><Link to={`/quotes/${quote.id}`} className="font-semibold text-crm-blue hover:underline">{quote.quote_no ?? bp.draft}</Link><p className="mt-1 truncate text-xs text-slate-500">{quote.products || bp.noProductsListed} · {date(quote.activity_at)}</p></div><StatusBadge status={quote.status} /></li>)}</ul> : <div className="rounded-2xl border border-line bg-surface-muted p-5"><EmptyState title={bp.noQuotes} /></div>)}
          {tab === 'Activity' && (buyer.activities.length ? <ol className="space-y-3">{buyer.activities.map((activity) => <li key={activity.id} className="rounded-2xl border border-line bg-surface-muted p-4"><div className="flex justify-between gap-3"><span className="font-semibold capitalize text-crm-ink">{activity.kind.replace('_', ' ')}</span><time className="text-xs text-slate-500">{dateTime(activity.happened_at)}</time></div>{activity.body && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{activity.body}</p>}{activity.quote_no && <p className="mt-2 text-xs text-slate-500">{bp.quotation(activity.quote_no)}{activity.user_name ? ` · ${activity.user_name}` : ''}</p>}</li>)}</ol> : <div className="rounded-2xl border border-line bg-surface-muted p-5"><EmptyState title={bp.noActivity} /></div>)}
        </> : null}
      </div>
      {buyer && <div className="flex flex-wrap gap-2 border-t border-slate-200/70 p-4 sm:px-7"><Link to={`/quotes/new?buyer=${buyer.id}`} className="tap inline-flex items-center justify-center gap-2 rounded-xl bg-crm-blue px-4 text-sm font-semibold text-white hover:brightness-110"><Plus className="h-4 w-4" />{bp.createQuote}</Link><a href={buyer.email ? `mailto:${buyer.email}` : undefined} aria-disabled={!buyer.email} className={clsx('tap inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold', buyer.email ? 'bg-surface text-crm-ink hover:bg-white' : 'pointer-events-none text-fg-muted')}><Mail className="h-4 w-4" />{bp.emailAction}</a><a href={buyer.phone ? `tel:${buyer.phone.replace(/[^\d+]/g, '')}` : undefined} aria-disabled={!buyer.phone} className={clsx('tap inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold', buyer.phone ? 'bg-surface text-crm-ink hover:bg-white' : 'pointer-events-none text-fg-muted')}><Phone className="h-4 w-4" />{bp.callAction}</a></div>}
    </aside>
  </div>;
}

function Fact({ label, value }: { label: string; value?: string | null }) { return <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{value || bp.notProvided}</dd></div>; }
function Tags({ products }: { products: string[] }) { const safe = products.filter((item) => isApprovedProduct(item)); return safe.length ? <div className="mt-3 flex flex-wrap gap-2">{safe.map((item) => <span key={item} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">{item}</span>)}</div> : <p className="mt-2 text-sm text-slate-500">{bp.noInterests}</p>; }

export default function Buyers() {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [stage, setStage] = useState('');
  const [product, setProduct] = useState('');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState<'active' | 'archived' | 'all'>('active');
  const [type, setType] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); // phones only: the six filters stay folded away until asked for
  const activeFilters = [country, stage, product, owner, type].filter(Boolean).length + (status !== 'active' ? 1 : 0);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'company', desc: false });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const navigate = useNavigate();
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Buyer | null>(null);
  // /buyers?new=1 (the phone "+" menu) opens the Add buyer sheet straight away
  const [navParams, setNavParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  // every visit to /buyers?new=1 opens the sheet, also when already on this page; the flag is removed from the address afterwards so
  // the next "Add buyer" click is a real change again
  useEffect(() => {
    if (navParams.get('new') !== '1') return;
    setAdding(true);
    setNavParams((p) => { const next = new URLSearchParams(p); next.delete('new'); return next; }, { replace: true });
  }, [navParams, setNavParams]);
  const qc = useQueryClient();
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
    const searchable = [buyer.buyer_code, buyer.company_name, buyer.contact_name, buyer.email, buyer.phone, buyer.whatsapp, buyer.country, buyer.city, ...buyer.interested_products].filter(Boolean).join(' ').toLowerCase();
    return (!q || searchable.includes(q)) && (!country || buyer.country === country) && (!stage || buyer.stage === stage) && (!product || buyer.interested_products.some((p) => p.toLowerCase().includes(product.toLowerCase()))) && (!owner || buyer.assigned_to === owner) && (!type || buyer.type === type) && (!dueOnly || (!!buyer.next_followup && buyer.next_followup <= todayIST()));
  }), [buyers, delayedSearch, country, stage, product, owner, type, dueOnly]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const val = (item: Buyer): string => sort.key === 'code' ? item.buyer_code : sort.key === 'type' ? item.business_type ?? '' : sort.key === 'source' ? sourceLabel(item) : sort.key === 'owner' ? ownerLabel(item, team) : sort.key === 'quotes' ? String(item.quote_count).padStart(6, '0') : sort.key === 'company' ? item.company_name : sort.key === 'country' ? item.country ?? '' : sort.key === 'products' ? item.interested_products.join(', ') : sort.key === 'stage' ? t.crm.statuses[buyerStatus(item)] : sort.key === 'contact' ? item.last_contact_at ?? '' : item.next_followup ?? '';
    const cmp = val(a).localeCompare(val(b), undefined, { sensitivity: 'base' });
    return (sort.desc ? -1 : 1) * cmp;
  }), [filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const summary: BuyerSummary | undefined = summaryQuery.data;
  const quotes = quotesQuery.data?.data ?? [];
  const activeCountries = new Set(activeBuyers.filter((b) => b.country).map((b) => b.country)).size;
  const allCurrentSelected = visible.length > 0 && visible.every((b) => selected.has(b.id));
  /** Scrolls to the buyer table after a tile changed what it shows. */
  const toTable = () => window.setTimeout(() => document.getElementById('buyers-table-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  /** "Total Buyers": every active buyer, with no filter. */
  const showAll = () => { setSearch(''); setCountry(''); setStage(''); setProduct(''); setOwner(''); setType(''); setDueOnly(false); setStatus('active'); setPage(0); toTable(); };
  /** Active buyers per country, most buyers first (the "Active Countries" list). */
  const countryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of activeBuyers) if (b.country) m.set(b.country, (m.get(b.country) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [activeBuyers]);
  const pickCountry = (name: string) => { setStatus('active'); setCountry(name); setPage(0); setCountriesOpen(false); toTable(); };
  const toggleSort = (key: SortKey) => { setPage(0); setSort((current) => current.key === key ? { key, desc: !current.desc } : { key, desc: false }); };
  const sortButton = (key: SortKey, label: string) => <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-crm-ink">{label}{sort.key === key && (sort.desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />)}</button>;
  const toggleSelected = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const range = <span className="tabular-nums">{sorted.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</span>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <PageHeader title={bp.title} subtitle={bp.subtitle} actions={<Button onClick={() => setAdding(true)}><Plus className="h-5 w-5" />{bp.addBuyer}</Button>} />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row xl:min-w-[480px] xl:justify-end">
        <label className="relative block min-w-0 flex-1"><span className="sr-only">{bp.searchLabel}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3 text-sm text-crm-ink shadow-sm  placeholder:text-slate-500 focus:border-blue-300 focus:bg-white" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder={bp.searchPlaceholder} type="search" /></label>
        <label className="sr-only" htmlFor="buyers-country-top">{bp.countryFilter}</label><select id="buyers-country-top" className="hidden h-11 min-w-40 rounded-xl sm:block border border-line-strong bg-surface px-3 text-sm text-crm-ink shadow-sm focus:bg-white" value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }}><option value="">{bp.allCountries}</option>{countries.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
    </div>

    <section aria-label={bp.metricsLabel} className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <Metric icon={<Users />} label={bp.totalBuyers} value={activeBuyersQuery.isPending ? '—' : activeBuyers.length} detail={bp.totalBuyersDetail} tint="bg-surface-muted text-ink-muted" opens={bp.totalBuyersOpens} onOpen={showAll} />
      <Metric icon={<MapPin />} label={bp.activeCountries} value={activeBuyersQuery.isPending ? '—' : activeCountries} detail={bp.activeCountriesDetail} tint="bg-surface-muted text-ink-muted" opens={bp.activeCountriesOpens} onOpen={() => setCountriesOpen(true)} />
      <Metric icon={<Building2 />} label={bp.quotesSent} value={quotesQuery.data ? quotes.filter((q) => q.status === 'sent').length : (summary?.totals.open_quotations ?? '—')} detail={quotesQuery.data ? bp.quotesSentAwaiting : bp.quotesSentOpen} tint="bg-surface-muted text-ink-muted" opens={bp.quotesSentOpens} onOpen={() => navigate('/quotes?status=sent')} />
      <Metric icon={<Check />} label={bp.wonDeals} value={quotesQuery.data ? quotes.filter((q) => q.status === 'won').length : (summary?.totals.customers ?? '—')} detail={bp.wonDealsDetail} tint="bg-surface-muted text-ink-muted" opens={bp.wonDealsOpens} onOpen={() => navigate('/quotes?status=won')} />
    </section>
    {quotesQuery.data && quotesQuery.data.total > quotes.length && <p role="status" className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">{t.common.listTruncated(quotes.length, quotesQuery.data.total)}</p>}

    <section className="glass-panel overflow-hidden" aria-labelledby="buyers-table-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div><h2 id="buyers-table-heading" className="text-lg font-bold tracking-tight text-crm-ink">{bp.directory}</h2><p className="text-sm text-slate-500">{buyersQuery.isPending ? bp.loadingRecords : bp.matchCount(filtered.length)}</p></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} aria-controls="buyers-filters" className={clsx('tap inline-flex items-center gap-2 rounded-xl border px-3 text-sm font-semibold md:hidden', activeFilters ? 'border-paprika-200 bg-paprika-50 text-paprika-700' : 'border-line-strong bg-surface text-slate-600')}><Filter className="h-4 w-4" />{filtersOpen ? bp.hideFilters : activeFilters ? bp.filtersCount(activeFilters) : bp.filtersButton}</button><button type="button" onClick={() => setDueOnly((value) => !value)} aria-pressed={dueOnly} className={clsx('tap inline-flex items-center gap-2 rounded-xl border px-3 text-sm font-semibold', dueOnly ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-line-strong bg-surface text-slate-600 hover:bg-white')}><Filter className="h-4 w-4" />{bp.dueFollowups}</button><button type="button" onClick={() => setStatus((current) => current === 'active' ? 'all' : 'active')} className="tap inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-slate-700 hover:bg-white"><Archive className="h-4 w-4" />{status === 'active' ? bp.statusActive : bp.statusAll}<ChevronDown className="h-4 w-4" /></button></div>
      </div>
      <div id="buyers-filters" className={clsx('gap-3 border-b border-slate-200/70 bg-surface p-4 sm:grid-cols-2 md:grid xl:grid-cols-6', filtersOpen ? 'grid' : 'hidden')}>
        <Select label={bp.fCountry} value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }}><option value="">{bp.allCountries}</option>{countries.map((item) => <option key={item}>{item}</option>)}</Select>
        <Select label={bp.fStage} value={stage} onChange={(e) => { setStage(e.target.value); setPage(0); }}><option value="">{bp.fAllStages}</option>{STAGES.map((item) => <option key={item} value={item}>{stages[item]}</option>)}</Select>
        <Select label={bp.fProduct} value={product} onChange={(e) => { setProduct(e.target.value); setPage(0); }}><option value="">{bp.fAllProducts}</option>{APPROVED_PRODUCT_NAMES.map((item) => <option key={item}>{item}</option>)}</Select>
        <Select label={bp.fOwner} value={owner} onChange={(e) => { setOwner(e.target.value); setPage(0); }}><option value="">{bp.fAllOwners}</option>{team.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</Select>
        <Select label={bp.fStatus} value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }}><option value="active">{bp.statusActive}</option><option value="archived">{bp.statusArchived}</option><option value="all">{bp.statusAll}</option></Select>
        <Select label={bp.fMarket} value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}><option value="">{bp.fAllTypes}</option><option value="export">{bp.typeExport}</option><option value="domestic">{bp.typeDomestic}</option></Select>
      </div>
      {selected.size > 0 && <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-2 text-sm"><span className="font-medium text-crm-blue">{bp.selectedCount(selected.size)}</span><div className="flex gap-2"><button type="button" onClick={() => { const first = visible.find((b) => selected.has(b.id)); if (first) setDetailId(first.id); }} className="tap rounded-lg px-3 font-semibold text-crm-blue hover:bg-brand-50">{bp.viewSelected}</button><button type="button" onClick={() => setSelected(new Set())} className="tap rounded-lg px-3 text-slate-600 hover:bg-brand-50">{bp.clearSelection}</button></div></div>}
      {buyersQuery.isPending ? <Spinner label={bp.loadingBuyers} /> : buyersQuery.isError ? <div className="p-5"><ErrorNote error={buyersQuery.error} onRetry={() => void buyersQuery.refetch()} /></div> : visible.length === 0 ? <div className="px-4 py-12"><EmptyState title={search || country || stage || product || owner || type || dueOnly ? bp.noMatch : bp.noBuyers}>{search || country || stage || product || owner || type || dueOnly ? <button type="button" onClick={() => { setSearch(''); setCountry(''); setStage(''); setProduct(''); setOwner(''); setType(''); setDueOnly(false); }} className="mt-2 font-semibold text-crm-blue underline">{bp.clearFilters}</button> : <button type="button" onClick={() => setAdding(true)} className="mt-2 font-semibold text-crm-blue underline">{bp.addFirst}</button>}</EmptyState></div> : <>
        {/* phone: one card per buyer (the 15-column table is for md and up) */}
        <ul className="divide-y divide-line md:hidden">{visible.map((buyer) => (
          <li key={buyer.id} className="flex items-start gap-3 px-4 py-3">
            <button type="button" onClick={() => setDetailId(buyer.id)} className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[11px] font-semibold text-slate-500">{buyer.buyer_code}</span><span className={clsx('inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLE[buyerStatus(buyer)])}>{t.crm.statuses[buyerStatus(buyer)]}</span></div>
              <div className="mt-0.5 break-words font-bold text-crm-ink">{buyer.company_name}</div>
              <div className="mt-0.5 text-xs text-slate-500">{[buyer.city, buyer.country || buyer.state].filter(Boolean).join(', ') || '—'}{buyer.business_type ? ` · ${t.crm.businessTypes[buyer.business_type]}` : ''}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600"><span>{stages[buyer.stage]}</span><FollowupPill value={buyer.next_followup} /><span>{bp.quotesShort(buyer.quote_count ?? 0)}</span></div>
            </button>
            <Link to={`/quotes/new?buyer=${buyer.id}`} aria-label={bp.quoteAria(buyer.company_name)} className="tap grid shrink-0 place-items-center rounded-lg border border-line text-crm-blue hover:bg-surface-hover"><Plus className="h-4 w-4" /></Link>
          </li>
        ))}</ul>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1500px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50/95"><tr className="border-b border-slate-200">
            <th className="w-10 px-4 py-3"><input type="checkbox" aria-label={bp.selectPage} checked={allCurrentSelected} onChange={(e) => setSelected((current) => { const next = new Set(current); visible.forEach((b) => e.target.checked ? next.add(b.id) : next.delete(b.id)); return next; })} className="h-4 w-4 rounded accent-crm-blue" /></th>
            <th className="px-3 py-3">{sortButton('code', bp.colId)}</th><th className="px-3 py-3">{sortButton('company', bp.colCompany)}</th><th className="px-3 py-3">{sortButton('country', bp.colCountry)}</th><th className="px-3 py-3">{bp.colContact}</th><th className="px-3 py-3">{bp.colPhone}</th><th className="px-3 py-3">{sortButton('type', bp.colType)}</th><th className="px-3 py-3">{sortButton('products', bp.colProducts)}</th><th className="px-3 py-3">{sortButton('source', bp.colSource)}</th><th className="px-3 py-3">{sortButton('stage', bp.colStatus)}</th><th className="px-3 py-3">{sortButton('owner', bp.colOwner)}</th><th className="px-3 py-3">{sortButton('contact', bp.colLast)}</th><th className="px-3 py-3">{sortButton('followup', bp.colNext)}</th><th className="px-3 py-3 text-right">{sortButton('quotes', bp.colQuotes)}</th><th className="px-3 py-3 text-right">{bp.colActions}</th>
          </tr></thead>
          <tbody>{visible.map((buyer) => <tr key={buyer.id} onClick={() => setDetailId(buyer.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailId(buyer.id); } }} tabIndex={0} className="cursor-pointer bg-surface transition-colors hover:bg-forest-50 focus-visible:bg-blue-50/80">
            <td className="border-t border-slate-200/75 px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={bp.selectOne(buyer.company_name)} checked={selected.has(buyer.id)} onChange={() => toggleSelected(buyer.id)} className="h-4 w-4 rounded accent-crm-blue" /></td>
            <td className={clsx(CELL, 'whitespace-nowrap font-mono text-xs font-semibold text-slate-600')}>{buyer.buyer_code}</td>
            <td className={CELL}><div className="font-semibold text-crm-ink">{buyer.company_name}</div>{buyer.email && <div className="mt-0.5 text-xs text-slate-500">{buyer.email}</div>}</td>
            <td className={CELL}><div className="font-medium text-slate-700">{buyer.country || bp.india}</div><div className="text-xs text-slate-500">{buyer.city || buyer.state || '—'}</div></td>
            <td className={clsx(CELL, 'text-slate-700')}>{buyer.contact_name || <span className="text-slate-500">{bp.notSet}</span>}</td>
            <td className={clsx(CELL, 'whitespace-nowrap text-slate-600')}>{buyer.phone || buyer.whatsapp || '—'}{buyer.phone && buyer.whatsapp && buyer.whatsapp !== buyer.phone && <div className="text-xs text-slate-500">{bp.whatsappShort(buyer.whatsapp)}</div>}</td>
            <td className={clsx(CELL, 'text-slate-700')}>{buyer.business_type ? t.crm.businessTypes[buyer.business_type] : '—'}</td>
            <td className={CELL}><Tags products={buyer.interested_products} /></td>
            <td className={clsx(CELL, 'text-slate-600')}>{sourceLabel(buyer)}</td>
            <td className={CELL}><span title={stages[buyer.stage]} className={clsx('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_STYLE[buyerStatus(buyer)])}>{t.crm.statuses[buyerStatus(buyer)]}</span><div className="mt-0.5 text-xs text-slate-500">{stages[buyer.stage]}</div></td>
            <td className={clsx(CELL, 'text-slate-600')}>{ownerLabel(buyer, team)}</td>
            <td className={clsx(CELL, 'whitespace-nowrap text-slate-600')}>{buyer.last_contact_at ? date(buyer.last_contact_at) : bp.noContactYet}</td>
            <td className={CELL}><FollowupPill value={buyer.next_followup} /></td>
            <td className={clsx(CELL, 'text-right tabular-nums text-slate-700')}>{buyer.quote_count}</td>
            <td className="border-t border-slate-200/75 px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}><div className="inline-flex items-center gap-1"><button type="button" aria-label={bp.openAria(buyer.company_name)} onClick={() => setDetailId(buyer.id)} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><ExternalLink className="h-4 w-4" /></button><button type="button" aria-label={bp.editAria(buyer.company_name)} onClick={() => setEditing(buyer)} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><Pencil className="h-4 w-4" /></button><Link to={`/quotes/new?buyer=${buyer.id}`} aria-label={bp.quoteAria(buyer.company_name)} className="tap grid place-items-center rounded-lg text-crm-blue hover:bg-forest-50"><Plus className="h-4 w-4" /></Link><button type="button" aria-label={bp.moreAria(buyer.company_name)} onClick={() => setDetailId(buyer.id)} className="tap grid place-items-center rounded-lg text-slate-600 hover:bg-white"><MoreHorizontal className="h-4 w-4" /></button></div></td>
          </tr>)}</tbody>
        </table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/75 bg-surface px-4 py-3 text-sm text-slate-600"><span>{range}</span><div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 font-medium disabled:opacity-45"><ChevronLeft className="h-4 w-4" />{bp.previous}</button><span className="px-1">{bp.page(page + 1, pageCount)}</span><button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 font-medium disabled:opacity-45">{bp.next}<ChevronRight className="h-4 w-4" /></button></div></div>
      </>}
    </section>

    <Sheet open={countriesOpen} onClose={() => setCountriesOpen(false)} title={bp.countriesTitle}>
      {countryCounts.length === 0 ? <p className="text-sm text-slate-500">{bp.noCountries}</p> : <ul className="divide-y divide-line rounded-xl border border-line">{countryCounts.map(([name, n]) => (
        <li key={name}><button type="button" onClick={() => pickCountry(name)} className="tap flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-hover"><span className="font-semibold text-crm-ink">{name}</span><span className="text-sm tabular-nums text-slate-600">{bp.buyerCount(n)}</span></button></li>
      ))}</ul>}
    </Sheet>
    {detailId && <BuyerDrawer key={detailId} id={detailId} onClose={() => setDetailId(null)} onEdit={(buyer) => { setEditing(buyer); }} />}
    <Sheet wide open={adding} onClose={() => setAdding(false)} title={bp.addBuyerTitle}><BuyerForm onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); void buyersQuery.refetch(); void activeBuyersQuery.refetch(); void summaryQuery.refetch(); }} /></Sheet>
    <Sheet wide open={!!editing} onClose={() => setEditing(null)} title={bp.editBuyerTitle}><BuyerForm initial={editing ?? undefined} onCancel={() => setEditing(null)} onSaved={(buyer) => { setEditing(null); setDetailId(buyer.id); void qc.invalidateQueries({ queryKey: ['buyer', buyer.id] }); void buyersQuery.refetch(); void activeBuyersQuery.refetch(); void summaryQuery.refetch(); }} /></Sheet>
  </div>;
}
