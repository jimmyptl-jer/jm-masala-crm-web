/**
 * One product line of the quote form (product, packing, quantity, rate, price hints, live amount, optional
 * cost and margin). Used by pages/QuoteForm.tsx, once per line.
 *
 * API: none directly; PriceHintChips loads GET /products/:id/price-hints. The amount and margin shown come
 * from POST /quotes/calculate (done by the parent). Implements FR-32 / BR-04 (price hints) and NFR-04 (the
 * cost box is internal and never printed). All numbers are strings; nothing is calculated here.
 */
import { Trash2 } from 'lucide-react';
import { money, qty } from '@/lib/format';
import type { CalcResult, Currency, Product, QuoteType } from '@/lib/types';
import { t } from '@/strings';
import { Card, Input, NumberInput, Select } from '@/components/ui';
import { SearchSelect, type Option } from '@/components/SearchSelect';
import { isOtherPacking, OTHER, type LineState } from './model';
import { PriceHintChips } from './PriceHintChips';

// all words for the quote form come from strings/quoteForm.ts
const s = t.quoteForm;

// error text per input of a line (undefined = no error); built from `errors['lines.<i>.<field>']`
export interface LineErrors { product_id?: string; packing?: string; quantity?: string; rate?: string; cost_rate?: string }

/**
 * One product line card of the quote form.
 *
 * What the user sees: a title "Product N" with a trash button (hidden when it is the only line); a product
 * picker; packing (a dropdown of the product's packing options plus "Other" with a free-text box, or just a
 * free-text box when the product has no options); quantity (3 decimals, unit shown in the label) and rate
 * (2 decimals, currency/unit in the label); price-hint chips; the line amount (from the API calculation, "-"
 * until available; for domestic quotes also the GST %); and, when cost display is on, a dashed amber box with
 * an optional cost rate and the line margin.
 * Actions: every edit calls `onChange(patch, clearKeys)`; picking a product calls `onProduct` (parent sets
 * default packing); tapping a hint chip puts that rate into the rate input; trash calls `onRemove`.
 * The card calls no API itself, except through PriceHintChips (GET /products/:id/price-hints).
 *
 * @param props.index - zero-based position (shown as index + 1).
 * @param props.line - the line's form state (all text).
 * @param props.product - the selected product (unit, packing options), or undefined if none/unknown.
 * @param props.productOptions - options for the product picker.
 * @param props.currency - currency for labels and money formatting (INR for domestic).
 * @param props.type - quote type; domestic shows the GST % next to the amount.
 * @param props.buyerId - selected buyer ('' if none); lets the hints show "last price to this buyer".
 * @param props.showCost - whether the internal cost-rate box is visible (never printed, NFR-04).
 * @param props.calcLine - this line's calculation result from POST /quotes/calculate (`amount`, `gst_rate`,
 *   `margin`), or undefined while not available. Amounts are decimal strings, only formatted here.
 * @param props.errors - messages to show under this line's inputs.
 * @param props.canRemove - whether the trash button is shown.
 * @param props.onChange - patch the line; the optional second argument lists error keys to clear.
 * @param props.onProduct - called with the new product id.
 * @param props.onRemove - delete this line.
 * Local state: none (all state lives in QuoteForm).
 */
export function LineCard({ index, line, product, productOptions, currency, type, buyerId, showCost, calcLine, errors, canRemove, onChange, onProduct, onRemove }: {
  index: number;
  line: LineState;
  product: Product | undefined;
  productOptions: Option[];
  currency: Currency;
  type: QuoteType;
  buyerId: string;
  showCost: boolean;
  calcLine: CalcResult['lines'][number] | undefined;
  errors: LineErrors;
  canRemove: boolean;
  onChange: (patch: Partial<LineState>, clear?: (keyof LineErrors)[]) => void;
  onProduct: (productId: string) => void;
  onRemove: () => void;
}) {
  // human-friendly line number for headings and aria labels
  const n = index + 1;
  // product unit (MT / KG / QTL) shown in the quantity and rate labels; '' until a product is chosen
  const unit = product?.unit ?? '';
  // the product's preset packing choices (may be empty)
  const options = product?.packing_options ?? [];
  // true when packing is free text (user chose "Other" or the saved value is not a preset)
  const other = isOtherPacking(line, product);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-forest-900">{s.productN(n)}</h3>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label={s.removeProduct(n)}
            className="tap -mr-2 grid place-items-center rounded-lg text-red-700 hover:bg-red-50">
            <Trash2 className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      <SearchSelect
        label={s.product} value={line.product_id} options={productOptions} onChange={onProduct}
        placeholder={s.productPlaceholder} searchPlaceholder={s.productSearch} emptyText={s.noProducts} error={errors.product_id}
      />

      {/* packing: dropdown of presets + "Other" box when the product has presets, otherwise a plain optional
         text box */}
      {line.product_id && (options.length > 0 ? (
        <>
          <Select
            label={s.packing} value={other ? OTHER : line.packing} error={errors.packing}
            onChange={(e) => {
              // choosing "Other" keeps a custom text but clears a preset value so the user types their own
              const v = e.target.value;
              if (v === OTHER) onChange({ packingOther: true, packing: options.includes(line.packing) ? '' : line.packing });
              else onChange({ packingOther: false, packing: v }, ['packing']);
            }}
          >
            <option value="">{s.packingChoose}</option>
            {options.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value={OTHER}>{s.packingOther}</option>
          </Select>
          {other && (
            <Input label={s.packingOtherLabel} value={line.packing} maxLength={200} onChange={(e) => onChange({ packing: e.target.value }, ['packing'])} />
          )}
        </>
      ) : (
        <Input label={s.packing} optional value={line.packing} maxLength={200} error={errors.packing} onChange={(e) => onChange({ packing: e.target.value }, ['packing'])} />
      ))}

      <div className="grid grid-cols-2 gap-3">
        <NumberInput
          label={s.quantity(unit)} decimals={3} value={line.quantity} error={errors.quantity}
          onChange={(v) => onChange({ quantity: v }, ['quantity'])}
        />
        <NumberInput
          label={s.rate(currency, unit)} decimals={2} value={line.rate} error={errors.rate}
          onChange={(v) => onChange({ rate: v }, ['rate'])}
        />
      </div>

      {line.product_id && (
        <PriceHintChips productId={line.product_id} buyerId={buyerId} currency={currency} onPick={(rate) => onChange({ rate }, ['rate'])} />
      )}

      <div className="flex items-baseline justify-between gap-3 rounded-lg bg-forest-50 px-3 py-2">
        <div className="text-sm text-forest-900">
          {s.lineAmount}
          {type === 'domestic' && calcLine && <span className="ml-2 text-ink/60">{s.lineGst(qty(calcLine.gst_rate) || '0')}</span>}
        </div>
        <div className="text-lg font-bold tabular-nums text-forest-900" aria-live="polite">{calcLine ? money(calcLine.amount, currency) : '—'}</div>
      </div>

      {showCost && (
        <div className="space-y-2 rounded-lg border border-dashed border-amber-600 bg-amber-50 p-3">
          <NumberInput
            label={s.costRate(currency, unit || '…')} optional decimals={2} value={line.cost_rate} error={errors.cost_rate}
            hint={s.costNotPrinted} onChange={(v) => onChange({ cost_rate: v }, ['cost_rate'])}
          />
          <div className="flex items-baseline justify-between gap-3 text-sm text-amber-900">
            <span>{s.margin}</span>
            <span className="font-semibold tabular-nums">{calcLine?.margin ? money(calcLine.margin, currency) : '—'}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
