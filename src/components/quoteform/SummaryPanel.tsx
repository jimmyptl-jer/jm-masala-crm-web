/**
 * The sticky summary panel on the right of the quotation builder (below the form on phones), laid out like the supplied
 * mockup: QUOTE TOTAL (grey until there is one), the quantity line, the subtotal / GST rows, a checklist of what is still
 * missing, the paprika "Finalise and send" button (disabled until the checklist is complete), "Save draft" and a small
 * "Preview PDF" link. Used by pages/QuoteForm.tsx.
 * No API calls: every figure is a decimal string from POST /quotes/calculate (key ['quote-calc', ...]), only formatted
 * here; the margin percentage also comes from the API and is only compared with the thresholds.
 */
import clsx from 'clsx';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { money } from '@/lib/format';
import type { CalcResult, Currency, QuoteType } from '@/lib/types';
import { t } from '@/strings';

const s = t.quoteForm;
const isZero = (v: string) => /^-?0*\.?0*$/.test(v);
/** '83.4500' -> '83.45'. */
const shownRate = (rate: string) => rate.replace(/(\.\d\d)0+$/, '$1');

/** Margin check colour: green at 8% or more, orange from 3% up to 8%, red below 3%. */
export function marginTone(pct: string): 'ok' | 'warn' | 'low' {
  const n = Number(pct);
  return n >= 8 ? 'ok' : n >= 3 ? 'warn' : 'low';
}

/** One line of the checklist: what is needed and whether it is done. */
export interface CheckItem { label: string; ok: boolean }

/**
 * @param props.calc - latest calculation, or undefined when there is none yet.
 * @param props.currency - currency to show when `calc` is absent.
 * @param props.type - quote type (GST and round-off rows are for domestic quotes).
 * @param props.pending - a calculation is waiting or running.
 * @param props.calcError - message when the last calculation failed, else null.
 * @param props.hasInput - the form has enough data to calculate.
 * @param props.qtyLine - the "14 MT" part of the line under the total (empty when there are no products yet).
 * @param props.checklist - what must be done before finalising.
 * @param props.showMargin - staff chose to show cost and margin (the margin row is internal and never printed).
 * @param props.busy - 'save' | 'issue' | null; the active button shows a spinner and both are disabled.
 * @param props.saveState - 'saved' | 'unsaved' | 'saving' | 'failed' | 'new' for the indicator under the buttons.
 * @param props.onFinalise / onPreview / onSave - the buttons.
 */
export function SummaryPanel({ calc, currency, type, pending, calcError, hasInput, qtyLine, checklist, showMargin, busy, saveState, onFinalise, onPreview, onSave }: {
  calc: CalcResult | undefined; currency: Currency; type: QuoteType; pending: boolean; calcError: string | null; hasInput: boolean;
  qtyLine: string; checklist: CheckItem[]; showMargin: boolean; busy: 'save' | 'issue' | null; saveState: 'saved' | 'unsaved' | 'saving' | 'failed' | 'new';
  onFinalise: () => void; onPreview: () => void; onSave: () => void;
}) {
  const cur = calc?.currency ?? currency;
  const domestic = type === 'domestic';
  const tone = calc?.margin.pct ? marginTone(calc.margin.pct) : null;
  const missing = checklist.filter((c) => !c.ok).length;
  const row = (label: string, value: string) => <div className="flex justify-between gap-3 text-sm"><dt className="text-ink-muted">{label}</dt><dd className="tabular-nums text-ink-secondary">{value}</dd></div>;
  const state = {
    saved: { text: s.savedState, cls: 'text-success-ink' }, saving: { text: s.savingState, cls: 'text-ink-muted' },
    unsaved: { text: s.unsavedState, cls: 'text-warning-ink' }, failed: { text: s.autosaveFailed, cls: 'text-danger-ink' }, new: { text: s.notSavedYet, cls: 'text-ink-muted' },
  }[saveState];

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card" aria-label={s.summaryTitle}>
      <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted">{s.quoteTotal}</p>
      <p className={clsx('mt-1 text-[28px] font-bold leading-8 tabular-nums', calc ? 'text-ink' : 'text-ink-placeholder', pending && 'opacity-60')} aria-live="polite">{calc ? money(calc.grand_total, cur) : money('0', cur)}</p>
      <p className="mt-1 text-sm text-ink-muted">{calcError && !calc ? calcError : qtyLine || (hasInput ? '' : s.addProductsHint)}{pending && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" aria-hidden />}</p>
      {calc && calcError && <p className="mt-1 text-xs text-danger-ink">{calcError}</p>}
      {/* the total at today's dollar rate; the API works it out (nothing is calculated here) */}
      {calc?.equivalent && (
        <p className="mt-1 text-sm font-medium text-ink-secondary tabular-nums">
          {calc.equivalent.currency === 'INR' ? s.equivalentInr(money(calc.equivalent.amount, 'INR', { symbol: false }), shownRate(calc.equivalent.rate)) : s.equivalentUsd(money(calc.equivalent.amount, 'USD', { symbol: false }), shownRate(calc.equivalent.rate))}
        </p>
      )}
      {calc && !calc.equivalent && (calc.currency === 'USD' || calc.currency === 'INR') && Number(calc.grand_total) > 0 && <p className="mt-1 text-xs text-warning-ink">{s.noRateHint}</p>}

      {calc && (
        <dl className="mt-3 space-y-1">
          {row(s.subtotal, money(calc.subtotal, cur, { symbol: false }))}
          {!isZero(calc.discount) && row(s.previewDiscount, money(calc.discount, cur, { symbol: false }))}
          {!isZero(calc.freight) && row(s.previewFreight, money(calc.freight, cur, { symbol: false }))}
          {!isZero(calc.insurance) && row(s.previewInsurance, money(calc.insurance, cur, { symbol: false }))}
          {domestic && row(s.gst, money(calc.gst_total, cur, { symbol: false }))}
          {domestic && !isZero(calc.round_off) && row(s.roundOff, money(calc.round_off, cur, { symbol: false }))}
        </dl>
      )}

      {showMargin && tone && calc?.margin.pct && (
        <p className={clsx('mt-3 rounded-lg px-3 py-2 text-sm font-bold', tone === 'ok' && 'bg-success-bg text-success-ink', tone === 'warn' && 'bg-warning-bg text-warning-ink', tone === 'low' && 'bg-danger-bg text-danger-ink')}>
          {s.marginCheck(calc.margin.pct)} <span className="font-normal">{tone === 'ok' ? s.marginOk : tone === 'warn' ? s.marginWarn : s.marginLow}</span>
        </p>
      )}

      <ul className="mt-4 space-y-2 border-t border-line pt-4" aria-label={s.checklistLabel}>
        {checklist.map((c) => (
          <li key={c.label} className={clsx('flex items-center gap-2.5 text-[15px]', c.ok ? 'font-bold text-success-ink' : 'text-ink-secondary')}>
            <span className={clsx('grid h-4 w-4 shrink-0 place-items-center rounded border', c.ok ? 'border-success bg-success text-white' : 'border-line-strong bg-surface')} aria-hidden>{c.ok && <Check className="h-3 w-3" strokeWidth={3} />}</span>
            {c.label}
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2">
        <Button className="w-full" onClick={onFinalise} loading={busy === 'issue'} disabled={busy !== null || missing > 0}>{s.finaliseSend}</Button>
        {missing > 0 && <p className="text-center text-sm text-ink-secondary">{s.completeItems(missing)}</p>}
        <Button variant="secondary" className="w-full" onClick={onSave} loading={busy === 'save'} disabled={busy !== null}>{s.saveDraft}</Button>
        <button type="button" onClick={onPreview} disabled={busy !== null} className="block w-full text-center text-sm font-bold text-paprika hover:underline disabled:opacity-50">{s.previewPdf}</button>
      </div>
      <p className={clsx('mt-3 flex items-center justify-center gap-1 text-xs', state.cls)} role="status">
        {saveState === 'saved' && <Check className="h-3 w-3" aria-hidden />}{saveState === 'saving' && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}{state.text}
      </p>
    </div>
  );
}
