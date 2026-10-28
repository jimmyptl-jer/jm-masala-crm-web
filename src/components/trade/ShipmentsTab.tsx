/**
 * Trade Intelligence > Shipments: the shipment explorer. Individual shipment records from the imported files, newest first, with
 * filters (company / supplier / product text, importer country, origin country, product HS code, date range) and the totals
 * (shipments, quantity, value) of everything that matches. Records marked "estimate" are not taken from a shipment document.
 * API: GET /trade/shipments (key ['trade', 'shipments', filters]; search debounced; "Show more" raises the limit) and GET /trade/hs
 * for the product list. Used by pages/Intelligence.tsx.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorNote, Input, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { HsCode, TradeShipmentRow } from '@/lib/types';
import { t } from '@/strings';

const m = t.ti;
const PAGE = 50;

/** The Shipments tab; see the file comment. */
export function ShipmentsTab() {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [origin, setOrigin] = useState('');
  const [hs6, setHs6] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const dq = useDebounced(q.trim(), 300);
  const dc = useDebounced(country.trim(), 400);
  const dorigin = useDebounced(origin.trim(), 400);

  const hs = useQuery({ queryKey: ['trade', 'hs'], queryFn: () => api.get<{ data: HsCode[] }>('/trade/hs').then((r) => r.data) });
  const qs = new URLSearchParams();
  if (dq) qs.set('q', dq);
  if (dc) qs.set('country', dc);
  if (dorigin) qs.set('origin', dorigin);
  if (hs6) qs.set('hs6', hs6);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  qs.set('limit', String(limit));
  const list = useQuery({
    queryKey: ['trade', 'shipments', qs.toString()],
    queryFn: () => api.get<{ total: number; qty_kg: number; value_usd: number; rows: TradeShipmentRow[] }>(`/trade/shipments?${qs.toString()}`),
    placeholderData: keepPreviousData,
  });
  const d = list.data;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[17px] font-bold leading-6 text-ink">{m.shipmentsTabHeading}</h2>
        <p className="max-w-2xl text-sm text-fg-muted">{m.shipmentsTabHint}</p>
      </div>
      <Card className="space-y-3 p-4">
        <Input label={m.filterText} type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} autoComplete="off" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Input label={m.country} value={country} onChange={(e) => { setCountry(e.target.value); setLimit(PAGE); }} />
          <Input label={m.filterOrigin} value={origin} onChange={(e) => { setOrigin(e.target.value); setLimit(PAGE); }} />
          <Select label={m.filterHs} value={hs6} onChange={(e) => { setHs6(e.target.value); setLimit(PAGE); }}>
            <option value="">{m.all}</option>
            {(hs.data ?? []).filter((h) => h.shipment_rows > 0).map((h) => <option key={h.hs6} value={h.hs6}>{h.product_name ?? h.label} ({h.hs6})</option>)}
          </Select>
          <Input label={m.filterFrom} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setLimit(PAGE); }} />
          <Input label={m.filterTo} type="date" value={to} onChange={(e) => { setTo(e.target.value); setLimit(PAGE); }} />
        </div>
      </Card>

      {d && <p className="text-sm font-medium text-fg-secondary" aria-live="polite">{m.totalsLine(d.total, m.kg(d.qty_kg), m.usd(d.value_usd))}</p>}
      {list.isPending ? <Spinner /> : list.isError ? <ErrorNote error={list.error} onRetry={() => void list.refetch()} /> : d && d.rows.length === 0 ? (
        <Card><EmptyState title={m.noData}>{m.noDataHint}</EmptyState></Card>
      ) : (
        <Card className="p-2 md:p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-cream-200 text-fg-muted">
                  <th className="py-2 pr-2 font-medium">{m.colDate}</th><th className="px-2 font-medium">{m.colCompany}</th><th className="px-2 font-medium">{m.colProduct}</th>
                  <th className="px-2 text-right font-medium">{m.colQty}</th><th className="px-2 text-right font-medium">{m.colValue}</th>
                  <th className="px-2 font-medium">{m.colOrigin}</th><th className="px-2 font-medium">{m.colDest}</th><th className="px-2 font-medium">{m.colSupplier}</th>
                </tr>
              </thead>
              <tbody>
                {d?.rows.map((s) => (
                  <tr key={s.id} className="border-b border-cream-200 align-top last:border-0">
                    <td className="whitespace-nowrap py-2 pr-2">{s.shipment_date ? date(s.shipment_date) : '—'}{s.is_estimate && <span className="ml-1 text-xs text-amber-700">({m.estimate})</span>}</td>
                    <td className="px-2 font-semibold text-forest-900">{s.company_name}<div className="text-xs font-normal text-fg-muted">{s.company_country}</div></td>
                    <td className="px-2">{s.description ?? '—'}<div className="text-xs text-fg-muted">{s.hs6}</div></td>
                    <td className="whitespace-nowrap px-2 text-right tabular-nums">{s.quantity_kg ? m.kg(s.quantity_kg) : '—'}</td>
                    <td className="whitespace-nowrap px-2 text-right tabular-nums">{s.value_usd ? m.usd(s.value_usd) : '—'}</td>
                    <td className="px-2">{s.origin_country ?? '—'}<div className="text-xs text-fg-muted">{s.origin_port}</div></td>
                    <td className="px-2">{s.destination_country ?? '—'}<div className="text-xs text-fg-muted">{s.destination_port}</div></td>
                    <td className="px-2">{s.supplier_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {d && d.total > d.rows.length && <div className="text-center"><Button variant="secondary" loading={list.isFetching} onClick={() => setLimit((n) => n + PAGE)}>{m.loadMore}</Button></div>}
    </div>
  );
}
