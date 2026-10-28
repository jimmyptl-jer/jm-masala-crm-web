/**
 * Detail sheet of one discovered company (opened from the Buyer finder): grade and score with the breakdown of why, contact details,
 * status buttons (shortlist / reject), notes, "Make this a lead" (creates a CRM buyer) or "Open in CRM", monthly volume, who the
 * company buys from (the competition), where it ships from, and its shipment list.
 * API: GET /trade/buyers/:id (key ['trade', 'buyer', id]); PATCH /trade/buyers/:id (status, notes); POST /trade/buyers/:id/convert.
 * Changes refresh ['trade'] and the CRM buyer lists. Used by components/trade/BuyersTab.tsx.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Mail, Phone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GradeBadge } from '@/components/trade/GradeBadge';
import { Button, ErrorNote, Sheet, Spinner, Textarea, errorMessage, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { TradeBuyerDetail, TradeStatus } from '@/lib/types';
import { t } from '@/strings';

const m = t.ti;

/** @param props.id — the company to show, or null when closed. @param props.onClose — close handler. */
export function BuyerSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['trade', 'buyer', id], queryFn: () => api.get<TradeBuyerDetail>(`/trade/buyers/${id}`), enabled: !!id });
  const d = q.data;
  const [notes, setNotes] = useState('');
  useEffect(() => { if (d) setNotes(d.company.notes ?? ''); }, [d]);

  /** Refreshes everything that shows this company or the CRM. */
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['trade'] }), qc.invalidateQueries({ queryKey: ['buyers'] }),
  ]);
  const patch = useMutation({
    mutationFn: (body: { status?: TradeStatus; notes?: string | null }) => api.patch(`/trade/buyers/${id}`, body),
    onSuccess: async (_r, v) => { await refresh(); if ('notes' in v) toast(m.notesSaved); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const convert = useMutation({
    mutationFn: () => api.post<{ buyer_id: string; created: boolean }>(`/trade/buyers/${id}/convert`),
    onSuccess: async (r) => { await refresh(); toast(r.created ? m.converted : m.linked); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const maxMonth = d ? Math.max(1, ...d.monthly.map((x) => x.qty_kg)) : 1;
  const crmId = d?.crm_buyer?.id ?? d?.company.buyer_id ?? null;

  return (
    <Sheet wide open={!!id} onClose={onClose} title={d?.company.name ?? m.buyersHeading}>
      {q.isPending && <Spinner />}
      {q.isError && <ErrorNote error={q.error} onRetry={() => void q.refetch()} />}
      {d && (
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <GradeBadge grade={d.grade} score={d.score} />
            <div className="min-w-0 flex-1">
              <div className="text-base text-fg-secondary">{[d.company.country, m.roles[d.company.role]].filter(Boolean).join(' · ')}</div>
              <div className="text-sm text-fg-muted">{m.statuses[d.company.status]} · {d.company.source}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {d.company.email && <a className="tap inline-flex items-center gap-1 rounded-lg border border-forest-900/25 px-3 text-sm font-semibold text-forest-900" href={`mailto:${d.company.email}`}><Mail className="h-4 w-4" aria-hidden />{d.company.email}</a>}
                {d.company.phone && <a className="tap inline-flex items-center gap-1 rounded-lg border border-forest-900/25 px-3 text-sm font-semibold text-forest-900" href={`tel:${d.company.phone.replace(/[^\d+]/g, '')}`}><Phone className="h-4 w-4" aria-hidden />{d.company.phone}</a>}
                {d.company.website && <a className="tap inline-flex items-center gap-1 rounded-lg border border-forest-900/25 px-3 text-sm font-semibold text-forest-900" href={/^https?:/i.test(d.company.website) ? d.company.website : `https://${d.company.website}`} target="_blank" rel="noopener noreferrer"><Globe className="h-4 w-4" aria-hidden />{d.company.website}</a>}
                {d.company.contact_name && <span className="inline-flex min-h-[44px] items-center text-sm text-fg-secondary">{d.company.contact_name}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {crmId ? (
              <Link to={`/buyers/${crmId}`} className="tap inline-flex items-center rounded-lg bg-forest-900 px-4 text-base font-semibold text-white">{m.openCrm}</Link>
            ) : (
              <Button loading={convert.isPending} onClick={() => convert.mutate()}>{m.convert}</Button>
            )}
            {d.company.status !== 'shortlisted' && d.company.status !== 'converted' && <Button variant="secondary" onClick={() => patch.mutate({ status: 'shortlisted' })}>{m.markShortlisted}</Button>}
            {d.company.status !== 'rejected' && d.company.status !== 'converted' && <Button variant="secondary" onClick={() => patch.mutate({ status: 'rejected' })}>{m.markRejected}</Button>}
            {(d.company.status === 'rejected' || d.company.status === 'shortlisted') && <Button variant="secondary" onClick={() => patch.mutate({ status: 'new' })}>{m.markNew}</Button>}
          </div>

          {d.grade !== '-' && (
            <section>
              <h3 className="mb-1 text-[17px] font-bold leading-6 text-ink">{m.scoreHeading}</h3>
              <ul className="space-y-1">
                {(Object.keys(d.parts) as (keyof typeof d.parts)[]).map((k) => (
                  <li key={k} className="grid grid-cols-[minmax(8rem,12rem)_1fr_3.5rem] items-center gap-3 text-sm">
                    <span>{m.scoreParts[k]}</span>
                    <span className="h-3 overflow-hidden rounded bg-cream-100"><span className="block h-full rounded bg-forest-700" style={{ width: `${(d.parts[k] / m.scoreMax[k]) * 100}%` }} /></span>
                    <span className="text-right tabular-nums text-fg-secondary">{d.parts[k]} / {m.scoreMax[k]}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-sm text-fg-muted">{m.scoreNote}</p>
            </section>
          )}

          <section>
            <Textarea label={m.notes} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button variant="secondary" className="mt-2" loading={patch.isPending && patch.variables && 'notes' in patch.variables} disabled={notes === (d.company.notes ?? '')} onClick={() => patch.mutate({ notes: notes.trim() || null })}>{m.saveNotes}</Button>
          </section>

          {d.monthly.length > 0 && (
            <section>
              <h3 className="mb-1 text-[17px] font-bold leading-6 text-ink">{m.monthlyHeading}</h3>
              <div className="flex h-24 items-end gap-1" role="img" aria-label={m.monthlyHeading}>
                {d.monthly.map((x) => (
                  <div key={x.month} className="flex-1" title={`${x.month}: ${m.kg(x.qty_kg)}`}>
                    <div className="rounded-t bg-forest-700" style={{ height: `${Math.max(4, (x.qty_kg / maxMonth) * 88)}px` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-fg-muted"><span>{d.monthly[0]!.month}</span><span>{d.monthly.at(-1)!.month}</span></div>
            </section>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {d.suppliers.length > 0 && (
              <section>
                <h3 className="text-[17px] font-bold leading-6 text-ink">{m.suppliersHeading}</h3>
                <p className="mb-1 text-sm text-fg-muted">{m.suppliersHint}</p>
                <ul className="divide-y divide-cream-200">
                  {d.suppliers.slice(0, 8).map((s) => <li key={s.name} className="flex items-baseline justify-between gap-3 py-1.5 text-sm"><span className="min-w-0 break-words">{s.name}</span><span className="shrink-0 text-fg-secondary">{m.ship(s.shipments)} · {m.kg(s.qty_kg)}</span></li>)}
                </ul>
              </section>
            )}
            {d.origins.length > 0 && (
              <section>
                <h3 className="mb-1 text-[17px] font-bold leading-6 text-ink">{m.originsHeading}</h3>
                <ul className="divide-y divide-cream-200">
                  {d.origins.slice(0, 8).map((s) => <li key={s.name} className="flex items-baseline justify-between gap-3 py-1.5 text-sm"><span>{s.name}</span><span className="text-fg-secondary">{m.ship(s.shipments)} · {m.kg(s.qty_kg)}</span></li>)}
                </ul>
              </section>
            )}
          </div>

          {d.shipments.length > 0 && (
            <section>
              <h3 className="text-[17px] font-bold leading-6 text-ink">{m.shipmentsHeading}</h3>
              <p className="mb-1 text-sm text-fg-muted">{m.shownOf(d.shipments.length)}</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead><tr className="border-b border-cream-200 text-fg-muted"><th className="py-1.5 pr-2 font-medium">{m.colDate}</th><th className="px-2 font-medium">{m.colProduct}</th><th className="px-2 text-right font-medium">{m.colQty}</th><th className="px-2 font-medium">{m.colOrigin}</th><th className="px-2 font-medium">{m.colSupplier}</th></tr></thead>
                  <tbody>
                    {d.shipments.map((s) => (
                      <tr key={s.id} className="border-b border-cream-200 last:border-0">
                        <td className="py-1.5 pr-2 whitespace-nowrap">{s.shipment_date ? date(s.shipment_date) : '—'}{s.is_estimate && <span className="ml-1 text-xs text-amber-700">({m.estimate})</span>}</td>
                        <td className="px-2">{s.description ?? s.hs6 ?? '—'}</td>
                        <td className="px-2 text-right tabular-nums">{s.quantity_kg ? m.kg(s.quantity_kg) : '—'}</td>
                        <td className="px-2">{s.origin_country ?? '—'}</td>
                        <td className="px-2">{s.supplier_name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}
