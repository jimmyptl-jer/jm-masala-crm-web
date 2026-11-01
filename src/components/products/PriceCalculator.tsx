/**
 * The Price calculator tab of Products & Pricing (/products?tab=calculator): the business's export price sheet as a grid. Each column is a
 * quality sent from one export point at a spot rate; the rows run from the spot rate per ton down to the offer rate in dollars, in the order
 * of the Excel sheet. Below the grid are the shared rates and percentages and the expense heads of each export point. A column can carry an
 * "export expenses override": the Excel sheet's own total, which makes the column reproduce the sheet to the cent.
 * Saved sheets are the dated tabs of the Excel file: pick one, change it and Save, or start a new one from this one. The bar above the grid
 * holds the sheet's date and name, the saved-sheet picker and Save.
 * API (administrators only): GET /price-calculator/defaults (key ['price-calculator', 'defaults']) fills the standard figures; POST
 * /price-calculator (key ['price-calculator', 'calc', <body>]) answers every row of every column, sent after a short pause after each edit;
 * GET /price-calculator/sheets (key ['price-sheets', archived]), GET/POST/PUT /price-calculator/sheets[/:id], DELETE (archive) and PATCH
 * { archived } keep the saved sheets. The web app does no arithmetic: it shows what the API answers (money maths is only done by the API).
 * Inputs are text; an empty money cell counts as 0, an empty spot rate or dollar rate leaves its column out of the calculation (and blocks
 * Save until it is filled in or the column is removed).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Archive, Copy, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, ErrorNote, Spinner, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { date, dateTime, todayIST } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import {
  EXPORT_POINTS, HEAD_KEYS, PERCENT_KEYS, type Assumptions, type CalcDefaults, type CalcLineInput, type CalcLineOut, type ExpenseHeads, type ExportPoint, type PriceSheet, type PriceSheetSummary,
} from '@/lib/priceCalculator';
import { t } from '@/strings';

const s = t.calculator;

/** One column as typed. `id` only keeps React and the answers together. `override` is the export expenses override ('' = none). */
interface Column { id: number; label: string; export_point: ExportPoint; spot_rate: string; purchase_commission: string; fx_rate: string; override: string }
type Heads = Record<ExportPoint, ExpenseHeads>;

/** Everything a sheet starts from: the standard figures, or a saved sheet. */
interface Seed {
  id: string | null;
  date: string;
  name: string;
  archived: boolean;
  saved: { by: string; at: string } | null;
  assumptions: Assumptions;
  heads: Heads;
  fx: string;
  columns: Omit<Column, 'id'>[];
}

/** Text of an amount without trailing zeros ('91.7500' -> '91.75', '214000.00' -> '214000'); string work only, no arithmetic. */
const trim = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);
const mapValues = <T extends string, V>(o: Record<T, string>, f: (v: string) => V) => Object.fromEntries(Object.entries<string>(o).map(([k, v]) => [k, f(v)])) as Record<T, V>;
/** The same for every export point's expense heads. */
const mapHeads = (h: Heads, f: (v: string) => string): Heads => Object.fromEntries(EXPORT_POINTS.map((x) => [x, mapValues(h[x], f)])) as Heads;
/** An empty money cell counts as 0. */
const orZero = (v: string) => (v.trim() === '' ? '0' : v.trim());
/** Display of an amount the API answered (grouping only). */
const show = (v: string | undefined, usd = false) => (v === undefined ? '—' : Number(v).toLocaleString(usd ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const complete = (c: { spot_rate: string; fx_rate: string }) => !!c.spot_rate.trim() && !!c.fx_rate.trim();
/** One column as the API takes it. */
const toLine = (c: Omit<Column, 'id'>): CalcLineInput => ({ label: c.label.trim() || null, export_point: c.export_point, spot_rate: c.spot_rate.trim(), purchase_commission: orZero(c.purchase_commission), fx_rate: c.fx_rate.trim(), expenses_override: c.override.trim() || null });

const seedFromDefaults = (d: CalcDefaults): Seed => ({
  id: null, date: todayIST(), name: '', archived: false, saved: null, assumptions: mapValues(d.assumptions, trim) as Assumptions, heads: mapHeads(d.export_points, trim), fx: trim(d.fx_rate),
  columns: d.lines.map((l) => ({ label: l.label, export_point: l.export_point, spot_rate: trim(l.spot_rate), purchase_commission: '0', fx_rate: trim(d.fx_rate), override: '' })),
});

const seedFromSheet = (x: PriceSheet, fallbackFx: string): Seed => ({
  id: x.id, date: x.sheet_date, name: x.name ?? '', archived: x.archived, saved: { by: x.saved_by_name, at: x.updated_at }, assumptions: mapValues(x.assumptions, trim) as Assumptions,
  heads: mapHeads(x.export_points, trim), fx: trim(x.lines[0]?.fx_rate ?? fallbackFx),
  columns: x.lines.map((l) => ({ label: l.label ?? '', export_point: l.export_point, spot_rate: trim(l.spot_rate), purchase_commission: trim(l.purchase_commission), fx_rate: trim(l.fx_rate), override: l.expenses_override ? trim(l.expenses_override) : '' })),
});

/** One input of the grid: numbers only, right aligned. */
function Cell({ value, onChange, label, error, wide, placeholder }: { value: string; onChange: (v: string) => void; label: string; error?: string; wide?: boolean; placeholder?: string }) {
  return <input inputMode="decimal" value={value} aria-label={label} aria-invalid={error ? true : undefined} title={error} placeholder={placeholder}
    onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) onChange(e.target.value); }}
    className={clsx('h-9 rounded-md border bg-white px-2 text-right text-sm tabular-nums text-ink', wide ? 'w-28' : 'w-full', error ? 'border-danger-ink bg-danger-bg' : 'border-line-strong')} />;
}

const STICKY = 'sticky left-0 z-10 bg-surface';
const LABEL = 'whitespace-nowrap px-3 py-2 text-left text-sm font-medium text-ink-secondary';
const UNIT = 'ml-1 text-xs text-ink-muted';
const FIELD = 'h-9 rounded-md border border-line-strong bg-white px-2 text-sm text-ink';

/** The sheet, started from `seed` (a new `key` starts it again from another seed). */
function Sheet({ d, seed, sheets, showArchived, onShowArchived, onOpen, onNewFrom, onReset, onChanged }: {
  d: CalcDefaults; seed: Seed; sheets: PriceSheetSummary[]; showArchived: boolean; onShowArchived: (v: boolean) => void;
  onOpen: (id: string | null) => void; onNewFrom: (seed: Seed) => void; onReset: () => void; onChanged: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const nextId = useRef(0);
  const newColumn = (c: Omit<Column, 'id'>): Column => ({ ...c, id: nextId.current++ });
  const [id, setId] = useState(seed.id);
  const [sheetDate, setSheetDate] = useState(seed.date);
  const [name, setName] = useState(seed.name);
  const [archived, setArchived] = useState(seed.archived);
  const [saved, setSaved] = useState(seed.saved);
  const [assumptions, setAssumptions] = useState<Assumptions>(seed.assumptions);
  const [heads, setHeads] = useState<Heads>(seed.heads);
  const [fxAll, setFxAll] = useState(seed.fx);
  const [columns, setColumns] = useState<Column[]>(() => seed.columns.map(newColumn));
  const [breakdown, setBreakdown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const [saveFields, setSaveFields] = useState<Record<string, string>>({});

  const setColumn = (cid: number, patch: Partial<Column>) => setColumns((cs) => cs.map((c) => (c.id === cid ? { ...c, ...patch } : c)));
  const setFx = (v: string) => { setFxAll(v); setColumns((cs) => cs.map((c) => ({ ...c, fx_rate: v }))); };

  // the whole sheet as typed, to tell whether it differs from what was saved
  const snapshot = JSON.stringify({ sheetDate, name, assumptions, heads, columns: columns.map(({ id: _id, ...c }) => c) });
  // the baseline is how the sheet started (a saved sheet as opened, a new one as seeded), so only a real edit asks "continue without saving?"
  const [savedSnapshot, setSavedSnapshot] = useState<string>(snapshot);
  const dirty = snapshot !== savedSnapshot;

  // what is calculated: the complete columns, with the ids that put the answers (and the field errors) back on the right column
  const request = useMemo(() => {
    const ready = columns.filter(complete);
    return JSON.stringify({
      ids: ready.map((c) => c.id),
      body: { assumptions: mapValues(assumptions, orZero), export_points: mapHeads(heads, orZero), lines: ready.map(toLine) },
    });
  }, [columns, assumptions, heads]);
  const delayed = useDebounced(request, 350);
  const sent = useMemo(() => JSON.parse(delayed) as { ids: number[]; body: object }, [delayed]);
  const calc = useQuery({
    queryKey: ['price-calculator', 'calc', delayed],
    queryFn: () => api.post<{ lines: CalcLineOut[] }>('/price-calculator', sent.body),
    enabled: sent.ids.length > 0,
    placeholderData: (previous) => previous,
    retry: false,
  });
  const answers = useMemo(() => new Map(sent.ids.map((cid, i) => [cid, calc.data?.lines[i]] as const)), [sent, calc.data]);
  const fields = calc.error instanceof ApiError ? calc.error.fields ?? {} : {};
  const columnError = (cid: number, field: string) => { const i = sent.ids.indexOf(cid); return i < 0 ? undefined : fields[`lines.${i}.${field}`]; };
  const pending = calc.isFetching || request !== delayed;

  const p = (k: keyof Assumptions) => trim(assumptions[k] || '0');
  const out = (c: Column) => answers.get(c.id);
  const anyOverride = columns.some((c) => out(c)?.expenses_override_used);
  const calcRow = (label: ReactNode, unit: 'inr' | 'usd', pick: (o: CalcLineOut) => string, opts: { strong?: boolean; offer?: boolean; key?: string; flag?: (o: CalcLineOut) => boolean } = {}) => (
    <tr key={opts.key} className={clsx(opts.offer ? 'bg-success-bg text-success-ink' : 'bg-surface-muted/60')}>
      <th scope="row" className={clsx(LABEL, STICKY, opts.offer && '!bg-success-bg !text-success-ink', (opts.strong || opts.offer) && 'font-bold')}>{label}<span className={UNIT}>{s.units[unit]}</span></th>
      {columns.map((c) => { const o = out(c); return <td key={c.id} className={clsx('whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums', (opts.strong || opts.offer) && 'font-bold', o && opts.flag?.(o) && 'font-bold text-warning-ink')}>{o ? show(pick(o), unit === 'usd') : '—'}</td>; })}
    </tr>
  );
  const inputRow = (label: string, unit: 'inr' | 'usd', field: 'spot_rate' | 'purchase_commission' | 'fx_rate' | 'override', hint?: string) => (
    <tr>
      <th scope="row" className={clsx(LABEL, STICKY)} title={hint}>{label}<span className={UNIT}>{unit === 'inr' ? s.units.inr : ''}</span></th>
      {columns.map((c, n) => <td key={c.id} className="px-2 py-1.5"><Cell value={c[field]} label={`${label}, ${s.columnN(n + 1)}`} error={columnError(c.id, field === 'override' ? 'expenses_override' : field)} placeholder={field === 'override' ? '—' : undefined}
        onChange={(v) => setColumn(c.id, { [field]: v } as Partial<Column>)} /></td>)}
    </tr>
  );
  const missing = (c: Column) => (!c.spot_rate.trim() ? s.needSpot : !c.fx_rate.trim() ? s.needFx : null);

  /** Saves the sheet: a new one with POST, a saved one with PUT; the API calculates it and keeps the figures. */
  const save = async () => {
    setProblem(null);
    setSaveFields({});
    if (!columns.every(complete)) { setProblem(new Error(s.sheet.fixColumns)); return; }
    setBusy(true);
    try {
      const body = { sheet_date: sheetDate, name: name.trim() || null, assumptions: mapValues(assumptions, orZero), export_points: mapHeads(heads, orZero), lines: columns.map(toLine) };
      const result = id ? await api.put<PriceSheet>(`/price-calculator/sheets/${id}`, body) : await api.post<PriceSheet>('/price-calculator/sheets', body);
      setId(result.id);
      setSaved({ by: result.saved_by_name, at: result.updated_at });
      setSavedSnapshot(snapshot);
      await qc.invalidateQueries({ queryKey: ['price-sheets'] });
      toast(s.sheet.savedToast);
      onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setSaveFields(e.fields);
      else setProblem(e);
    } finally { setBusy(false); }
  };

  /** Archives or restores the open sheet. */
  const setArchivedFlag = async (next: boolean) => {
    if (!id) return;
    if (next && !window.confirm(s.sheet.confirmArchive)) return;
    setBusy(true);
    setProblem(null);
    try {
      await (next ? api.del<PriceSheet>(`/price-calculator/sheets/${id}`) : api.patch<PriceSheet>(`/price-calculator/sheets/${id}`, { archived: false }));
      await qc.invalidateQueries({ queryKey: ['price-sheets'] });
      toast(next ? s.sheet.archivedToast : s.sheet.restoredToast);
      if (next) onOpen(null); else setArchived(false);
    } catch (e) { setProblem(e); } finally { setBusy(false); }
  };

  const leave = () => !dirty || window.confirm(s.sheet.confirmLeave);
  /** The sheet as typed, to start a new sheet from it. */
  const asSeed = (): Seed => ({ id: null, date: todayIST(), name: '', archived: false, saved: null, assumptions, heads, fx: fxAll, columns: columns.map(({ id: _id, ...c }) => c) });
  const options = sheets.some((x) => x.id === id) || !id ? sheets : [{ id, sheet_date: sheetDate, name: name || null, line_count: columns.length, saved_by_name: '', archived, updated_at: '' }, ...sheets];

  return (
    <div className="space-y-4">
      <section className="glass-panel p-4" aria-label={s.title}>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-[14rem] flex-1 text-sm text-ink-secondary"><span className="mb-1 block font-medium">{s.sheet.label}</span>
            <select value={id ?? ''} aria-label={s.sheet.label} onChange={(e) => { if (leave()) onOpen(e.target.value || null); }} className={clsx(FIELD, 'w-full')}>
              <option value="">{s.sheet.newSheet}</option>
              {options.map((x) => <option key={x.id} value={x.id}>{s.sheet.option(date(x.sheet_date), x.name, x.line_count)}{x.archived ? ' (archived)' : ''}</option>)}
            </select></label>
          <label className="block text-sm text-ink-secondary"><span className="mb-1 block font-medium">{s.sheet.date}</span>
            <input type="date" value={sheetDate} onChange={(e) => setSheetDate(e.target.value)} className={clsx(FIELD, saveFields.sheet_date && 'border-danger-ink bg-danger-bg')} title={saveFields.sheet_date} /></label>
          <label className="block min-w-[10rem] flex-1 text-sm text-ink-secondary"><span className="mb-1 block font-medium">{s.sheet.name}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder={s.sheet.namePlaceholder} className={clsx(FIELD, 'w-full')} /></label>
          <Button onClick={() => void save()} loading={busy} disabled={archived}><Save className="h-4 w-4" aria-hidden />{busy ? s.sheet.saving : s.sheet.save}</Button>
        </div>
        <p className="mb-3 text-xs text-ink-muted" aria-live="polite">
          <span className={clsx('font-semibold', dirty ? 'text-warning-ink' : 'text-success-ink')}>{!saved ? s.sheet.notSaved : dirty ? s.sheet.unsaved : ''}</span>
          {saved && <>{dirty ? ' · ' : ''}{s.sheet.savedBy(saved.by, dateTime(saved.at))}</>}
        </p>
        {archived && <p className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">{s.sheet.archivedNote}
          <Button variant="secondary" onClick={() => void setArchivedFlag(false)} loading={busy}><RotateCcw className="h-4 w-4" aria-hidden />{s.sheet.restore}</Button></p>}
        {problem != null && <div className="mb-3"><ErrorNote error={problem} /></div>}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-3xl text-sm text-ink-muted">{s.subtitle}</p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-ink-secondary"><input type="checkbox" checked={breakdown} onChange={(e) => setBreakdown(e.target.checked)} />{s.breakdown}</label>
            <label className="inline-flex items-center gap-2 text-sm text-ink-secondary"><input type="checkbox" checked={showArchived} onChange={(e) => onShowArchived(e.target.checked)} />{s.sheet.showArchived}</label>
            <Button variant="secondary" onClick={() => setColumns((cs) => [...cs, newColumn({ label: '', export_point: 'BNP', spot_rate: '', purchase_commission: '0', fx_rate: fxAll, override: '' })])}><Plus className="h-4 w-4" aria-hidden />{s.addColumn}</Button>
            <Button variant="secondary" onClick={() => onNewFrom(asSeed())}><Copy className="h-4 w-4" aria-hidden />{s.sheet.newFromThis}</Button>
            {id && !archived && <Button variant="secondary" onClick={() => void setArchivedFlag(true)} disabled={busy}><Archive className="h-4 w-4" aria-hidden />{s.sheet.archive}</Button>}
            <Button variant="secondary" onClick={() => { if (leave()) onReset(); }}><RotateCcw className="h-4 w-4" aria-hidden />{s.reset}</Button>
          </div>
        </div>
        <p className="mb-3 text-xs text-ink-muted" aria-live="polite">{pending ? s.calculating : d.fx_source === 'sheet' ? s.fxFromSheet(trim(d.fx_rate)) : d.fx_is_today === false ? s.fxFromOldDollarRate(trim(d.fx_rate)) : s.fxFromDollarRate(trim(d.fx_rate))}</p>
        {calc.isError && !(calc.error instanceof ApiError && calc.error.fields) && <div className="mb-3"><ErrorNote error={calc.error} onRetry={() => void calc.refetch()} /></div>}

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-surface">
                <th scope="col" className={clsx(LABEL, STICKY, 'align-bottom')}>{s.quality}</th>
                {columns.map((c, n) => (
                  <th key={c.id} scope="col" className="min-w-[8.5rem] px-2 py-2 align-top">
                    <input value={c.label} onChange={(e) => setColumn(c.id, { label: e.target.value })} placeholder={s.qualityPlaceholder} aria-label={`${s.quality}, ${s.columnN(n + 1)}`} maxLength={100}
                      className="h-9 w-full rounded-md border border-line-strong bg-white px-2 text-sm font-semibold text-ink" />
                  </th>
                ))}
              </tr>
              <tr className="bg-surface">
                <th scope="col" className={clsx(LABEL, STICKY)}>{s.exportPoint}</th>
                {columns.map((c, n) => (
                  <th key={c.id} scope="col" className="px-2 pb-2 align-top">
                    <div className="flex items-center gap-1">
                      <select value={c.export_point} onChange={(e) => setColumn(c.id, { export_point: e.target.value as ExportPoint })} aria-label={`${s.exportPoint}, ${s.columnN(n + 1)}`}
                        className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-white px-1 text-sm font-semibold text-ink">
                        {EXPORT_POINTS.map((x) => <option key={x} value={x}>{s.points[x]}</option>)}
                      </select>
                      <button type="button" title={s.copyColumn} aria-label={`${s.copyColumn}, ${s.columnN(n + 1)}`} onClick={() => setColumns((cs) => { const at = cs.findIndex((x) => x.id === c.id); const { id: _id, ...rest } = c; return [...cs.slice(0, at + 1), newColumn(rest), ...cs.slice(at + 1)]; })}
                        className="tap grid h-9 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-hover"><Copy className="h-4 w-4" /></button>
                      <button type="button" title={s.removeColumn} aria-label={`${s.removeColumn}, ${s.columnN(n + 1)}`} disabled={columns.length === 1} onClick={() => setColumns((cs) => cs.filter((x) => x.id !== c.id))}
                        className="tap grid h-9 w-8 place-items-center rounded-md text-ink-muted hover:bg-surface-hover disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inputRow(s.rows.spot, 'inr', 'spot_rate')}
              {inputRow(s.rows.commission, 'inr', 'purchase_commission')}
              {calcRow(s.rows.net, 'inr', (o) => o.net_per_ton)}
              {calcRow(s.rows.expenses, 'inr', (o) => o.export_expenses, { flag: (o) => o.expenses_override_used })}
              {inputRow(s.rows.override, 'inr', 'override', s.noteSheet)}
              {calcRow(s.rows.cost, 'inr', (o) => o.cost_per_ton, { strong: true })}
              {inputRow(s.rows.fx, 'usd', 'fx_rate')}
              {calcRow(s.rows.costUsd, 'usd', (o) => o.cost_per_ton_usd)}
              {calcRow(s.rows.overseas(p('overseas_commission_pct')), 'usd', (o) => o.overseas_commission)}
              {calcRow(s.rows.basic, 'usd', (o) => o.basic_cost_usd, { strong: true })}
              {calcRow(s.rows.drawback(p('drawback_pct')), 'usd', (o) => o.duty_drawback)}
              {calcRow(s.rows.rodtep(p('rodtep_pct')), 'usd', (o) => o.rodtep)}
              {calcRow(s.rows.netCost, 'usd', (o) => o.net_cost_usd, { strong: true })}
              {calcRow(s.rows.margin(p('margin_pct')), 'usd', (o) => o.margin)}
              {calcRow(s.rows.offer, 'usd', (o) => o.offer_rate, { offer: true })}
              {breakdown && <>
                <tr><th scope="colgroup" colSpan={columns.length + 1} className={clsx(LABEL, STICKY, 'bg-surface-muted font-bold text-ink')}>{s.rows.expenses}</th></tr>
                {(['rail_road', 'sea_freight', 'thc', 'cfs', 'c_and_f', 'insurance', 'lc_bank', 'weighment_spot', 'weighment_landing', 'ecgc', 'service_tax', 'misc', 'total'] as const).map((k) =>
                  calcRow(k === 'insurance' ? `${s.expenseRows.insurance} @ ${p('insurance_pct')}%` : k === 'ecgc' ? `${s.expenseRows.ecgc} @ ${p('ecgc_pct')}%` : s.expenseRows[k], 'inr', (o) => o.expenses[k], { strong: k === 'total', key: k }))}
                {anyOverride && calcRow(s.rows.expensesUsed, 'inr', (o) => o.export_expenses, { strong: true, key: 'used', flag: (o) => o.expenses_override_used })}
              </>}
              <tr>
                <th scope="row" className={clsx(LABEL, STICKY)} />
                {columns.map((c) => <td key={c.id} className="px-2 py-1 text-xs text-warning-ink">{missing(c) ?? columnError(c.id, 'export_point')}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-muted">{s.noteSheet}</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className="glass-panel p-4" aria-label={s.assumptions.title}>
          <h2 className="text-[17px] font-bold leading-6 text-ink">{s.assumptions.title}</h2>
          <p className="mb-3 text-sm text-ink-muted">{s.assumptions.hint}</p>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-3 text-sm text-ink-secondary"><span>{s.assumptions.fxAll}</span><Cell wide value={fxAll} label={s.assumptions.fxAll} onChange={setFx} /></label>
            {([['freight_inr_per_usd', s.assumptions.freight], ['container_tons', s.assumptions.tons]] as const).map(([k, label]) => (
              <label key={k} className="flex items-center justify-between gap-3 text-sm text-ink-secondary"><span>{label}</span>
                <Cell wide value={assumptions[k]} label={label} error={fields[`assumptions.${k}`] ?? saveFields[`assumptions.${k}`]} onChange={(v) => setAssumptions((a) => ({ ...a, [k]: v }))} /></label>
            ))}
            {PERCENT_KEYS.map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 text-sm text-ink-secondary"><span>{s.assumptions.pct[k]}</span>
                <Cell wide value={assumptions[k]} label={s.assumptions.pct[k]} error={fields[`assumptions.${k}`] ?? saveFields[`assumptions.${k}`]} onChange={(v) => setAssumptions((a) => ({ ...a, [k]: v }))} /></label>
            ))}
          </div>
        </section>

        <section className="glass-panel min-w-0 p-4" aria-label={s.heads.title}>
          <h2 className="text-[17px] font-bold leading-6 text-ink">{s.heads.title}</h2>
          <p className="mb-3 text-sm text-ink-muted">{s.heads.hint}</p>
          <div className="overflow-x-auto"><table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead><tr className="bg-surface"><th scope="col" className={clsx(LABEL, STICKY)} />{EXPORT_POINTS.map((x) => <th key={x} scope="col" className="px-2 py-2 text-right text-sm font-bold text-ink">{s.points[x]}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {HEAD_KEYS.map((k) => (
                <tr key={k}>
                  <th scope="row" className={clsx(LABEL, STICKY)}>{s.heads.rows[k]}</th>
                  {EXPORT_POINTS.map((x) => <td key={x} className="px-2 py-1.5"><Cell wide value={heads[x][k]} label={`${s.heads.rows[k]}, ${s.points[x]}`} error={fields[`export_points.${x}.${k}`] ?? saveFields[`export_points.${x}.${k}`]}
                    onChange={(v) => setHeads((h) => ({ ...h, [x]: { ...h[x], [k]: v } }))} /></td>)}
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      </div>
    </div>
  );
}

/** The Price calculator tab: loads the standard figures and the saved sheets, then shows the sheet (opening another sheet, or starting a new one, starts it again). */
export function PriceCalculator() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [current, setCurrent] = useState<{ key: number; seed: Seed } | null>(null);
  const [openError, setOpenError] = useState<unknown>(null);
  const keys = useRef(0);
  const defaults = useQuery({ queryKey: ['price-calculator', 'defaults'], queryFn: () => api.get<CalcDefaults>('/price-calculator/defaults'), staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const sheets = useQuery({ queryKey: ['price-sheets', showArchived], queryFn: () => api.get<{ data: PriceSheetSummary[] }>(`/price-calculator/sheets?archived=${showArchived}`).then((r) => r.data), refetchOnWindowFocus: false });
  if (defaults.isPending || sheets.isPending) return <Spinner label={s.loading} />;
  if (defaults.isError) return <ErrorNote error={defaults.error} onRetry={() => void defaults.refetch()} />;
  const d = defaults.data;
  const shown = current ?? { key: 0, seed: seedFromDefaults(d) };
  const start = (seed: Seed) => { setOpenError(null); setCurrent({ key: ++keys.current, seed }); };
  const open = async (id: string | null) => {
    if (!id) { start(seedFromDefaults(d)); return; }
    try {
      const sheet = await qc.fetchQuery({ queryKey: ['price-sheet', id], queryFn: () => api.get<PriceSheet>(`/price-calculator/sheets/${id}`), staleTime: 0 });
      start(seedFromSheet(sheet, d.fx_rate));
    } catch (e) { setOpenError(e); }
  };
  return <>
    {openError != null && <div className="mb-3"><ErrorNote error={openError} /></div>}
    {sheets.isError && <div className="mb-3"><ErrorNote error={sheets.error} onRetry={() => void sheets.refetch()} /></div>}
    <Sheet key={shown.key} d={d} seed={shown.seed} sheets={sheets.data ?? []} showArchived={showArchived} onShowArchived={setShowArchived}
      onOpen={(id) => void open(id)} onNewFrom={start} onReset={() => { void defaults.refetch(); start(seedFromDefaults(d)); }} onChanged={() => void sheets.refetch()} />
  </>;
}
