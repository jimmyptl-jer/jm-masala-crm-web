/**
 * Products & Pricing screen (route /products): the catalogue as a card grid (one card per product name, its
 * grades grouped inside) or a flat table. Clicking a product opens its own page (/products/:name, see
 * pages/ProductDetail.tsx); Add and Edit are full pages too (/products/new, /products/:name/edit).
 * API: GET /products via useProducts (react-query key ['products', { q, archived }]). Everyone signed in can
 * read the list; only admins see Add and Edit (the API also enforces this with a 403). Products are archived,
 * never deleted (BR-12). Counts and the "last updated" date are worked out from the loaded rows (no money is
 * added up). Mounted by router.tsx.
 * Local state: q (search), status (active / all) and view (grid / table).
 */
import clsx from 'clsx';
import { CalendarClock, Layers, Package, Pencil, Plus, Search, Table2, LayoutGrid, Tag, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Stat, Thumb, group } from '@/components/products/shared';
import { Button, EmptyState, ErrorNote, PageHeader, Spinner } from '@/components/ui';
import { date, money, qty } from '@/lib/format';
import { useDebounced, useProducts } from '@/lib/hooks';
import { isApprovedProduct } from '@/lib/products';
import { t } from '@/strings';

const s = t.products;

/** Products & Pricing screen (route /products). */
export default function Products() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'all'>('active');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const dq = useDebounced(q.trim(), 300);

  const query = useProducts({ q: dq || undefined, archived: status === 'all' ? 'all' : 'false' });
  const all = useProducts({ archived: 'false' });
  const rows = useMemo(() => (query.data ?? []).filter((p) => isApprovedProduct(p.name)), [query.data]);
  const groups = useMemo(() => group(rows), [rows]);
  const activeRows = useMemo(() => (all.data ?? []).filter((p) => isApprovedProduct(p.name)), [all.data]);
  const lastUpdated = activeRows.map((p) => p.updated_at).filter(Boolean).sort().at(-1);
  const open = (name: string) => navigate(`/products/${encodeURIComponent(name)}`);
  const edit = (name: string) => navigate(`/products/${encodeURIComponent(name)}/edit`);

  return (
    <div className="space-y-4">
      <PageHeader
        title={s.title}
        subtitle={isAdmin ? s.subtitle : `${s.subtitle} ${s.readOnlyNote}`}
        actions={isAdmin ? <Button onClick={() => navigate('/products/new')}><Plus className="h-5 w-5" aria-hidden />{s.add}</Button> : undefined}
      />

      <section aria-label={s.title} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={<Package />} label={s.statProducts} value={all.isPending ? '—' : new Set(activeRows.map((p) => p.name)).size} sub={s.statProductsSub} tint="bg-surface-muted text-ink-muted" />
        <Stat icon={<Layers />} label={s.statGrades} value={all.isPending ? '—' : activeRows.length} sub={s.statGradesSub} tint="bg-surface-muted text-ink-muted" />
        <Stat icon={<Tag />} label={s.statPriced} value={all.isPending ? '—' : activeRows.filter((p) => p.ref_rate_usd || p.ref_rate_inr).length} sub={s.statPricedSub} tint="bg-surface-muted text-ink-muted" />
        <Stat icon={<CalendarClock />} label={s.statUpdated} value={lastUpdated ? date(lastUpdated) : '—'} sub={s.statUpdatedSub} tint="bg-surface-muted text-ink-muted" />
      </section>

      <div>
        <section className="glass-panel min-w-0 p-4" aria-label={s.title}>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="relative block min-w-[200px] flex-1">
              <span className="sr-only">{s.searchLabel}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input type="search" inputMode="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder={s.searchPlaceholder}
                className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3 text-sm text-crm-ink placeholder:text-slate-500" />
            </label>
            <label className="block">
              <span className="sr-only">{s.statusLabel}</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'all')} className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-crm-ink">
                <option value="active">{s.statusActive}</option><option value="all">{s.statusAll}</option>
              </select>
            </label>
            <div role="group" aria-label={s.viewLabel} className="inline-flex rounded-xl border border-line-strong bg-surface p-1">
              {([['grid', s.viewGrid, <LayoutGrid key="g" className="h-4 w-4" />], ['table', s.viewTable, <Table2 key="t" className="h-4 w-4" />]] as const).map(([key, label, icon]) => (
                <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}
                  className={clsx('tap inline-flex items-center gap-1.5 rounded-lg px-3 text-sm font-semibold', view === key ? 'bg-forest-900 text-white' : 'text-slate-600')}>{icon}{label}</button>
              ))}
            </div>
          </div>

          {query.isPending ? <Spinner /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : groups.length === 0 ? (
            <EmptyState title={dq || status === 'all' ? s.noMatch : s.empty}>{!dq && status === 'active' && (isAdmin ? s.emptyAdmin : s.emptySales)}</EmptyState>
          ) : view === 'grid' ? (
            <ul className={clsx('grid gap-3 sm:grid-cols-2', 'xl:grid-cols-3 2xl:grid-cols-4')}>
              {groups.map((g) => (
                <li key={g.name}>
                  <button type="button" onClick={() => open(g.name)} aria-label={s.openProduct(g.name)}
                    className={clsx('glass-interactive block w-full overflow-hidden rounded-2xl border bg-surface text-left hover:bg-white', 'border-line')}>
                    <Thumb src={g.image} name={g.name} className="h-32 w-full" />
                    <span className="block p-3">
                      <span className="flex items-start justify-between gap-2">
                        <span className="break-words font-semibold text-crm-ink">{g.name}</span>
                        <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', g.archived ? 'bg-zinc-200 text-zinc-800' : 'bg-emerald-50 text-emerald-800')}>{g.archived ? s.archivedBadge : s.statusActive}</span>
                      </span>
                      <span className="mt-2 block space-y-1 text-xs text-slate-600">
                        <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" aria-hidden />{s.grades(g.rows.length)}</span>
                        <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" aria-hidden />{g.packing.length ? s.packagings(g.packing.length) : s.noPackaging}</span>
                        {g.updated && <span className="flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" aria-hidden />{s.updatedOn(date(g.updated))}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-medium">{s.colProduct}</th><th className="px-2 py-2 font-medium">{s.colGrade}</th><th className="px-2 py-2 font-medium">{s.fUnit}</th>
                  <th className="px-2 py-2 font-medium">{s.fGst}</th><th className="px-2 py-2 font-medium">{s.fHs}</th>
                  <th className="px-2 py-2 text-right font-medium">{s.colRefUsd}</th><th className="px-2 py-2 text-right font-medium">{s.colRefInr}</th>
                  <th className="px-2 py-2 font-medium">{s.colUpdated}</th><th className="px-2 py-2 text-right font-medium">{s.colActions}</th>
                </tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id} onClick={() => open(p.name)} className="cursor-pointer border-b border-slate-100 hover:bg-brand-50">
                      <td className="px-2 py-2.5 font-semibold text-crm-ink">{p.name}{p.archived && <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-800">{s.archivedBadge}</span>}</td>
                      <td className="px-2 py-2.5 text-slate-600">{p.grade ?? '—'}</td>
                      <td className="px-2 py-2.5 text-slate-600">{t.common.unit[p.unit]}</td>
                      <td className="px-2 py-2.5 tabular-nums text-slate-600">{qty(p.gst_rate)}%</td>
                      <td className="px-2 py-2.5 text-slate-600">{p.hs_code ?? '—'}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{p.ref_rate_usd ? money(p.ref_rate_usd, 'USD') : '—'}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{p.ref_rate_inr ? money(p.ref_rate_inr, 'INR') : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-slate-600">{p.updated_at ? date(p.updated_at) : '—'}</td>
                      <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {isAdmin && <Button variant="secondary" aria-label={s.editAria(p.name)} onClick={() => edit(p.name)}><Pencil className="h-4 w-4" aria-hidden />{s.edit}</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
