/**
 * One product's own page, route /products/:name (reached by clicking a product on /products).
 * Shows the product (image, status, key highlights, counts) and tabs for its grades, packaging and reference
 * pricing, as a read view; admins get "Edit product" which opens the full edit page (/products/:name/edit).
 * API: GET /products?archived=all via useProducts (key ['products', { archived: 'all' }]); the rows with this
 * name are its grades. Counts and the last-updated date are worked out from those rows (no money is added up).
 * Reference rates are guidance only. Not in the data yet: product code, category, origin, several images,
 * documents (see docs/PRODUCT-MODEL-PROPOSAL.md).
 * Local state: the selected tab.
 */
import clsx from 'clsx';
import { CalendarClock, ChevronLeft, Layers, Package, Pencil, Tag } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Fact, Stat, Thumb, group, refLine, uniq } from '@/components/products/shared';
import { RouterButton } from '@/components/quote/shared';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { date, money, qty } from '@/lib/format';
import { useProducts } from '@/lib/hooks';
import { t } from '@/strings';

const s = t.products;
type Tab = 'overview' | 'grades' | 'packaging' | 'pricing';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: s.tabOverview }, { key: 'grades', label: s.tabGrades },
  { key: 'packaging', label: s.tabPackaging }, { key: 'pricing', label: s.tabPricing },
];

/** A titled card of the page. */
const Panel = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => (
  <section className="glass-panel min-w-0 p-4">
    <h2 className="text-[17px] font-bold leading-6 text-ink">{title}</h2>
    {sub && <p className="text-sm text-slate-500">{sub}</p>}
    <div className="mt-3">{children}</div>
  </section>
);

/** Product page. */
export default function ProductDetail() {
  const { name: param } = useParams();
  const name = param ? decodeURIComponent(param) : '';
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const query = useProducts({ archived: 'all' });
  const g = useMemo(() => group((query.data ?? []).filter((p) => p.name === name))[0], [query.data, name]);

  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorNote error={query.error} onRetry={() => void query.refetch()} />;
  if (!g) {
    return (
      <div className="space-y-4">
        <Link to="/products" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />{s.backToList}</Link>
        <div className="glass-panel p-6"><EmptyState title={s.notFound}>{s.notFoundHint}</EmptyState></div>
      </div>
    );
  }

  const live = g.rows.filter((p) => !p.archived);
  const single = g.rows.length === 1 ? g.rows[0] : undefined;
  const highlights = uniq([...live.map((p) => p.cleaning), ...live.map((p) => (p.purity ? `${s.fPurity} ${p.purity}` : null))]).slice(0, 6);
  const editTo = `/products/${encodeURIComponent(g.name)}/edit`;

  const gradesTable = (
    <div className="overflow-x-auto">
      <table className="rt w-full min-w-[860px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-2 py-2 font-medium">#</th><th className="px-2 py-2 font-medium">{s.colGrade}</th><th className="px-2 py-2 font-medium">{s.colPurity}</th>
            <th className="px-2 py-2 font-medium">{s.colMoisture}</th><th className="px-2 py-2 font-medium">{s.colCleaning}</th><th className="px-2 py-2 font-medium">{s.colUnit}</th>
            <th className="px-2 py-2 text-right font-medium">{s.colRate}</th><th className="px-2 py-2 font-medium">{s.colGst}</th><th className="px-2 py-2 font-medium">{s.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          {g.rows.map((p, i) => (
            <tr key={p.id} className={clsx('border-b border-slate-100 align-top', p.archived && 'opacity-60')}>
              <td className="px-2 py-2.5 text-slate-500">{i + 1}</td>
              <td className="px-2 py-2.5">
                <div className="font-semibold text-crm-ink">{p.grade ?? g.name}</div>
                {p.specification && <div className="line-clamp-2 max-w-xs text-xs text-slate-500">{p.specification}</div>}
              </td>
              <td className="px-2 py-2.5 text-slate-700">{p.purity ?? '—'}</td>
              <td className="px-2 py-2.5 text-slate-700">{p.moisture ?? '—'}</td>
              <td className="px-2 py-2.5 text-slate-700">{p.cleaning ?? '—'}</td>
              <td className="px-2 py-2.5 text-slate-700">{t.common.unit[p.unit]}</td>
              <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-700">
                {p.ref_rate_usd || p.ref_rate_inr ? <>{p.ref_rate_usd && <div>{money(p.ref_rate_usd, 'USD')}</div>}{p.ref_rate_inr && <div>{money(p.ref_rate_inr, 'INR')}</div>}<div className="text-xs text-slate-500">{s.perKg}</div></> : '—'}
              </td>
              <td className="px-2 py-2.5 tabular-nums text-slate-700">{p.gst_rate == null ? '—' : `${qty(p.gst_rate)}%`}</td>
              <td className="px-2 py-2.5">
                <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-semibold', p.archived ? 'bg-zinc-200 text-zinc-800' : p.status === 'draft' ? 'bg-warning-bg text-warning-ink' : 'bg-emerald-50 text-emerald-800')}>{p.archived ? s.archivedBadge : p.status === 'draft' ? s.draftBadge : s.statusActive}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const packagingList = g.packing.length ? (
    <ol className="space-y-1.5">
      {g.packing.map((x, i) => (
        <li key={x} className="flex items-center gap-3 rounded-xl border border-line bg-surface-muted px-3 py-2 text-sm">
          <span className="text-slate-500">{i + 1}</span><span className="font-medium text-crm-ink">{x}</span>
          {i === 0 && g.packing.length > 1 && <span className="ml-auto rounded-full bg-forest-50 px-2 py-0.5 text-xs font-semibold text-forest-900">{s.packingDefault}</span>}
        </li>
      ))}
    </ol>
  ) : <p className="text-sm text-slate-500">{s.noPackaging}</p>;

  const pricing = (
    <>
      <ul className="divide-y divide-slate-100 rounded-xl border border-line bg-surface-muted">
        {live.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="font-medium text-crm-ink">{p.grade ?? g.name}</span>
            <span className="text-right tabular-nums text-slate-700">
              {refLine(p) || <span className="text-fg-muted">{s.noRefRate}</span>}
              <span className="block text-xs text-slate-500">{s.perKg}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">{s.refNote}</p>
    </>
  );

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-600">
        <Link to="/products" className="inline-flex items-center gap-1 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />{s.title}</Link>
        <span aria-hidden>/</span><span className="font-medium text-crm-ink">{g.name}</span>
      </nav>

      <section className="glass-panel p-4 md:p-5">
        <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_22rem]">
          <Thumb src={g.image} name={g.name} className="h-44 w-full rounded-2xl border border-slate-200 md:h-48" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-bold tracking-tight text-crm-ink md:text-3xl">{g.name}</h1>
                <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-semibold', g.archived ? 'bg-zinc-200 text-zinc-800' : g.rows.every((r) => r.status === 'draft') ? 'bg-warning-bg text-warning-ink' : 'bg-emerald-50 text-emerald-800')}>{g.archived ? s.archivedBadge : g.rows.every((r) => r.status === 'draft') ? s.draftBadge : s.statusActive}</span>
              </div>
              {isAdmin && <RouterButton to={editTo} variant="secondary"><Pencil className="h-4 w-4" aria-hidden />{s.editProduct}</RouterButton>}
            </div>
            <p className="mt-1 text-sm text-slate-500">{s.grades(live.length)} · {g.packing.length ? s.packagings(g.packing.length) : s.noPackaging}</p>
            {single?.specification && <p className="mt-2 max-w-prose text-sm text-slate-600">{single.specification}</p>}
            {highlights.length > 0 && (
              <div className="mt-3">
                <h2 className="text-sm font-semibold text-crm-ink">{s.highlights}</h2>
                <ul className="mt-1.5 flex flex-wrap gap-2">{highlights.map((h) => <li key={h} className="rounded-lg bg-forest-50 px-3 py-1 text-sm font-medium text-forest-900">{h}</li>)}</ul>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:col-span-2 xl:col-span-1">
            <Stat icon={<Layers />} label={s.statActiveGrades} value={live.length} sub={s.statActiveGradesSub} tint="bg-surface-muted text-ink-muted" />
            <Stat icon={<Package />} label={s.statPackaging} value={g.packing.length} sub={s.statPackagingSub} tint="bg-surface-muted text-ink-muted" />
            <Stat icon={<Tag />} label={s.statRates} value={live.filter((p) => p.ref_rate_usd || p.ref_rate_inr).length} sub={s.statRatesSub} tint="bg-surface-muted text-ink-muted" />
            <Stat icon={<CalendarClock />} label={s.statUpdated} value={g.updated ? date(g.updated) : '—'} sub={s.statUpdatedSub} tint="bg-surface-muted text-ink-muted" />
          </div>
        </div>
      </section>

      <div role="tablist" aria-label={g.name} className="glass-panel flex flex-wrap gap-1 p-2 md:flex-nowrap md:overflow-x-auto">
        {TABS.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)}
            className={clsx('tap whitespace-nowrap rounded-xl px-4 text-sm font-semibold', tab === x.key ? 'bg-forest-900 text-white' : 'text-slate-600 hover:bg-brand-50')}>{x.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start">
          <Panel title={s.secInfo}>
            <dl className="divide-y divide-slate-100">
              <Fact label={s.fName} value={g.name} />
              <Fact label={s.fUnit} value={uniq(g.rows.map((p) => t.common.unit[p.unit])).join(', ')} />
              <Fact label={s.fGst} value={uniq(g.rows.map((p) => (p.gst_rate == null ? '—' : `${qty(p.gst_rate)}%`))).join(', ')} />
              <Fact label={s.fHs} value={uniq(g.rows.map((p) => p.hs_code)).join(', ')} />
              <Fact label={s.fHsn} value={uniq(g.rows.map((p) => p.hsn_code)).join(', ')} />
            </dl>
          </Panel>
          <div className="space-y-4">
            <Panel title={s.gradesHeading} sub={s.gradesSub}>{gradesTable}</Panel>
            <Panel title={s.packagingHeading} sub={s.packagingSub}>{packagingList}</Panel>
          </div>
        </div>
      )}
      {tab === 'grades' && <Panel title={s.gradesHeading} sub={s.gradesSub}>{gradesTable}</Panel>}
      {tab === 'packaging' && <Panel title={s.packagingHeading} sub={s.packagingSub}>{packagingList}</Panel>}
      {tab === 'pricing' && <Panel title={s.pricingHeading}>{pricing}</Panel>}
    </div>
  );
}
