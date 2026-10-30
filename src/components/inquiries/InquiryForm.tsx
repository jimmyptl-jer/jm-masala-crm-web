/**
 * Create / edit inquiry form, shown on the full page /inquiries/new and /inquiries/:id/edit (pages/InquiryEdit.tsx).
 * Calls POST /inquiries (create) and PATCH /inquiries/:id (edit); on success invalidates the react-query keys ['inquiries'] and ['inquiry'].
 * Five sections: Buyer (pick an existing one or add a new buyer without losing what was typed), Product requirements (one or more
 * lines, each with its own grade, purity, quantity, unit, packaging and specifications), Trade details, Communication and Follow-up.
 * Validation: a small copy of the API's rules runs first (buyer, at least one product, quantities above zero); API errors come back
 * as ApiError.fields (keys like `products.0.quantity`) and are shown under the same inputs.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { BuyerForm } from '@/components/BuyerForm';
import { Button, ErrorNote, Input, Select, Sheet, Textarea, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { todayIST } from '@/lib/format';
import { useBuyers, useTeam } from '@/lib/hooks';
import { APPROVED_PRODUCT_NAMES } from '@/lib/products';
import type { Currency, Inquiry, InquiryInput, InquiryLine, InquirySource, InquiryStatus, InquiryUnit } from '@/lib/types';
import { t } from '@/strings';

const s = t.inquiries.form;
const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'AED', 'INR'];
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW'];
const UNITS: InquiryUnit[] = ['MT', 'KG', 'QTL'];
const STATUSES = Object.keys(t.inquiries.status) as InquiryStatus[];
const SOURCES = Object.keys(t.inquiries.source) as InquirySource[];

const blankLine = (): InquiryLine => ({ product_id: null, product_name: '', grade: null, purity: null, quantity: '', unit: 'KG', packaging: null, specifications: null });
const SECTION = 'space-y-3 rounded-xl border border-line p-4';

/** A form section with a heading. */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className={SECTION}><h2 className="text-sm font-semibold text-ink">{title}</h2>{children}</section>;

/**
 * @param props.initial — inquiry being edited; leave out to create one.
 * @param props.defaultBuyerId — buyer to start with on a new inquiry (from ?buyer=… in the address).
 * @param props.onSaved — called with the Inquiry the API returned after a successful save.
 * @param props.onCancel — called by the Cancel button (nothing is saved).
 */
export function InquiryForm({ initial, defaultBuyerId, onSaved, onCancel }: { initial?: Inquiry; defaultBuyerId?: string; onSaved: (i: Inquiry) => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const buyersQuery = useBuyers({ archived: 'false' });
  const team = useTeam();
  const [f, setF] = useState<InquiryInput>(() => initial ?? { buyer_id: defaultBuyerId ?? '', inquiry_date: todayIST(), products: [blankLine()], status: 'new', source: 'email' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);
  const [addingBuyer, setAddingBuyer] = useState(false);

  const set = <K extends keyof InquiryInput>(k: K, v: InquiryInput[K]) => setF((x) => ({ ...x, [k]: v }));
  const text = (k: keyof InquiryInput) => (f[k] as string | null | undefined) ?? '';
  const setLine = (i: number, patch: Partial<InquiryLine>) => set('products', f.products.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const buyers = buyersQuery.data ?? [];
  // an archived buyer of the inquiry being edited is not in the active list; keep it selectable so the form does not blank it
  const buyerOptions = initial && !buyers.some((b) => b.id === initial.buyer_id) ? [{ id: initial.buyer_id, company_name: initial.buyer_name }, ...buyers] : buyers;

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.buyer_id) e.buyer_id = s.needBuyer;
    if (f.products.length === 0) e.products = s.needOne;
    f.products.forEach((l, i) => {
      if (!l.product_name) e[`products.${i}.product_name`] = s.needProduct;
      if (!(Number(l.quantity) > 0)) e[`products.${i}.quantity`] = s.needQuantity;
    });
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setFatal(null);
    try {
      // only what the API accepts; '' is stored as empty
      const { buyer_id, inquiry_date, products, destination_country, destination_port, currency, incoterm, source, original_message, status, assigned_to, next_followup, notes } = f;
      const body = { buyer_id, inquiry_date, products, destination_country, destination_port, currency: currency || null, incoterm: incoterm || null, source: source || null, original_message, status, assigned_to: assigned_to || null, next_followup: next_followup || null, notes };
      const saved = initial ? await api.patch<Inquiry>(`/inquiries/${initial.id}`, body) : await api.post<Inquiry>('/inquiries', body);
      // the list, and the open inquiry (key ['inquiry', id], used by the detail and edit pages) so they show what was just saved
      await qc.invalidateQueries({ queryKey: ['inquiries'] });
      await qc.invalidateQueries({ queryKey: ['inquiry'] });
      toast(s.saved);
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      else setFatal(e);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Section title={s.buyerSection}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Select wrapperClassName="min-w-0 flex-1" label={s.buyer} value={f.buyer_id} error={errors.buyer_id} onChange={(e) => set('buyer_id', e.target.value)}>
            <option value="">{s.chooseBuyer}</option>
            {buyerOptions.map((b) => <option key={b.id} value={b.id}>{b.company_name}</option>)}
          </Select>
          <Button type="button" variant="secondary" onClick={() => setAddingBuyer(true)}><Plus className="h-4 w-4" />{s.newBuyer}</Button>
        </div>
      </Section>

      <Section title={s.productsSection}>
        {errors.products && <p role="alert" className="text-sm text-danger-ink">{errors.products}</p>}
        <div className="space-y-3">
          {f.products.map((line, i) => <div key={i} className="space-y-3 rounded-lg border border-line bg-surface-muted/40 p-3">
            <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{s.productN(i + 1)}</h3>
              {f.products.length > 1 && <button type="button" onClick={() => set('products', f.products.filter((_, n) => n !== i))} className="tap inline-flex items-center gap-1 rounded-lg px-2 text-sm text-ink-muted hover:bg-surface-hover" aria-label={`${s.removeProduct} ${i + 1}`}><Trash2 className="h-4 w-4" />{s.removeProduct}</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select label={s.product} value={line.product_name} error={errors[`products.${i}.product_name`]} onChange={(e) => setLine(i, { product_name: e.target.value })}>
                <option value="">{s.chooseProduct}</option>
                {APPROVED_PRODUCT_NAMES.map((n) => <option key={n}>{n}</option>)}
              </Select>
              <Input label={s.grade} optional value={line.grade ?? ''} onChange={(e) => setLine(i, { grade: e.target.value })} />
              <Input label={s.purity} optional value={line.purity ?? ''} onChange={(e) => setLine(i, { purity: e.target.value })} placeholder="99%" />
              <div className="grid grid-cols-2 gap-2">
                <Input label={s.quantity} inputMode="decimal" value={line.quantity} error={errors[`products.${i}.quantity`]} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <Select label={s.unit} value={line.unit} onChange={(e) => setLine(i, { unit: e.target.value as InquiryUnit })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={s.packaging} optional value={line.packaging ?? ''} onChange={(e) => setLine(i, { packaging: e.target.value })} placeholder="25 kg PP bag" />
              <Input label={s.specifications} optional value={line.specifications ?? ''} onChange={(e) => setLine(i, { specifications: e.target.value })} />
            </div>
          </div>)}
        </div>
        <Button type="button" variant="secondary" onClick={() => set('products', [...f.products, blankLine()])}><Plus className="h-4 w-4" />{s.addProduct}</Button>
      </Section>

      <Section title={s.tradeSection}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label={s.country} optional value={text('destination_country')} onChange={(e) => set('destination_country', e.target.value)} />
          <Input label={s.port} optional value={text('destination_port')} onChange={(e) => set('destination_port', e.target.value)} />
          <Select label={s.incoterm} optional value={text('incoterm')} onChange={(e) => set('incoterm', e.target.value)}><option value="">{s.none}</option>{INCOTERMS.map((x) => <option key={x}>{x}</option>)}</Select>
          <Select label={s.currency} optional value={text('currency')} onChange={(e) => set('currency', (e.target.value || null) as Currency | null)}><option value="">{s.none}</option>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</Select>
        </div>
      </Section>

      <Section title={s.commSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={s.date} type="date" value={text('inquiry_date')} error={errors.inquiry_date} onChange={(e) => set('inquiry_date', e.target.value)} />
          <Select label={s.source} optional value={text('source')} onChange={(e) => set('source', (e.target.value || null) as InquirySource | null)}><option value="">{s.none}</option>{SOURCES.map((x) => <option key={x} value={x}>{t.inquiries.source[x]}</option>)}</Select>
        </div>
        <Textarea label={s.message} hint={s.messageHint} optional rows={4} value={text('original_message')} onChange={(e) => set('original_message', e.target.value)} />
      </Section>

      <Section title={s.followSection}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select label={s.owner} optional value={text('assigned_to')} error={errors.assigned_to} onChange={(e) => set('assigned_to', e.target.value || null)}><option value="">{t.inquiries.unassigned}</option>{team.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
          <Select label={s.status} value={f.status ?? 'new'} onChange={(e) => set('status', e.target.value as InquiryStatus)}>{STATUSES.map((x) => <option key={x} value={x}>{t.inquiries.status[x]}</option>)}</Select>
          <Input label={s.nextFollowup} type="date" optional value={text('next_followup')} error={errors.next_followup} onChange={(e) => set('next_followup', e.target.value || null)} />
        </div>
        <Textarea label={s.notes} optional rows={3} value={text('notes')} onChange={(e) => set('notes', e.target.value)} />
      </Section>

      {fatal != null && <ErrorNote error={fatal} />}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>{s.cancel}</Button>
        <Button type="submit" loading={busy}>{busy ? s.saving : s.save}</Button>
      </div>

      <Sheet wide open={addingBuyer} onClose={() => setAddingBuyer(false)} title={s.newBuyerTitle}>
        <BuyerForm onCancel={() => setAddingBuyer(false)} onSaved={(b) => { setAddingBuyer(false); set('buyer_id', b.id); void buyersQuery.refetch(); }} />
      </Sheet>
    </form>
  );
}
