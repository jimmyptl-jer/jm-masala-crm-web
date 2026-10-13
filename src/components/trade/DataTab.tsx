/**
 * Trade Intelligence > Data: where data comes IN. Three import cards (market statistics, shipment records, company list), each with a
 * template download, a "Check the file" step that shows what the file contains and which rows will be skipped (nothing is saved),
 * and an Import button. Below: the import history with Undo, the tracked HS codes, and a guide to the official sites that publish
 * trade statistics (government sites give country totals; named buyers need a licensed provider).
 * API: POST /trade/imports/:kind?mode=dry|commit (multipart file + source, value_unit, qty_unit, hs6), GET /trade/imports/template/:kind,
 * GET /trade/imports and DELETE /trade/imports/:id (history, undo), GET /trade/hs and PUT /trade/hs/:hs6 (tracked codes).
 * Every successful change refreshes ['trade']. Used by pages/Intelligence.tsx.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button, Card, ErrorNote, Input, Select, Spinner, errorMessage, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { HsCode, ImportKind, TradeImportReport, TradeImportRow } from '@/lib/types';
import { t } from '@/strings';
import { DATA_SOURCES } from '@/strings/trade';

const m = t.ti;
const MAX_SHOWN = 8;

/** One import card for one kind of file. */
function ImportCard({ kind, hsCodes }: { kind: ImportKind; hsCodes: HsCode[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState('');
  const [valueUnit, setValueUnit] = useState('auto');
  const [qtyUnit, setQtyUnit] = useState('auto');
  const [hs6, setHs6] = useState('');
  const [report, setReport] = useState<TradeImportReport | null>(null);
  const [done, setDone] = useState('');
  const def = m.kinds[kind];

  /** Sends the file; `mode` 'dry' only checks it, 'commit' saves it. */
  const send = useMutation({
    mutationFn: (mode: 'dry' | 'commit') => api.upload<TradeImportReport>(`/trade/imports/${kind}?mode=${mode}`, file!, {
      source: source.trim(), value_unit: valueUnit, qty_unit: qtyUnit, ...(kind === 'stats' && hs6 ? { hs6 } : {}),
    }),
    onSuccess: async (r) => {
      setReport(r);
      if (r.mode === 'commit') {
        setDone(m.imported(r.saved, r.duplicates));
        setFile(null); setReport(null);
        if (input.current) input.current.value = '';
        await qc.invalidateQueries({ queryKey: ['trade'] });
        toast(m.imported(r.saved, r.duplicates));
      } else setDone('');
    },
    onError: (e) => { setReport(null); setDone(''); toast(errorMessage(e), 'error'); },
  });
  const template = useMutation({ mutationFn: () => api.download(`/trade/imports/template/${kind}`, `trade-${kind}-template.xlsx`), onError: (e) => toast(errorMessage(e), 'error') });

  const pick = (f: File | undefined) => { setFile(f ?? null); setReport(null); setDone(''); if (f && !source) setSource(f.name.replace(/\.[^.]+$/, '')); };

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="font-serif text-xl font-semibold text-forest-900">{def.title}</h3>
        <p className="text-sm text-ink/60">{def.text}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="secondary" onClick={() => input.current?.click()}>{file ? file.name : m.chooseFile}</Button>
        <button type="button" onClick={() => template.mutate()} className="tap text-sm font-semibold text-forest-800 underline">{def.template}</button>
      </div>
      {file && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={m.sourceName} value={source} onChange={(e) => setSource(e.target.value)} placeholder={m.sourcePlaceholder} />
            {kind === 'stats' && (
              <Select label={m.hsForFile} value={hs6} onChange={(e) => setHs6(e.target.value)}>
                <option value="">{m.hsFromFile}</option>
                {hsCodes.filter((h) => h.tracked).map((h) => <option key={h.hs6} value={h.hs6}>{h.product_name ?? h.label} ({h.hs6})</option>)}
              </Select>
            )}
            {kind !== 'companies' && (
              <>
                <Select label={m.valueUnit} value={valueUnit} onChange={(e) => setValueUnit(e.target.value)}>
                  {Object.entries(m.valueUnits).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
                <Select label={m.qtyUnit} value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value)}>
                  {Object.entries(m.qtyUnits).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </>
            )}
          </div>
          <Button loading={send.isPending && send.variables === 'dry'} onClick={() => send.mutate('dry')}>{send.isPending && send.variables === 'dry' ? m.checking : m.checkFile}</Button>
        </>
      )}

      {report && (
        <div className="space-y-3 rounded-lg border border-forest-900/15 bg-cream-50 p-3">
          <p className="font-semibold text-forest-900">{m.checked}</p>
          <p className="text-sm text-ink/80">{m.rowsRead(report.total)} · {m.rowsOk(report.valid)}{report.errors.length > 0 && <> · <span className="font-semibold text-red-700">{m.rowsProblems(report.errors.length)}</span></>}</p>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {Object.entries(report.summary).map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-cream-200 py-0.5"><dt className="text-ink/60">{k}</dt><dd className="text-right font-medium tabular-nums">{String(v)}</dd></div>)}
          </dl>
          {report.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-800">{m.problemsTitle}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-red-800">
                {report.errors.slice(0, MAX_SHOWN).map((e, i) => <li key={i}>{m.rowN(e.row)}: {e.message}</li>)}
                {report.errors.length > MAX_SHOWN && <li>{m.moreProblems(report.errors.length - MAX_SHOWN)}</li>}
              </ul>
            </div>
          )}
          {report.preview.length > 0 && (
            <details>
              <summary className="tap cursor-pointer text-sm font-medium text-forest-800">{m.previewTitle}</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-white p-2 text-xs">{report.preview.map((r) => JSON.stringify(r)).join('\n')}</pre>
            </details>
          )}
          <Button disabled={report.valid === 0} loading={send.isPending && send.variables === 'commit'} onClick={() => send.mutate('commit')}>{send.isPending && send.variables === 'commit' ? m.importing : m.importNow}</Button>
        </div>
      )}
      {done && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">{done}</p>}
    </Card>
  );
}

/** The Data tab; see the file comment. */
export function DataTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const hsQ = useQuery({ queryKey: ['trade', 'hs'], queryFn: () => api.get<{ data: HsCode[] }>('/trade/hs').then((r) => r.data) });
  const hist = useQuery({ queryKey: ['trade', 'imports'], queryFn: () => api.get<{ data: TradeImportRow[] }>('/trade/imports').then((r) => r.data) });
  const undo = useMutation({
    mutationFn: (id: string) => api.del(`/trade/imports/${id}`),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['trade'] }); toast(m.undone); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const saveHs = useMutation({
    mutationFn: (v: { hs6: string; label?: string; product_name?: string | null; tracked?: boolean }) => api.put(`/trade/hs/${v.hs6}`, { label: v.label, product_name: v.product_name, tracked: v.tracked }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['trade'] }); toast(m.hsSaved); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const [newHs, setNewHs] = useState({ hs6: '', label: '', product: '' });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-forest-900 md:text-2xl">{m.dataHeading}</h2>
        <p className="max-w-3xl text-sm text-ink/60">{m.dataHint}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {(['stats', 'shipments', 'companies'] as const).map((k) => <ImportCard key={k} kind={k} hsCodes={hsQ.data ?? []} />)}
      </div>

      <Card className="p-4">
        <h3 className="font-serif text-xl font-semibold text-forest-900">{m.historyHeading}</h3>
        {hist.isPending ? <Spinner /> : hist.isError ? <ErrorNote error={hist.error} onRetry={() => void hist.refetch()} /> : (hist.data ?? []).length === 0 ? <p className="mt-2 text-base text-ink/60">{m.historyEmpty}</p> : (
          <ul className="mt-2 divide-y divide-cream-200">
            {(hist.data ?? []).map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="break-words font-semibold text-forest-900">{h.source}</div>
                  <div className="text-sm text-ink/60">{m.kinds[h.kind].title} · {h.filename} · {dateTime(h.created_at)}{h.created_by_name ? ` · ${h.created_by_name}` : ''}</div>
                </div>
                <div className="text-sm tabular-nums text-ink/80">{h.rows_saved.toLocaleString('en-US')} / {h.rows_total.toLocaleString('en-US')}</div>
                <Button variant="secondary" loading={undo.isPending && undo.variables === h.id} onClick={() => { if (window.confirm(m.undoAsk)) undo.mutate(h.id); }}>{m.undo}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="font-serif text-xl font-semibold text-forest-900">{m.hsHeading}</h3>
        <p className="mb-2 max-w-3xl text-sm text-ink/60">{m.hsHint}</p>
        {hsQ.isPending ? <Spinner /> : (
          <ul className="grid gap-x-6 md:grid-cols-2">
            {(hsQ.data ?? []).map((h) => (
              <li key={h.hs6} className="flex items-center gap-3 border-b border-cream-200 py-1.5">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-forest-700" aria-label={`${m.hsTracked}: ${h.hs6}`} checked={h.tracked} onChange={(e) => saveHs.mutate({ hs6: h.hs6, tracked: e.target.checked })} />
                <div className="min-w-0 flex-1">
                  <div className="text-base text-forest-900"><span className="font-semibold tabular-nums">{h.hs6}</span> · {h.product_name ?? '—'}</div>
                  <div className="truncate text-xs text-ink/60">{h.label} · {m.hsRows(h.stats_rows, h.shipment_rows)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); saveHs.mutate({ hs6: newHs.hs6.trim(), label: newHs.label.trim() || undefined, product_name: newHs.product.trim() || null }, { onSuccess: () => setNewHs({ hs6: '', label: '', product: '' }) }); }}>
          <Input label={m.hsCode} inputMode="numeric" maxLength={6} value={newHs.hs6} onChange={(e) => setNewHs((x) => ({ ...x, hs6: e.target.value.replace(/\D/g, '') }))} />
          <Input label={m.hsLabel} value={newHs.label} onChange={(e) => setNewHs((x) => ({ ...x, label: e.target.value }))} />
          <Input label={m.hsProduct} value={newHs.product} onChange={(e) => setNewHs((x) => ({ ...x, product: e.target.value }))} />
          <Button type="submit" variant="secondary" loading={saveHs.isPending} disabled={newHs.hs6.length !== 6 || !newHs.label.trim()}>{m.hsAdd}</Button>
        </form>
      </Card>

      <Card className="p-4">
        <h3 className="font-serif text-xl font-semibold text-forest-900">{m.guideHeading}</h3>
        <p className="mb-3 max-w-3xl text-sm text-ink/60">{m.guideHint}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b border-cream-200 text-ink/60"><th className="py-2 pr-3 font-medium">{m.guideColSite}</th><th className="px-2 font-medium">{m.guideColWhat}</th><th className="px-2 font-medium">{m.guideColUse}</th><th className="py-2 pl-2" /></tr></thead>
            <tbody>
              {DATA_SOURCES.map((s) => (
                <tr key={s.name} className="border-b border-cream-200 last:border-0">
                  <th className="py-2 pr-3 font-semibold text-forest-900">{s.name}</th>
                  <td className="px-2 py-2 text-ink/80">{s.what}</td>
                  <td className="px-2 py-2">{s.use ? m.kinds[s.use].title : '—'}</td>
                  <td className="py-2 pl-2 text-right"><a href={s.url} target="_blank" rel="noopener noreferrer" className="tap font-semibold text-forest-800 underline">{m.guideOpen}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 rounded-lg bg-cream-100 px-3 py-2 text-sm text-ink/80">{m.collectorNote}</p>
      </Card>
      {(hsQ.isError) && <ErrorNote error={hsQ.error} onRetry={() => void hsQ.refetch()} />}
    </div>
  );
}
