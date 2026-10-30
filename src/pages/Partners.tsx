/**
 * Partners & Suppliers list: /partners. The central directory of outside companies. Columns: Partner ID, Company, Roles (badges), Primary
 * contact, Phone / WhatsApp, City / State, Products / services, Last interaction, Status, Actions (view, edit, log activity). Filters: search,
 * role, status and archived. API: GET /partners (key ['partners', opts]); the whole list is loaded and the text search, sorting and paging
 * happen in the browser, like Buyers. On phones the rows become cards. "Add partner" (or /partners?new=1) opens the form in a sheet.
 */
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ExternalLink, MessageSquarePlus, Pencil, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PartnerForm } from '@/components/partners/PartnerForm';
import { LogActivitySheet, RoleBadges, StatusPill } from '@/components/partners/shared';
import { Button, EmptyState, ErrorNote, PageHeader, Select, Sheet, Spinner } from '@/components/ui';
import { date } from '@/lib/format';
import { useDebounced, usePartners } from '@/lib/hooks';
import { PARTNER_ROLES, PARTNER_STATUSES, offering, primaryContact, type Partner } from '@/lib/partners';
import { t } from '@/strings';

const s = t.partners;
const PAGE_SIZE = 10;
const CELL = 'border-t border-line px-3 py-3';

type SortKey = 'code' | 'company' | 'contact' | 'location' | 'offering' | 'last' | 'status';
const place = (p: Partner) => [p.city, p.state].filter(Boolean).join(', ');

/** One summary tile; a button that shows the partners it counts in the directory below. */
function Metric({ label, value, detail, onOpen }: { label: string; value: number | string; detail: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} aria-label={`${label}: ${value}. Show them in the directory`} className="card block w-full p-4 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paprika/40"><div className="text-xs font-medium text-ink-muted">{label}</div><div className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</div><div className="mt-0.5 text-xs text-ink-muted">{detail}</div></button>;
}
const LOGISTICS: Partner['roles'] = ['transporter', 'cha', 'freight_forwarder', 'shipping_line'];

export default function Partners() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [logisticsOnly, setLogisticsOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'company', desc: false });
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [logging, setLogging] = useState<Partner | null>(null);
  // /partners?new=1 (the "+ New" menu) opens the Add partner sheet; the flag is removed afterwards so the next click is a real change again
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setAdding(true);
    setParams((p) => { const next = new URLSearchParams(p); next.delete('new'); return next; }, { replace: true });
  }, [params, setParams]);
  const delayed = useDebounced(search.trim(), 250);
  const query = usePartners({ archived: showArchived ? 'all' : 'false' });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const reset = () => setPage(0);

  const filtered = useMemo(() => all.filter((p) => {
    const q = delayed.toLowerCase();
    const text = [p.partner_code, p.company_name, p.legal_name, p.city, p.state, p.email, ...p.contacts.map((c) => c.name), offering(p)].filter(Boolean).join(' ').toLowerCase();
    return (!q || text.includes(q)) && (!role || p.roles.includes(role as Partner['roles'][number])) && (!status || p.status === status) && (!logisticsOnly || p.roles.some((r) => LOGISTICS.includes(r)));
  }), [all, delayed, role, status, logisticsOnly]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const val = (p: Partner): string => sort.key === 'code' ? p.partner_code : sort.key === 'contact' ? primaryContact(p)?.name ?? '' : sort.key === 'location' ? place(p) : sort.key === 'offering' ? offering(p) : sort.key === 'last' ? p.last_interaction ?? '' : sort.key === 'status' ? s.status[p.status] : p.company_name;
    return (sort.desc ? -1 : 1) * val(a).localeCompare(val(b), undefined, { sensitivity: 'base' });
  }), [filtered, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const visible = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const filtering = !!(search || role || status || logisticsOnly);
  const live = all.filter((p) => !p.archived);

  const toggleSort = (key: SortKey) => { reset(); setSort((c) => (c.key === key ? { key, desc: !c.desc } : { key, desc: false })); };
  const sortButton = (key: SortKey, label: string) => <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted hover:text-ink">{label}{sort.key === key && (sort.desc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />)}</button>;
  const clearFilters = () => { setSearch(''); setRole(''); setStatus(''); setLogisticsOnly(false); reset(); };
  /** A tile was clicked: show exactly those partners (no other filter), then scroll to the directory. */
  const show = ({ role: r = '', status: st = '', logistics = false }: { role?: string; status?: string; logistics?: boolean }) => {
    setSearch(''); setShowArchived(false); setRole(r); setStatus(st); setLogisticsOnly(logistics); reset();
    window.setTimeout(() => document.getElementById('partners-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <PageHeader title={s.title} subtitle={s.subtitle} actions={<Button onClick={() => setAdding(true)}><Plus className="h-5 w-5" />{s.add}</Button>} />
      <label className="relative mb-3 block min-w-0 xl:w-[420px]"><span className="sr-only">{s.search}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-10 pr-3 text-sm text-ink placeholder:text-ink-placeholder focus:border-paprika focus:outline-none focus:ring-2 focus:ring-paprika/20" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder={s.search} type="search" /></label>
    </div>

    <section aria-label="Partner metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label={s.metricTotal} value={query.isPending ? '—' : live.length} detail={s.metricTotalSub} onOpen={() => show({})} />
      <Metric label={s.metricSuppliers} value={query.isPending ? '—' : live.filter((p) => p.roles.includes('supplier')).length} detail={s.metricSuppliersSub} onOpen={() => show({ role: 'supplier' })} />
      <Metric label={s.metricLogistics} value={query.isPending ? '—' : live.filter((p) => p.roles.some((r) => LOGISTICS.includes(r))).length} detail={s.metricLogisticsSub} onOpen={() => show({ logistics: true })} />
      <Metric label={s.metricReview} value={query.isPending ? '—' : live.filter((p) => p.status === 'under_review').length} detail={s.metricReviewSub} onOpen={() => show({ status: 'under_review' })} />
    </section>

    <section className="card overflow-hidden" aria-labelledby="partners-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div><h2 id="partners-heading" className="text-lg font-bold tracking-tight text-ink">{s.directory}</h2><p className="text-sm text-ink-muted">{query.isPending ? s.loading : s.match(filtered.length)}</p></div>
        <button type="button" onClick={() => { setShowArchived((v) => !v); reset(); }} aria-pressed={showArchived} className={clsx('tap inline-flex items-center gap-2 rounded-lg border px-3 text-sm font-semibold', showArchived ? 'border-line-strong bg-surface-muted text-ink' : 'border-line-strong bg-surface text-ink-secondary hover:bg-surface-hover')}>{s.archivedToggle}</button>
      </div>
      <div className="grid gap-3 border-b border-line bg-surface p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
        <Select label={s.filters.role} value={role} onChange={(e) => { setRole(e.target.value); setLogisticsOnly(false); reset(); }}><option value="">{s.filters.allRoles}</option>{PARTNER_ROLES.map((x) => <option key={x} value={x}>{s.roles[x]}</option>)}</Select>
        <Select label={s.filters.status} value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}><option value="">{s.filters.allStatuses}</option>{PARTNER_STATUSES.map((x) => <option key={x} value={x}>{s.status[x]}</option>)}</Select>
        <div className="flex items-end"><Button variant="ghost" onClick={clearFilters} disabled={!filtering}>{s.reset}</Button></div>
      </div>

      {query.isPending ? <Spinner label={s.loading} /> : query.isError ? <div className="p-5"><ErrorNote error={query.error} onRetry={() => void query.refetch()} /></div> : visible.length === 0 ? <div className="px-4 py-12"><EmptyState title={filtering ? s.noneMatch : s.none}>
        {filtering ? <button type="button" onClick={clearFilters} className="mt-2 font-semibold text-paprika underline">{s.clear}</button> : <button type="button" onClick={() => setAdding(true)} className="mt-2 font-semibold text-paprika underline">{s.addFirst}</button>}</EmptyState></div> : <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1200px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-surface-muted"><tr className="border-b border-line">
            <th className="px-4 py-3">{sortButton('code', s.cols.code)}</th><th className="px-3 py-3">{sortButton('company', s.cols.company)}</th><th className="px-3 py-3">{s.cols.roles}</th><th className="px-3 py-3">{sortButton('contact', s.cols.contact)}</th>
            <th className="px-3 py-3">{s.cols.phone}</th><th className="px-3 py-3">{sortButton('location', s.cols.location)}</th><th className="px-3 py-3">{sortButton('offering', s.cols.offering)}</th>
            <th className="px-3 py-3">{sortButton('last', s.cols.last)}</th><th className="px-3 py-3">{sortButton('status', s.cols.status)}</th><th className="px-3 py-3 text-right">{s.cols.actions}</th>
          </tr></thead>
          <tbody>{visible.map((p) => {
            const contact = primaryContact(p);
            return <tr key={p.id} onClick={() => navigate(`/partners/${p.id}`)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/partners/${p.id}`); }} className={clsx('cursor-pointer bg-surface transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover', p.archived && 'opacity-60')}>
              <td className={clsx(CELL, 'whitespace-nowrap pl-4 font-mono text-xs font-semibold text-ink-secondary')}>{p.partner_code}</td>
              <td className={CELL}><div className="font-semibold text-ink">{p.company_name}</div>{p.legal_name && <div className="text-xs text-ink-muted">{p.legal_name}</div>}</td>
              <td className={CELL}><RoleBadges roles={p.roles} /></td>
              <td className={clsx(CELL, 'text-ink-secondary')}>{contact?.name ?? <span className="text-ink-muted">{s.noContact}</span>}{contact?.designation && <div className="text-xs text-ink-muted">{contact.designation}</div>}</td>
              <td className={clsx(CELL, 'whitespace-nowrap text-ink-secondary')}>{contact?.phone || p.phone || p.whatsapp || '—'}</td>
              <td className={clsx(CELL, 'text-ink-secondary')}>{place(p) || '—'}</td>
              <td className={clsx(CELL, 'max-w-[220px] text-ink-secondary')}><span className="line-clamp-2">{offering(p) || '—'}</span></td>
              <td className={clsx(CELL, 'whitespace-nowrap text-ink-secondary')}>{p.last_interaction ? date(p.last_interaction.slice(0, 10)) : s.noInteraction}</td>
              <td className={CELL}><StatusPill status={p.status} /></td>
              <td className={clsx(CELL, 'text-right')} onClick={(e) => e.stopPropagation()}><div className="inline-flex items-center gap-1">
                <Link to={`/partners/${p.id}`} aria-label={`${s.actions.view} ${p.company_name}`} className="tap grid place-items-center rounded-lg text-ink-secondary hover:bg-surface-hover"><ExternalLink className="h-4 w-4" /></Link>
                <button type="button" aria-label={`${s.actions.edit} ${p.company_name}`} onClick={() => setEditing(p)} className="tap grid place-items-center rounded-lg text-ink-secondary hover:bg-surface-hover"><Pencil className="h-4 w-4" /></button>
                <button type="button" aria-label={`${s.actions.log} ${p.company_name}`} onClick={() => setLogging(p)} className="tap grid place-items-center rounded-lg text-paprika hover:bg-paprika-50"><MessageSquarePlus className="h-4 w-4" /></button>
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>

        <ul className="divide-y divide-line md:hidden">{visible.map((p) => {
          const contact = primaryContact(p);
          return <li key={p.id} className={clsx('p-4', p.archived && 'opacity-60')}>
            <Link to={`/partners/${p.id}`} className="block">
              <div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-ink">{p.company_name}</div><div className="font-mono text-xs text-ink-muted">{p.partner_code}{place(p) && ` · ${place(p)}`}</div></div><StatusPill status={p.status} /></div>
              <div className="mt-2"><RoleBadges roles={p.roles} /></div>
              {(contact || offering(p)) && <div className="mt-2 text-sm text-ink-secondary">{contact?.name}{contact?.phone && ` · ${contact.phone}`}{offering(p) && <div className="text-xs text-ink-muted">{offering(p)}</div>}</div>}
            </Link>
            <div className="mt-3 flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" />{s.actions.edit}</Button><Button variant="secondary" className="flex-1" onClick={() => setLogging(p)}><MessageSquarePlus className="h-4 w-4" />{s.actions.log}</Button></div>
          </li>;
        })}</ul>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 text-sm text-ink-secondary">
          <span className="tabular-nums">{sorted.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</span>
          <div className="flex items-center gap-2"><button type="button" disabled={page === 0} onClick={() => setPage((v) => Math.max(0, v - 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 font-medium disabled:opacity-45"><ChevronLeft className="h-4 w-4" />Previous</button><span className="px-1">Page {page + 1} of {pageCount}</span><button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((v) => Math.min(pageCount - 1, v + 1))} className="tap inline-flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 font-medium disabled:opacity-45">Next<ChevronRight className="h-4 w-4" /></button></div>
        </div>
      </>}
    </section>

    <Sheet wide open={adding} onClose={() => setAdding(false)} title={s.addTitle}><PartnerForm onCancel={() => setAdding(false)} onSaved={(p) => { setAdding(false); navigate(`/partners/${p.id}`); }} /></Sheet>
    <Sheet wide open={!!editing} onClose={() => setEditing(null)} title={s.editTitle}><PartnerForm initial={editing ?? undefined} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} /></Sheet>
    <LogActivitySheet partner={logging} onClose={() => setLogging(null)} />
  </div>;
}
