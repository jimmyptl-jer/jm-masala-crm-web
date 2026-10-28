/**
 * Trade Intelligence > Markets: which countries import the chosen product(s) from India, how big each market is, how it is changing
 * and at what price per tonne. Tick one or more HS codes (products); numbers, a bar list of the top countries and a full table follow.
 * "Find buyers" jumps to the Buyer finder for that country.
 * API: GET /trade/hs (tracked codes) and GET /trade/market?hs6=&source= (the report; key ['trade', 'market', ...]).
 * Figures are USD and kg as sent by the API; this screen only formats and draws them. Used by pages/Intelligence.tsx.
 */
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, EmptyState, ErrorNote, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { HsCode, MarketReport } from '@/lib/types';
import { t } from '@/strings';

const m = t.ti;

/** Change in value with an arrow, green up / red down; a dash when unknown. */
function Growth({ v }: { v: number | null }) {
  if (v === null) return <span className="text-fg-muted">—</span>;
  const up = v >= 0;
  return (
    <span className={clsx('inline-flex items-center gap-1 tabular-nums', up ? 'text-emerald-700' : 'text-red-700')}>
      {up ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}{up ? '+' : ''}{v}%
    </span>
  );
}

/** @param props.onFindBuyers — called with a country name to open the Buyer finder filtered to it. */
export function MarketsTab({ onFindBuyers, onGoData }: { onFindBuyers: (country: string) => void; onGoData: () => void }) {
  const hsQ = useQuery({ queryKey: ['trade', 'hs'], queryFn: () => api.get<{ data: HsCode[] }>('/trade/hs').then((r) => r.data) });
  // chosen products; starts with the first code that has statistics (cumin, if loaded)
  const [picked, setPicked] = useState<string[] | null>(null);
  const [source, setSource] = useState('');
  const withData = (hsQ.data ?? []).filter((h) => h.tracked && h.stats_rows > 0);
  useEffect(() => {
    if (picked === null && hsQ.data) setPicked(withData.length ? [withData.find((h) => h.hs6 === '090931')?.hs6 ?? withData[0]!.hs6] : []);
  }, [hsQ.data, picked, withData]);

  const report = useQuery({
    queryKey: ['trade', 'market', picked, source],
    queryFn: () => api.get<MarketReport>(`/trade/market?hs6=${(picked ?? []).join(',')}${source ? `&source=${encodeURIComponent(source)}` : ''}`),
    enabled: picked !== null && picked.length > 0,
  });

  if (hsQ.isPending) return <Spinner />;
  if (hsQ.isError) return <ErrorNote error={hsQ.error} onRetry={() => void hsQ.refetch()} />;
  if (withData.length === 0) {
    return (
      <Card>
        <EmptyState title={m.noData}>{m.noDataHint}</EmptyState>
        <div className="px-4 pb-4 text-center"><button type="button" onClick={onGoData} className="tap font-semibold text-forest-800 underline">{m.goData}</button></div>
      </Card>
    );
  }

  const r = report.data;
  const total = r && r.latest_year ? r.totals[String(r.latest_year)] : undefined;
  const max = r ? Math.max(1, ...r.countries.slice(0, 12).map((c) => c.latest_value)) : 1;
  const flip = (hs: string) => setPicked((p) => ((p ?? []).includes(hs) ? (p ?? []).filter((x) => x !== hs) : [...(p ?? []), hs]));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-[17px] font-bold leading-6 text-ink">{m.marketsHeading}</h2>
        <p className="mb-3 text-sm text-fg-muted">{m.marketsHint}</p>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-forest-900">{m.products}</legend>
          <div className="flex flex-wrap gap-2">
            {withData.map((h) => (
              <button
                key={h.hs6} type="button" aria-pressed={(picked ?? []).includes(h.hs6)} onClick={() => flip(h.hs6)} title={h.label}
                className={clsx('min-h-[40px] rounded-full border px-3 text-sm font-medium', (picked ?? []).includes(h.hs6) ? 'border-forest-700 bg-forest-700 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}
              >
                {h.product_name ?? h.label} <span className="opacity-70">{h.hs6}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {r && r.sources.length > 1 && (
          <Select wrapperClassName="mt-3 max-w-xs" label={m.source} value={r.source ?? ''} onChange={(e) => setSource(e.target.value)}>
            {r.sources.map((s) => <option key={s.source} value={s.source}>{s.source}</option>)}
          </Select>
        )}
      </Card>

      {(picked ?? []).length === 0 && <p className="text-base text-fg-secondary">{m.products}</p>}
      {report.isPending && (picked ?? []).length > 0 && <Spinner />}
      {report.isError && <ErrorNote error={report.error} onRetry={() => void report.refetch()} />}

      {r && r.latest_year && total && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label={m.marketsHeading}>
            <div className="card p-3"><div className="text-sm text-fg-secondary">{m.kpiValue} · {r.latest_year}</div><div className="text-2xl font-bold tabular-nums text-forest-900">{m.usd(total.value)}</div></div>
            <div className="card p-3"><div className="text-sm text-fg-secondary">{m.kpiQty} · {r.latest_year}</div><div className="text-2xl font-bold tabular-nums text-forest-900">{m.kg(total.qty)}</div></div>
            <div className="card p-3"><div className="text-sm text-fg-secondary">{m.kpiPrice}</div><div className="text-2xl font-bold tabular-nums text-forest-900">{total.qty > 0 ? m.perMt(Math.round((total.value / total.qty) * 1000)) : '—'}</div></div>
            <div className="card p-3"><div className="text-sm text-fg-secondary">{m.kpiCountries}</div><div className="text-2xl font-bold tabular-nums text-forest-900">{r.countries.length}</div></div>
          </section>

          <Card className="p-4">
            <h2 className="mb-2 text-[17px] font-bold leading-6 text-ink">{m.topCountries} <span className="text-base font-normal text-fg-muted">({r.latest_year})</span></h2>
            <ul className="space-y-1.5">
              {r.countries.slice(0, 12).map((c) => (
                <li key={c.country} className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3">
                  <span className="truncate text-sm font-medium text-forest-900">{c.country}</span>
                  <span className="h-5 overflow-hidden rounded bg-cream-100"><span className="block h-full rounded bg-forest-700" style={{ width: `${Math.max(2, (c.latest_value / max) * 100)}%` }} /></span>
                  <span className="w-28 text-right text-sm tabular-nums text-fg-secondary">{m.usd(c.latest_value)}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-cream-200 text-fg-muted">
                    <th className="py-2 pr-3 font-medium">{m.colCountry}</th>
                    <th className="px-2 py-2 text-right font-medium">{m.colValue}</th>
                    <th className="px-2 py-2 text-right font-medium">{m.colQty}</th>
                    <th className="px-2 py-2 text-right font-medium">{m.colPrice}</th>
                    <th className="px-2 py-2 text-right font-medium">{m.colShare}</th>
                    <th className="px-2 py-2 text-right font-medium">{m.colGrowth}</th>
                    {r.years.slice(-4, -1).map((y) => <th key={y} className="px-2 py-2 text-right font-medium">{y}</th>)}
                    <th className="py-2 pl-2" />
                  </tr>
                </thead>
                <tbody>
                  {r.countries.map((c) => (
                    <tr key={c.country} className="border-b border-cream-200 last:border-0">
                      <th className="py-2 pr-3 font-semibold text-forest-900">{c.country}</th>
                      <td className="px-2 py-2 text-right tabular-nums">{m.usd(c.latest_value)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.latest_qty ? m.kg(c.latest_qty) : '—'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.unit_price_mt ? c.unit_price_mt.toLocaleString('en-US') : '—'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.share}%</td>
                      <td className="px-2 py-2 text-right"><Growth v={c.growth} /></td>
                      {r.years.slice(-4, -1).map((y) => <td key={y} className="px-2 py-2 text-right tabular-nums text-fg-secondary">{c.years[String(y)] ? m.usd(c.years[String(y)]!.value) : '—'}</td>)}
                      <td className="py-2 pl-2 text-right"><button type="button" onClick={() => onFindBuyers(c.country)} className="tap whitespace-nowrap font-semibold text-forest-800 underline">{m.findBuyers}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-fg-muted">{m.marketNote}</p>
          </Card>
        </>
      )}
      {r && !r.latest_year && !report.isPending && <Card><EmptyState title={m.noData}>{m.noDataHint}</EmptyState></Card>}
    </div>
  );
}
