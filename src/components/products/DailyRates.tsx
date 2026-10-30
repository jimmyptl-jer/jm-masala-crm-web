/**
 * Daily rates: the per-kg price list, shown on the Daily rates page (/daily-rates), as the "Daily rates" tab of the Products & Pricing page and
 * as the Daily rates tab of the dashboard (`embedded`). It lists product by product: a heading band with the product name, and below it one row per
 * active grade with its price per kilogram in USD and INR, the date the rate was last set and a History button. An administrator edits the rates in place (the rows that
 * changed are highlighted) and saves them all together with PUT /daily-rates; everyone else sees them read-only. The rates are the same two
 * fields the product form edits (ref_rate_usd, ref_rate_inr), so this tab and the Products page always agree. "Add grade" opens the product's
 * own edit page and "Add product" the new-product page.
 * API: GET /products (useProducts, key ['products', opts]), PUT /daily-rates, GET /products/:id/rate-history (useRateHistory).
 */
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { History, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { group } from '@/components/products/shared';
import { Button, EmptyState, ErrorNote, Sheet, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useDebounced, useProducts, useRateHistory } from '@/lib/hooks';
import { isApprovedProduct } from '@/lib/products';
import type { Product } from '@/lib/types';
import { t } from '@/strings';

const s = t.products;
const numberOk = (v: string) => /^\d*(\.\d{0,2})?$/.test(v);
const CELL = 'border-t border-line px-3 py-2.5';
const input = 'h-10 w-28 rounded-lg border border-line-strong bg-surface px-2 text-right text-sm tabular-nums text-ink placeholder:text-ink-placeholder focus:border-paprika focus:outline-none focus:ring-2 focus:ring-paprika/20';

interface Draft { usd: string; inr: string }
const draftOf = (p: Product): Draft => ({ usd: p.ref_rate_usd ?? '', inr: p.ref_rate_inr ?? '' });
const gradeLabel = (p: Product) => p.grade ?? p.name;

/** Sheet with the day-by-day rates of one grade. */
function HistorySheet({ grade, onClose }: { grade: Product | null; onClose: () => void }) {
  const history = useRateHistory(grade?.id ?? null);
  return (
    <Sheet open={!!grade} onClose={onClose} title={grade ? s.dailyHistoryTitle(`${grade.name} · ${gradeLabel(grade)}`) : s.dailyHistory}>
      {history.isPending ? <Spinner /> : history.isError ? <ErrorNote error={history.error} onRetry={() => void history.refetch()} /> : history.data.length === 0 ? <p className="text-sm text-ink-muted">{s.dailyHistoryNone}</p> : (
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted"><th className="py-2 font-medium">{s.dailySet}</th><th className="py-2 text-right font-medium">{s.dailyUsd}</th><th className="py-2 text-right font-medium">{s.dailyInr}</th><th className="py-2 pl-4 font-medium">{s.dailyBy}</th></tr></thead>
          <tbody>{history.data.map((h) => (
            <tr key={h.date} className="border-b border-line">
              <td className="py-2 whitespace-nowrap text-ink">{date(h.date)}</td>
              <td className="py-2 text-right tabular-nums">{money(h.ref_rate_usd, 'USD')}</td>
              <td className="py-2 text-right tabular-nums">{money(h.ref_rate_inr, 'INR')}</td>
              <td className="py-2 pl-4 text-ink-secondary">{h.set_by_name}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </Sheet>
  );
}

/** @param embedded inside another card (the dashboard tab): no card border of its own. */
export function DailyRates({ embedded }: { embedded?: boolean } = {}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const query = useProducts({ archived: 'false' });
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);
  const [history, setHistory] = useState<Product | null>(null);
  const needle = useDebounced(search.trim().toLowerCase(), 250);

  const rows = useMemo(() => (query.data ?? []).filter((p) => isApprovedProduct(p.name)), [query.data]);
  const groups = useMemo(() => group(rows.filter((p) => !needle || `${p.name} ${p.grade ?? ''}`.toLowerCase().includes(needle))), [rows, needle]);
  const byId = useMemo(() => new Map(rows.map((p) => [p.id, p])), [rows]);
  /** The rows whose typed rates differ from the saved ones. */
  const changed = Object.entries(edits).filter(([id, e]) => { const p = byId.get(id); return !!p && (e.usd !== (p.ref_rate_usd ?? '') || e.inr !== (p.ref_rate_inr ?? '')); });

  const value = (p: Product): Draft => edits[p.id] ?? draftOf(p);
  const set = (p: Product, patch: Partial<Draft>) => setEdits((cur) => ({ ...cur, [p.id]: { ...(cur[p.id] ?? draftOf(p)), ...patch } }));

  async function save() {
    if (busy) return;
    if (changed.length === 0) { toast(s.dailyUnchanged); return; }
    setBusy(true);
    setFatal(null);
    try {
      await api.put('/daily-rates', { rates: changed.map(([id, e]) => ({ id, ref_rate_usd: e.usd.trim(), ref_rate_inr: e.inr.trim() })) });
      await qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['rate-history'] });
      toast(s.dailySaved(changed.length));
      setEdits({});
    } catch (e) { setFatal(e); } finally { setBusy(false); }
  }

  return (
    <section className={clsx('min-w-0', !embedded && 'card')} aria-labelledby="daily-rates-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div><h2 id="daily-rates-heading" className="text-lg font-bold tracking-tight text-ink">{s.dailyTitle}</h2><p className="max-w-2xl text-sm text-ink-muted">{s.dailySub}</p>{!isAdmin && <p className="mt-1 text-xs text-ink-muted">{s.dailyAdminOnly}</p>}</div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link to="/products/new" className="tap inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-hover"><Plus className="h-4 w-4" aria-hidden />{s.dailyAddProduct}</Link>
            <Button variant="ghost" disabled={changed.length === 0 || busy} onClick={() => setEdits({})}>{s.dailyDiscard}</Button>
            <Button loading={busy} disabled={changed.length === 0} onClick={() => void save()}>{s.dailySave(changed.length)}</Button>
          </div>
        )}
      </div>
      <div className="border-b border-line p-4">
        <label className="relative block max-w-md"><span className="sr-only">{s.dailySearch}</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={s.dailySearch} className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-10 pr-3 text-sm text-ink placeholder:text-ink-placeholder focus:border-paprika focus:outline-none focus:ring-2 focus:ring-paprika/20" /></label>
      </div>
      {fatal !== null && <div className="p-4"><ErrorNote error={fatal} /></div>}

      {query.isPending ? <Spinner /> : query.isError ? <div className="p-4"><ErrorNote error={query.error} onRetry={() => void query.refetch()} /></div> : groups.length === 0 ? (
        <div className="px-4 py-12"><EmptyState title={needle ? s.dailyNoMatch : s.dailyNone} /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-surface-muted"><tr className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              <th className="px-4 py-3">{s.dailyGrade}</th><th className="px-3 py-3 text-right">{s.dailyUsd}</th><th className="px-3 py-3 text-right">{s.dailyInr}</th><th className="px-3 py-3">{s.dailySet}</th><th className="px-3 py-3 text-right">{s.dailyActions}</th>
            </tr></thead>
            {groups.map((g) => (
              <tbody key={g.name}>
                <tr className="bg-surface-muted/60">
                  <th scope="colgroup" colSpan={5} className="border-t border-line px-4 py-2.5 text-left">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Link to={`/products/${encodeURIComponent(g.name)}`} className="text-[15px] font-bold text-ink hover:underline">{g.name}</Link>
                      <span className="text-xs font-medium text-ink-muted">{s.grades(g.rows.length)}</span>
                      {isAdmin && <Link to={`/products/${encodeURIComponent(g.name)}/edit`} className="ml-auto text-xs font-semibold text-paprika hover:underline">{s.dailyAddGrade}</Link>}
                    </span>
                  </th>
                </tr>
                {g.rows.map((p) => {
                  const v = value(p);
                  const dirty = v.usd !== (p.ref_rate_usd ?? '') || v.inr !== (p.ref_rate_inr ?? '');
                  return (
                    <tr key={p.id} className={clsx('bg-surface', dirty && 'bg-warning-bg/40')}>
                      <td className={clsx(CELL, 'pl-8 text-ink')}>{gradeLabel(p)}{p.status === 'draft' && <span className="ml-2 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning-ink">{s.dailyDraft}</span>}</td>
                      {(['usd', 'inr'] as const).map((k) => (
                        <td key={k} className={clsx(CELL, 'text-right')}>
                          {isAdmin
                            ? <input inputMode="decimal" placeholder="0.00" value={v[k]} aria-label={s.dailyRateAria(k === 'usd' ? s.dailyUsd : s.dailyInr, `${g.name} ${gradeLabel(p)}`)} className={input}
                                onChange={(e) => { const x = e.target.value.replace(',', '.'); if (numberOk(x)) set(p, { [k]: x }); }} />
                            : <span className="tabular-nums">{money(k === 'usd' ? p.ref_rate_usd : p.ref_rate_inr, k === 'usd' ? 'USD' : 'INR')}</span>}
                        </td>
                      ))}
                      <td className={clsx(CELL, 'whitespace-nowrap text-ink-secondary')}>{p.rate_date ? date(p.rate_date) : s.dailyNever}</td>
                      <td className={clsx(CELL, 'text-right')}><Button variant="ghost" aria-label={`${s.dailyHistory}: ${g.name} ${gradeLabel(p)}`} onClick={() => setHistory(p)}><History className="h-4 w-4" aria-hidden />{s.dailyHistory}</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <HistorySheet grade={history} onClose={() => setHistory(null)} />
    </section>
  );
}
