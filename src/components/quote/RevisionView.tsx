/**
 * Read-only display of one quote revision (terms, items, totals, notes, optional internal margin), used by
 * pages/QuoteDetail.tsx. No API calls: it renders the `Revision` object from GET /quotes/:id (key
 * ['quote', id]). All money values are decimal strings formatted with `money`/`qty`; nothing is added up
 * here. Related rules: BR-03 (issued revisions are frozen), BR-06 (domestic GST split: CGST+SGST vs IGST),
 * BR-10 (freight/insurance only on CIF/CFR export quotes), BR-11 (round-off) and NFR-04 (cost is internal).
 */
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { date, money, qty } from '@/lib/format';
import type { QuoteDetail, Revision } from '@/lib/types';
import { Button, Card } from '@/components/ui';
import { t } from '@/strings';

/**
 * True when a decimal string is not zero ("0", "0.00" and "" / null are zero).
 * @param v - a money string from the API, or null/undefined.
 * Only looks for a non-zero digit in the text: money is never converted to a number in the browser, so no
 * rounding problem can arise. Used to hide empty charge rows and to choose IGST vs CGST+SGST.
 */
const nonZero = (v: string | null | undefined) => !!v && /[1-9]/.test(v);

/**
 * One label/value pair in the terms grid. Renders nothing when `value` is empty, so unused terms
 * (e.g. port of loading on a domestic quote) simply do not appear.
 * @param props.label - small caption above the value.
 * @param props.value - text to show, or null/undefined/'' to hide the pair.
 */
function Term({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-muted">{label}</dt>
      <dd className="text-base text-ink">{value}</dd>
    </div>
  );
}

/**
 * One line of the totals card: label on the left, amount on the right.
 * @param props.label - e.g. "Subtotal".
 * @param props.value - the already formatted amount text.
 * @param props.strong - true for the grand total row (larger, bold, with a rule above it).
 */
function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between gap-3 border-t border-cream-200 pt-2 text-lg font-bold text-forest-900' : 'flex justify-between gap-3 text-base'}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Read-only view of ONE revision of a quote (the selected tab on the Quote detail screen).
 *
 * What the user sees, in order: who issued it and when (or a "draft" note); a terms card (currency, validity,
 * Incoterm, ports, payment terms, delivery time - empty ones hidden); the items (product + grade, packing,
 * quantity x rate, line amount; for domestic quotes the GST % and the IGST or CGST+SGST amounts); a totals
 * card (subtotal; discount, freight, insurance and round-off only when not zero; GST total for domestic or
 * when not zero; grand total; amount in words); notes; a collapsible "Terms and conditions" list; and - only
 * when some line has a cost rate - a "Show internal cost" button that reveals each line's cost rate and
 * margin plus total margin and margin % in a dashed, clearly internal box.
 *
 * Every figure is the string stored/calculated by the API (`money`/`qty` only format it); nothing is
 * calculated here. Issued revisions show the frozen product names from their snapshot (BR-03).
 * Cost and margin (NFR-04) are present only in GET /quotes/:id responses and are never printed on the PDF;
 * they stay hidden until the user presses the button.
 *
 * @param props.quote - the whole QuoteDetail (used for its `type`: domestic quotes show GST details).
 * @param props.revision - the revision to show.
 * Local state: `showCost` - whether the internal cost/margin details are revealed. The parent gives this
 * component a `key` per revision, so the cost box closes again when the user switches tabs.
 * No API calls.
 */
export function RevisionView({ quote, revision }: { quote: QuoteDetail; revision: Revision }) {
  const [showCost, setShowCost] = useState(false);
  const d = t.quoteDetail;
  // currency of this revision (all amounts below are in it)
  const cur = revision.currency;
  // domestic quotes carry GST per line and in the totals; export quotes do not
  const domestic = quote.type === 'domestic';
  // at least one line has an internal cost rate
  const hasCost = revision.lines.some((l) => l.cost_rate !== null);
  // margin figures computed by the API ({ total, pct, complete, lines[] }); null when no cost was entered
  const m = revision.margin;

  return (
    <div className="space-y-4">
      <div className="text-sm text-fg-muted">
        {revision.state === 'issued' && revision.issued_at ? d.issuedOn(date(revision.issued_at), revision.issued_by_name) : d.revisionDraftNote}
      </div>

      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Term label={d.currency} value={cur} />
          <Term label={d.validity} value={d.validityDays(revision.validity_days)} />
          <Term label={d.incoterm} value={revision.incoterm} />
          <Term label={d.portLoading} value={revision.port_loading} />
          <Term label={d.portDischarge} value={revision.port_discharge} />
          <Term label={d.paymentTerms} value={revision.payment_terms} />
          <Term label={d.deliveryTime} value={revision.delivery_time} />
        </dl>
      </Card>

      <section aria-labelledby="items-h">
        <h3 id="items-h" className="mb-2 text-[17px] font-bold leading-6 text-ink">{d.items}</h3>
        <ul className="space-y-2">
          {revision.lines.map((l, i) => (
            <li key={l.id} className="card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-forest-900">
                    {l.product.name}{l.product.grade && <span className="font-normal text-fg-secondary"> · {l.product.grade}</span>}
                  </div>
                  {l.packing && <div className="text-sm text-fg-muted">{d.packing}: {l.packing}</div>}
                  <div className="mt-1 text-base tabular-nums text-ink">
                    {qty(l.quantity)} {l.product.unit} × {money(l.rate, cur, { symbol: false })}
                  </div>
                </div>
                <div className="shrink-0 text-right text-base font-semibold tabular-nums text-forest-900">{money(l.amount, cur)}</div>
              </div>

              {domestic && (
                <div className="mt-1 text-sm text-fg-muted">
                  {d.gst(qty(l.gst_rate))}
                  {nonZero(l.igst)
                    ? ` · ${d.igst} ${money(l.igst, cur, { symbol: false })}`
                    : ` · ${d.cgst} ${money(l.cgst, cur, { symbol: false })} + ${d.sgst} ${money(l.sgst, cur, { symbol: false })}`}
                </div>
              )}

              {/* internal cost + margin for this line; m.lines[i] is the margin of line i (same order as
                 revision.lines) */}
              {showCost && (
                <div className="mt-2 rounded-lg bg-gold-100 px-3 py-2 text-sm text-forest-900">
                  <div>{d.costRate}: {l.cost_rate !== null ? money(l.cost_rate, cur, { symbol: false }) : d.noCost}</div>
                  {m?.lines?.[i] != null && <div>{d.marginLine}: {money(m.lines[i], cur)}</div>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Card className="p-4">
        <dl className="space-y-2">
          <TotalRow label={d.subtotal} value={money(revision.subtotal, cur)} />
          {nonZero(revision.discount) && <TotalRow label={d.discount} value={money(revision.discount, cur)} />}
          {nonZero(revision.freight) && <TotalRow label={d.freight} value={money(revision.freight, cur)} />}
          {nonZero(revision.insurance) && <TotalRow label={d.insurance} value={money(revision.insurance, cur)} />}
          {(domestic || nonZero(revision.gst_total)) && <TotalRow label={d.gstTotal} value={money(revision.gst_total, cur)} />}
          {nonZero(revision.round_off) && <TotalRow label={d.roundOff} value={money(revision.round_off, cur)} />}
          <TotalRow strong label={d.grandTotal} value={money(revision.grand_total, cur)} />
        </dl>
        {revision.amount_words && (
          <p className="mt-3 text-sm text-fg-secondary"><span className="font-medium">{d.amountWords}:</span> {revision.amount_words}</p>
        )}
      </Card>

      {revision.notes && (
        <section>
          <h3 className="mb-1 text-[17px] font-bold leading-6 text-ink">{d.notes}</h3>
          <p className="whitespace-pre-line text-base text-ink">{revision.notes}</p>
        </section>
      )}

      {revision.terms.length > 0 && (
        <details className="card px-3">
          <summary className="min-h-tap cursor-pointer py-2.5 text-base font-semibold text-forest-900">{d.termsConditions}</summary>
          <ol className="list-decimal space-y-1 pb-3 pl-5 text-sm text-fg-secondary">
            {revision.terms.map((x, i) => <li key={i}>{x}</li>)}
          </ol>
        </details>
      )}

      {(hasCost || m) && (
        <section className="space-y-2">
          <Button variant="secondary" className="w-full" aria-expanded={showCost} onClick={() => setShowCost((v) => !v)}>
            {showCost ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            {showCost ? d.hideCost : d.showCost}
          </Button>
          {showCost && (
            <div className="rounded-xl border-2 border-dashed border-gold-600 bg-gold-100/60 p-4" role="region" aria-label={d.internalTitle}>
              <p className="mb-2 text-sm font-semibold text-wood-800">{d.internalTitle}</p>
              {m && m.total !== null ? (
                <dl className="space-y-1 text-base">
                  <div className="flex justify-between gap-3"><dt>{d.marginTotal}</dt><dd className="font-semibold tabular-nums">{money(m.total, cur)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>{d.marginPct}</dt><dd className="font-semibold tabular-nums">{m.pct !== null ? `${m.pct}%` : '—'}</dd></div>
                  {!m.complete && <p className="pt-1 text-sm text-red-800">{d.marginIncomplete}</p>}
                </dl>
              ) : (
                <p className="text-sm text-fg-secondary">{d.noMargin}</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
