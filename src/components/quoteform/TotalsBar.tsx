/**
 * Fixed totals + action bar of the quote form (subtotal, GST, round-off, grand total, Save draft, Issue).
 * Used by pages/QuoteForm.tsx. No API calls here: the numbers come from POST /quotes/calculate (called by
 * the page, key ['quote-calc', ...]) and the buttons call the page's save/issue handlers
 * (PUT /quotes/:id/draft / POST /quotes, then POST /quotes/:id/issue). Implements BR-06 / BR-11 display
 * (GST and round-off for domestic quotes); all arithmetic stays in the API.
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { money } from '@/lib/format';
import type { CalcResult, Currency, QuoteType } from '@/lib/types';
import { t } from '@/strings';

// all words for the quote form come from strings/quoteForm.ts
const s = t.quoteForm;
// true for "0", "0.00", "-0.00" and "" (string test, no number conversion); hides a zero round-off row
const isZero = (v: string) => /^-?0*\.?0*$/.test(v);

/**
 * Fixed bar at the bottom of the quote form: live totals plus the Save draft and Issue buttons.
 *
 * What the user sees: on the left the subtotal (domestic quotes also GST and, when not zero, round-off);
 * on the right the GRAND TOTAL in large type (dimmed while recalculating); on md+ screens the amount in
 * words under it; below, two buttons "Save draft" and "Issue". With no calculation yet the left side
 * shows a hint ("add a product ...") or the calculation error; a small spinner "calculating" appears while
 * a new calculation is pending.
 * Position: `fixed` to the bottom of the viewport. On phones it sits ABOVE the 4rem-high bottom tab bar
 * (`bottom-[calc(4rem+env(safe-area-inset-bottom))]`, the extra term is the iPhone home-indicator inset);
 * from md up there is no tab bar, so it sits at `bottom-0`, starting right of the 15rem (`left-60`) sidebar.
 * z-30 keeps it under modal sheets (z-50). The page reserves bottom padding so the last form card is not
 * hidden. All figures are the API's decimal strings from POST /quotes/calculate, only formatted with `money`.
 *
 * @param props.calc - latest calculation result, or undefined when none.
 * @param props.currency - fallback currency when `calc` is absent (the result's own currency wins).
 * @param props.type - quote type; GST/round-off rows are for domestic quotes.
 * @param props.pending - a calculation is waiting or running (dims the total, shows the spinner).
 * @param props.calcError - message when the last calculation failed, else null.
 * @param props.hasInput - the form has enough data to calculate (buyer chosen and a complete line).
 * @param props.busy - 'save' | 'issue' | null; the active button shows a spinner, both are disabled.
 * @param props.onSave - Save draft clicked.
 * @param props.onIssue - Issue clicked (the parent asks for confirmation).
 * Local state: none.
 */
export function TotalsBar({ calc, currency, type, pending, calcError, hasInput, busy, onSave, onIssue }: {
  calc: CalcResult | undefined;
  currency: Currency;
  type: QuoteType;
  pending: boolean;
  calcError: string | null;
  hasInput: boolean;
  busy: 'save' | 'issue' | null;
  onSave: () => void;
  onIssue: () => void;
}) {
  // GST and round-off lines exist only on domestic quotes
  const domestic = type === 'domestic';
  // currency shown on amounts: the calculation's own, else the form's
  const cur = calc?.currency ?? currency;
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-cream-200 bg-white shadow-[0_-4px_14px_rgba(0,0,0,0.10)] md:bottom-0 md:left-60">
      <div className="mx-auto max-w-5xl px-4 py-2 md:px-8">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 text-sm text-fg-secondary" aria-live="polite">
            {calc ? (
              <>
                <div className="flex gap-2"><span>{s.subtotal}</span><span className="tabular-nums">{money(calc.subtotal, cur, { symbol: false })}</span></div>
                {domestic && <div className="flex gap-2"><span>{s.gst}</span><span className="tabular-nums">{money(calc.gst_total, cur, { symbol: false })}</span></div>}
                {domestic && !isZero(calc.round_off) && <div className="flex gap-2"><span>{s.roundOff}</span><span className="tabular-nums">{money(calc.round_off, cur, { symbol: false })}</span></div>}
              </>
            ) : (
              <span className="block max-w-[11rem] text-xs leading-tight">{calcError ?? (hasInput ? '' : s.addLinesForTotal)}</span>
            )}
            {pending && <div className="flex items-center gap-1 text-xs text-forest-800"><Loader2 className="h-3 w-3 animate-spin" aria-hidden />{s.calculating}</div>}
            {!pending && calc && calcError && <div className="text-xs text-red-700">{calcError}</div>}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs font-medium uppercase tracking-wide text-fg-muted">{s.grandTotal}</div>
            <div className={`text-2xl font-bold tabular-nums text-forest-900 ${pending ? 'opacity-60' : ''}`}>{calc ? money(calc.grand_total, cur) : '—'}</div>
          </div>
        </div>
        {calc?.amount_words && <div className="mt-0.5 hidden truncate text-xs italic text-fg-muted md:block">{calc.amount_words}</div>}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onSave} loading={busy === 'save'} disabled={busy !== null}>{busy === 'save' ? s.savingDraft : s.saveDraft}</Button>
          <Button onClick={onIssue} loading={busy === 'issue'} disabled={busy !== null}>{busy === 'issue' ? s.issuing : s.issue}</Button>
        </div>
      </div>
    </div>
  );
}
