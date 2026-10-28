/**
 * Trade Intelligence > Buyer finder: the companies found in your imported files, ranked by shipment evidence (score 0-100, grade
 * A / B / C). Filter by name, country, business type, status, grade, whether they are already in your CRM and whether they have
 * shipment evidence; sort by score, recency or volume; export the filtered list to Excel; add a company by hand. Tapping a company
 * opens its detail sheet (BuyerSheet) where it can be shortlisted or turned into a CRM lead.
 * API: GET /trade/buyers (key ['trade', 'buyers', filters]; the search is debounced; "Show more" raises the limit),
 * GET /trade/buyers/export.xlsx, POST /trade/buyers (add). The score, grade and "in CRM" flag are computed by the API.
 * Used by pages/Intelligence.tsx.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { useState } from 'react';
import { BuyerSheet } from '@/components/trade/BuyerSheet';
import { GradeBadge } from '@/components/trade/GradeBadge';
import { Button, Card, EmptyState, ErrorNote, Input, Select, Sheet, Spinner, Textarea, errorMessage, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { date } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { TradeBuyerRow, TradeRole } from '@/lib/types';
import { t } from '@/strings';

const m = t.ti;
const ROLES: TradeRole[] = ['importer', 'distributor', 'exporter', 'manufacturer', 'retailer', 'unknown'];
const PAGE = 50;

/** @param props.initialCountry — a country to start filtered to (from the Markets tab). */
export function BuyersTab({ initialCountry }: { initialCountry?: string }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState(initialCountry ?? '');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [inCrm, setInCrm] = useState('');
  const [grade, setGrade] = useState<'' | 'b' | 'a'>('');
  const [withShip, setWithShip] = useState(false);
  const [sort, setSort] = useState('score');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  const dq = useDebounced(q.trim(), 300);

  /** The filters as a query string (shared by the list and the Excel export). */
  const qs = (extra = '') => {
    const p = new URLSearchParams();
    if (dq) p.set('q', dq);
    if (country) p.set('country', country);
    if (role) p.set('role', role);
    if (status) p.set('status', status);
    if (inCrm) p.set('in_crm', inCrm);
    if (grade) p.set('min_score', grade === 'a' ? '70' : '45');
    if (withShip) p.set('has_shipments', 'true');
    p.set('sort', sort);
    return `${p.toString()}${extra}`;
  };

  const list = useQuery({
    queryKey: ['trade', 'buyers', qs(`&limit=${limit}`)],
    queryFn: () => api.get<{ total: number; rows: TradeBuyerRow[]; countries: { country: string; n: number }[] }>(`/trade/buyers?${qs(`&limit=${limit}`)}`),
    placeholderData: keepPreviousData,
  });
  const exportXlsx = useMutation({
    mutationFn: () => api.download(`/trade/buyers/export.xlsx?${qs()}`, 'trade-buyers.xlsx'),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const d = list.data;
  const countries = [...new Set([...(country ? [country] : []), ...(d?.countries ?? []).map((c) => c.country).filter(Boolean)])].sort();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold leading-6 text-ink">{m.buyersHeading}</h2>
          <p className="max-w-2xl text-sm text-fg-muted">{m.buyersHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={exportXlsx.isPending} onClick={() => exportXlsx.mutate()}><Download className="h-4 w-4" aria-hidden />{m.exportExcel}</Button>
          <Button onClick={() => setAdding(true)}><Plus className="h-5 w-5" aria-hidden />{m.addCompany}</Button>
        </div>
      </div>

      <Card className="space-y-3 p-4">
        <Input label={m.search} type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} autoComplete="off" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Select label={m.country} value={country} onChange={(e) => { setCountry(e.target.value); setLimit(PAGE); }}>
            <option value="">{m.all}</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label={m.role} value={role} onChange={(e) => { setRole(e.target.value); setLimit(PAGE); }}>
            <option value="">{m.all}</option>
            {ROLES.map((r) => <option key={r} value={r}>{m.roles[r]}</option>)}
          </Select>
          <Select label={m.status} value={status} onChange={(e) => { setStatus(e.target.value); setLimit(PAGE); }}>
            <option value="">{m.all}</option>
            {(['new', 'shortlisted', 'converted', 'rejected'] as const).map((s) => <option key={s} value={s}>{m.statuses[s]}</option>)}
          </Select>
          <Select label={m.inCrm} value={inCrm} onChange={(e) => { setInCrm(e.target.value); setLimit(PAGE); }}>
            <option value="">{m.all}</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
          <Select label={m.minGrade} value={grade} onChange={(e) => { setGrade(e.target.value as '' | 'b' | 'a'); setLimit(PAGE); }}>
            <option value="">{m.gradeAll}</option>
            <option value="b">{m.gradeB}</option>
            <option value="a">{m.gradeA}</option>
          </Select>
          <Select label={m.sort} value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(m.sorts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        <label className="tap flex items-center gap-3 text-base text-forest-900">
          <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={withShip} onChange={(e) => { setWithShip(e.target.checked); setLimit(PAGE); }} />
          {m.onlyShip}
        </label>
      </Card>

      {d && <p className="text-sm font-medium text-fg-secondary" aria-live="polite">{m.results(d.total)}</p>}
      {list.isPending ? <Spinner /> : list.isError ? <ErrorNote error={list.error} onRetry={() => void list.refetch()} /> : d && d.rows.length === 0 ? (
        <Card><EmptyState title={m.noMatch}>{m.noDataHint}</EmptyState></Card>
      ) : (
        <ul className="grid gap-2 xl:grid-cols-2">
          {d?.rows.map((b) => (
            <li key={b.id}>
              <button type="button" onClick={() => setOpen(b.id)} className="card flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-forest-50">
                <GradeBadge grade={b.grade} score={b.score} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words text-lg font-semibold text-forest-900">{b.name}</span>
                    {b.in_crm && <span className="rounded-full bg-forest-50 px-2.5 py-0.5 text-xs font-semibold text-forest-800">{m.inCrmBadge}</span>}
                    {b.status !== 'new' && <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-xs font-semibold text-forest-900">{m.statuses[b.status]}</span>}
                  </span>
                  <span className="block text-sm text-fg-secondary">{[b.country, m.roles[b.role]].filter(Boolean).join(' · ')}</span>
                  <span className="block text-sm text-fg-secondary">
                    {b.shipments > 0
                      ? [m.ship(b.shipments), b.last_shipment && m.lastShip(date(b.last_shipment)), b.qty_12m > 0 && m.kg(b.qty_12m), b.india_shipments > 0 && m.fromIndia(b.india_shipments), b.suppliers > 0 && m.suppliersN(b.suppliers)].filter(Boolean).join(' · ')
                      : <span className="text-fg-muted">{m.noEvidence}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {d && d.total > d.rows.length && (
        <div className="text-center"><Button variant="secondary" loading={list.isFetching} onClick={() => setLimit((n) => n + PAGE)}>{m.loadMore}</Button></div>
      )}

      <BuyerSheet id={open} onClose={() => setOpen(null)} />
      <AddCompanySheet open={adding} onClose={() => setAdding(false)} onAdded={(id) => setOpen(id)} />
    </div>
  );
}

/** Sheet to add a company by hand (a lead found on a website, in a directory or at a trade fair). */
function AddCompanySheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (id: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const blank = { name: '', country: '', role: 'importer', contact_name: '', email: '', phone: '', website: '', notes: '', source: '' };
  const [f, setF] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
  const add = useMutation({
    mutationFn: () => api.post<{ id: string }>('/trade/buyers', { ...f, source: f.source.trim() || 'Added by hand' }),
    onSuccess: async (r) => { await qc.invalidateQueries({ queryKey: ['trade'] }); toast(m.added); setF(blank); onClose(); onAdded(r.id); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); else toast(errorMessage(e), 'error'); },
  });
  return (
    <Sheet wide open={open} onClose={onClose} title={m.addTitle}>
      <form onSubmit={(e) => { e.preventDefault(); setErrors({}); add.mutate(); }} className="space-y-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={m.name} value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <Input label={m.country} value={f.country} onChange={(e) => set('country', e.target.value)} />
          <Select label={m.role} value={f.role} onChange={(e) => set('role', e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{m.roles[r]}</option>)}
          </Select>
          <Input label={m.contactName} optional value={f.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
          <Input label={m.email} optional type="email" inputMode="email" value={f.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
          <Input label={m.phone} optional type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label={m.website} optional inputMode="url" value={f.website} onChange={(e) => set('website', e.target.value)} />
          <Input label={m.sourceLabel} optional value={f.source} onChange={(e) => set('source', e.target.value)} hint={m.sourceHint} />
        </div>
        <Textarea label={m.notes} optional rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{m.cancel}</Button>
          <Button type="submit" className="flex-1" loading={add.isPending}>{m.save}</Button>
        </div>
      </form>
    </Sheet>
  );
}
