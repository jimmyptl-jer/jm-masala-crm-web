/**
 * One product line of the quotation builder, laid out like the supplied mockup: a header (number, product, grade, Duplicate
 * and remove), Product and Grade pickers, Packaging, Quantity, Rate and the live line amount, the selected grade's
 * specification chips (purity, moisture, cleaning) with an expandable Specifications section, price hints, and, when "Show
 * cost" is on, the internal cost and margin. Used by pages/QuoteForm.tsx, once per line.
 *
 * Product and grade: a product (for example Cumin Seeds) has one catalogue record per grade, so the Product picker lists the
 * approved product names and the Grade picker lists that product's active grades; the line stores the id of the chosen grade
 * record (`product_id`). Only the approved JM Masala products are offered (lib/products.ts).
 * Unit: the quantity and rate are in the product's own unit (MT, kg or quintal), shown in the labels. A line cannot switch unit
 * because the API calculates amounts in the product unit; mixing units would need an API change.
 * API: none directly; PriceHintChips loads GET /products/:id/price-hints. The amount and margin shown come from POST
 * /quotes/calculate (done by the parent); all numbers are strings and nothing is calculated here (only the API does money
 * maths). The cost box is internal and never printed (NFR-04); with no cost entered it says so instead of showing values.
 * Actions: every edit calls `onChange(patch, clearKeys)`; choosing a product or grade calls `onProduct` (the parent sets the
 * default packing); Duplicate calls `onDuplicate`; the trash calls `onRemove`.
 *
 * @param props.index - zero-based position (shown as index + 1, two digits).
 * @param props.line - the line's form state (all text).
 * @param props.product - the selected grade record (unit, packing options, specs), or undefined if none/unknown.
 * @param props.catalogue - the products that can be chosen: approved and active, plus any archived one this form still uses.
 * @param props.currency - currency for labels and money formatting (INR for domestic).
 * @param props.type - quote type; domestic shows the GST % next to the amount.
 * @param props.buyerId - selected buyer ('' if none); lets the hints show "last price to this buyer".
 * @param props.showCost - whether the internal cost box is visible.
 * @param props.calcLine - this line's calculation result (`amount`, `gst_rate`, `margin`), or undefined while not available.
 * @param props.errors - messages to show under this line's inputs.
 * @param props.canRemove - whether the trash button is shown.
 * @param props.onChange / onProduct / onDuplicate / onRemove - see above.
 * Local state: none (all state lives in QuoteForm); the Specifications section is a native <details>.
 */
import { Copy, Trash2 } from 'lucide-react';
import { money, qty } from '@/lib/format';
import type { CalcResult, Currency, Product, QuoteType } from '@/lib/types';
import { t } from '@/strings';
import { Input, NumberInput, Select } from '@/components/ui';
import { isOtherPacking, OTHER, type LineState } from './model';
import { hasRoute, PROBE_ID } from '@/lib/config';
import { PriceHintChips } from './PriceHintChips';

// all words for the quote form come from strings/quoteForm.ts
const s = t.quoteForm;

// error text per input of a line (undefined = no error); built from `errors['lines.<i>.<field>']`
export interface LineErrors { product_id?: string; packing?: string; quantity?: string; rate?: string; cost_rate?: string }

/** One small specification chip ("Purity: 99% min"). */
const Chip = ({ children }: { children: string }) => <span className="inline-flex h-6 items-center rounded-full border border-line bg-surface-muted px-2.5 text-xs font-bold text-ink-secondary">{children}</span>;

export function LineCard({ index, line, product, catalogue, currency, type, buyerId, showCost, calcLine, errors, canRemove, onChange, onProduct, onDuplicate, onRemove }: {
  index: number;
  line: LineState;
  product: Product | undefined;
  catalogue: Product[];
  currency: Currency;
  type: QuoteType;
  buyerId: string;
  showCost: boolean;
  calcLine: CalcResult['lines'][number] | undefined;
  errors: LineErrors;
  canRemove: boolean;
  onChange: (patch: Partial<LineState>, clear?: (keyof LineErrors)[]) => void;
  onProduct: (productId: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const nn = String(n).padStart(2, '0');
  // product unit (MT / KG / QTL) shown in the quantity and rate labels; '' until a product is chosen
  const unit = product?.unit ?? '';
  const options = product?.packing_options ?? [];
  const other = isOtherPacking(line, product);

  // product names in catalogue order, and the grade records of the chosen product
  const names = [...new Set(catalogue.map((p) => p.name))];
  const grades = product ? catalogue.filter((p) => p.name === product.name) : [];
  const specs = product ? [product.purity && `${s.specPurity}: ${product.purity}`, product.moisture && `${s.specMoisture}: ${product.moisture}`, product.cleaning].filter((x): x is string => !!x) : [];

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card" role="group" aria-label={s.productN(n)}>
      <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-ink">{nn} {'·'} {product?.name ?? s.productN(n)}</h3>
          <p className="text-sm text-ink-muted">{product ? `${product.grade ?? s.standardGrade} · ${s.productLine}` : s.productLine}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onDuplicate} aria-label={s.duplicateAria(n)}
            className="tap inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-bold text-ink hover:border-line-strong hover:bg-surface-hover">
            <Copy className="h-4 w-4" aria-hidden />{s.duplicate}
          </button>
          {canRemove && (
            <button type="button" onClick={onRemove} aria-label={s.removeProduct(n)} className="tap grid place-items-center rounded-md text-danger-ink hover:bg-danger-bg">
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 md:gap-x-4">
        <Select
          label={s.product} value={product?.name ?? ''} error={errors.product_id}
          onChange={(e) => {
            // a new product starts on its first active grade; the grade can then be changed
            const first = catalogue.find((p) => p.name === e.target.value && !p.archived) ?? catalogue.find((p) => p.name === e.target.value);
            if (first) onProduct(first.id);
          }}
        >
          <option value="">{s.productPlaceholder}</option>
          {names.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
        </Select>

        <Select label={s.grade} value={product?.id ?? ''} disabled={!product} onChange={(e) => onProduct(e.target.value)}>
          {!product && <option value="">{s.gradeFirst}</option>}
          {grades.map((g) => <option key={g.id} value={g.id}>{g.grade ?? s.standardGrade}{g.archived ? ` (${s.archivedWord})` : ''}</option>)}
        </Select>

        {/* packing: dropdown of presets + "Other" box when the product has presets, otherwise a plain optional text box */}
        {line.product_id ? (options.length > 0 ? (
          <div className="space-y-3">
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
            {other && <Input label={s.packingOtherLabel} value={line.packing} maxLength={200} onChange={(e) => onChange({ packing: e.target.value }, ['packing'])} />}
          </div>
        ) : (
          <Input label={s.packing} optional value={line.packing} maxLength={200} error={errors.packing} onChange={(e) => onChange({ packing: e.target.value }, ['packing'])} />
        )) : <div className="hidden md:block" />}

        <NumberInput label={s.quantity(unit)} decimals={3} value={line.quantity} error={errors.quantity} onChange={(v) => onChange({ quantity: v }, ['quantity'])} />
        <NumberInput label={s.rate(currency, unit)} decimals={2} value={line.rate} error={errors.rate} onChange={(v) => onChange({ rate: v }, ['rate'])} />

        <div>
          <p className="mb-1.5 text-xs font-bold text-ink-secondary">{s.lineAmount}{type === 'domestic' && calcLine && <span className="ml-2 font-normal text-ink-muted">{s.lineGst(qty(calcLine.gst_rate) || '0')}</span>}</p>
          <p className="flex min-h-tap items-center text-lg font-bold tabular-nums text-ink" aria-live="polite">{calcLine ? money(calcLine.amount, currency) : '—'}</p>
        </div>
      </div>

      {product && (
        <div className="mt-3 rounded-lg bg-surface-muted p-3">
          <p className="mb-1.5 text-sm font-bold text-ink">{s.selectedSpecs}</p>
          {specs.length > 0 ? <div className="flex flex-wrap gap-1.5">{specs.map((x) => <Chip key={x}>{x}</Chip>)}</div> : <p className="text-sm text-ink-muted">{s.noGradeSpecs}</p>}
          <details className="group mt-2">
            <summary className="cursor-pointer text-sm font-bold text-paprika hover:underline">{s.specsToggle}</summary>
            <p className="mt-1.5 whitespace-pre-line text-sm text-ink-secondary">{product.specification || s.noSpecText}</p>
            <p className="mt-1 text-xs text-ink-muted">{s.specsSnapshotNote}</p>
          </details>
        </div>
      )}

      {line.product_id && hasRoute('GET', `/products/${PROBE_ID}/price-hints`) && (
        <div className="mt-3"><PriceHintChips productId={line.product_id} buyerId={buyerId} currency={currency} onPick={(rate) => onChange({ rate }, ['rate'])} /></div>
      )}

      {showCost && (
        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-warning bg-warning-bg p-3">
          <NumberInput
            label={s.costRate(currency, unit || '…')} optional decimals={2} value={line.cost_rate} error={errors.cost_rate}
            hint={s.costNotPrinted} onChange={(v) => onChange({ cost_rate: v }, ['cost_rate'])}
          />
          {line.cost_rate ? (
            <div className="flex items-baseline justify-between gap-3 text-sm text-warning-ink">
              <span>{s.margin}</span>
              <span className="font-bold tabular-nums">{calcLine?.margin ? money(calcLine.margin, currency) : '—'}</span>
            </div>
          ) : <p className="text-sm text-warning-ink">{s.noCostYet}</p>}
        </div>
      )}
    </div>
  );
}
