/**
 * Price hint chips for the rate input of a quote line. Used by components/quoteform/LineCard.tsx.
 * API: GET /products/:id/price-hints?buyer_id=&currency= (key ['price-hints', productId, buyerId, currency]).
 * Implements BR-04 (hints come from issued quotes only, same currency) and FR-32 (tap to fill the rate).
 * Rates are decimal strings, displayed with `money` and passed back unchanged.
 */
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api';
import { date, money, todayIST } from '@/lib/format';
import type { Currency, PriceHints } from '@/lib/types';
import { t } from '@/strings';

// all words for the quote form come from strings/quoteForm.ts
const s = t.quoteForm;

/**
 * Short date for a chip: "09 Oct" when the date is in the current India year, "09 Oct 2025" otherwise.
 * @param v - ISO timestamp from the API (the date the price was issued/updated).
 */
function shortDate(v: string): string {
  const full = date(v);
  return v.slice(0, 4) === todayIST().slice(0, 4) ? full.slice(0, 6) : full;
}

/**
 * Tappable previous prices under the rate input of a product line (BR-04, FR-32).
 *
 * What the user sees: a small "Previous prices" heading and up to three gold chips: the last rate quoted to
 * THIS buyer, the last rate quoted to ANYONE, and the product's reference rate (set on the product; only
 * USD and INR have one) - each with its date. Tapping a chip calls `onPick(rate)`, which fills the rate
 * input. Nothing is rendered while loading, on error, or when no hint exists.
 * API: GET /products/:id/price-hints?buyer_id=&currency= (react-query key
 * ['price-hints', productId, buyerId, currency], fresh for 60 s). The API only looks at ISSUED quotes in the
 * SAME currency (drafts are ignored). Hints are never calculated in the browser.
 * @param props.productId - product whose hints are shown (query is skipped when empty).
 * @param props.buyerId - selected buyer; '' omits the buyer filter (then "last to buyer" is absent).
 * @param props.currency - the quote's currency; hints are for this currency only.
 * @param props.onPick - called with the rate string (e.g. "1250.00") when a chip is tapped.
 */
export function PriceHintChips({ productId, buyerId, currency, onPick }:
  { productId: string; buyerId: string; currency: Currency; onPick: (rate: string) => void }) {
  // hints for this product/buyer/currency; the key changes with each, so switching any of them refetches
  const q = useQuery({
    queryKey: ['price-hints', productId, buyerId, currency],
    queryFn: () => api.get<PriceHints>(`/products/${productId}/price-hints${qs({ buyer_id: buyerId, currency })}`),
    enabled: !!productId && !!currency,
    staleTime: 60_000,
  });
  // hint data; nothing is shown until it has loaded
  const h = q.data;
  if (!h) return null;
  // chips to show, in order: last to this buyer, last to anyone, reference rate (each only if present)
  const chips: { key: string; label: string; rate: string; on?: string }[] = [];
  if (h.last_to_buyer) chips.push({ key: 'b', label: s.hintLastBuyer, rate: h.last_to_buyer.rate, on: h.last_to_buyer.date });
  if (h.last_to_anyone) chips.push({ key: 'a', label: s.hintLastAnyone, rate: h.last_to_anyone.rate, on: h.last_to_anyone.date });
  if (h.reference) chips.push({ key: 'r', label: s.hintReference, rate: h.reference.rate, on: h.reference.date });
  if (!chips.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs text-ink/60">{s.hintsHeading}</div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key} type="button" onClick={() => onPick(c.rate)}
            className="tap rounded-full border border-gold-600/50 bg-gold-100 px-3 py-1.5 text-left text-sm font-medium text-forest-900 hover:bg-gold-300/60"
          >
            {c.label} · <span className="tabular-nums">{money(c.rate, currency, { symbol: false })}</span>{c.on ? ` · ${shortDate(c.on)}` : ''}
          </button>
        ))}
      </div>
    </div>
  );
}
