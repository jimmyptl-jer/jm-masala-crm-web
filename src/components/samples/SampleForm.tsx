/**
 * Create / edit sample form, shown on the full page /samples/new and /samples/:id/edit (pages/SampleEdit.tsx).
 * Calls POST /samples (create) and PATCH /samples/:id (edit); on success invalidates the react-query keys ['samples'] and ['sample'].
 * Sections: Buyer (pick an existing one or add a new buyer without losing what was typed), Sample (product, grade, weight, date requested),
 * Dispatch (date sent, courier, tracking), Feedback (status, result, the buyer's words) and Internal (owner, cost, notes). The cost is
 * shown and sent only for an administrator. Validation: a small copy of the API's rules runs first; API errors come back as
 * ApiError.fields and are shown under the same inputs.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { BuyerForm } from '@/components/BuyerForm';
import { Button, ErrorNote, Input, Select, Sheet, Textarea, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { todayIST } from '@/lib/format';
import { useBuyers, useTeam } from '@/lib/hooks';
import { APPROVED_PRODUCT_NAMES } from '@/lib/products';
import { SAMPLE_RESULTS, SAMPLE_STATUSES, type Sample, type SampleResult, type SampleStatus } from '@/lib/samples';
import { t } from '@/strings';

const s = t.samples.form;
const SECTION = 'space-y-3 rounded-xl border border-line p-4';

/** A form section with a heading. */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className={SECTION}><h2 className="text-sm font-semibold text-ink">{title}</h2>{children}</section>;

/** The form's own copy of the sample: every input is text until it is sent. */
interface Form {
  buyer_id: string; product_name: string; grade: string; weight_g: string; requested_at: string; sent_at: string; courier: string; tracking_no: string;
  status: SampleStatus; result: SampleResult; feedback: string; cost_inr: string; assigned_to: string; notes: string;
}

const start = (i?: Sample, buyerId?: string): Form => ({
  buyer_id: i?.buyer_id ?? buyerId ?? '', product_name: i?.product_name ?? '', grade: i?.grade ?? '', weight_g: i ? String(i.weight_g) : '', requested_at: i?.requested_at ?? todayIST(),
  sent_at: i?.sent_at ?? '', courier: i?.courier ?? '', tracking_no: i?.tracking_no ?? '', status: i?.status ?? 'requested', result: i?.result ?? 'pending', feedback: i?.feedback ?? '',
  cost_inr: i?.cost_inr ?? '', assigned_to: i?.assigned_to ?? '', notes: i?.notes ?? '',
});

/**
 * @param props.initial — sample being edited; leave out to create one.
 * @param props.defaultBuyerId — buyer to start with on a new sample (from ?buyer=… in the address).
 * @param props.onSaved — called with the Sample the API returned after a successful save.
 * @param props.onCancel — called by the Cancel button (nothing is saved).
 */
export function SampleForm({ initial, defaultBuyerId, onSaved, onCancel }: { initial?: Sample; defaultBuyerId?: string; onSaved: (x: Sample) => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const buyersQuery = useBuyers({ archived: 'false' });
  const team = useTeam();
  const [f, setF] = useState<Form>(() => start(initial, defaultBuyerId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);
  const [addingBuyer, setAddingBuyer] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const buyers = buyersQuery.data ?? [];
  // an archived buyer of the sample being edited is not in the active list; keep it selectable so the form does not blank it
  const buyerOptions = initial && !buyers.some((b) => b.id === initial.buyer_id) ? [{ id: initial.buyer_id, company_name: initial.buyer_name }, ...buyers] : buyers;

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.buyer_id) e.buyer_id = s.needBuyer;
    if (!f.product_name) e.product_name = s.needProduct;
    if (!/^\d+$/.test(f.weight_g.trim()) || Number(f.weight_g) < 1) e.weight_g = s.needWeight;
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
      // only what the API accepts; '' is stored as empty; a sales user never sends the cost
      const body = {
        buyer_id: f.buyer_id, product_name: f.product_name, grade: f.grade, weight_g: Number(f.weight_g), requested_at: f.requested_at, sent_at: f.sent_at || null, courier: f.courier, tracking_no: f.tracking_no,
        status: f.status, result: f.result, feedback: f.feedback, assigned_to: f.assigned_to || null, notes: f.notes, ...(isAdmin ? { cost_inr: f.cost_inr || null } : {}),
      };
      const saved = initial ? await api.patch<Sample>(`/samples/${initial.id}`, body) : await api.post<Sample>('/samples', body);
      // the list, and the open sample (key ['sample', id], used by the detail and edit pages) so they show what was just saved
      await qc.invalidateQueries({ queryKey: ['samples'] });
      await qc.invalidateQueries({ queryKey: ['sample'] });
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

      <Section title={s.productSection}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label={s.product} value={f.product_name} error={errors.product_name} onChange={(e) => set('product_name', e.target.value)}>
            <option value="">{s.chooseProduct}</option>
            {APPROVED_PRODUCT_NAMES.map((n) => <option key={n}>{n}</option>)}
          </Select>
          <Input label={s.grade} optional value={f.grade} error={errors.grade} onChange={(e) => set('grade', e.target.value)} />
          <Input label={s.weight} inputMode="numeric" value={f.weight_g} error={errors.weight_g} onChange={(e) => set('weight_g', e.target.value)} placeholder="250" />
          <Input label={s.requestedAt} type="date" value={f.requested_at} error={errors.requested_at} onChange={(e) => set('requested_at', e.target.value)} />
        </div>
      </Section>

      <Section title={s.shipSection}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label={s.sentAt} type="date" optional hint={s.sentHint} value={f.sent_at} error={errors.sent_at} onChange={(e) => set('sent_at', e.target.value)} />
          <Input label={s.courier} optional value={f.courier} error={errors.courier} onChange={(e) => set('courier', e.target.value)} placeholder="DHL" />
          <Input label={s.tracking} optional value={f.tracking_no} error={errors.tracking_no} onChange={(e) => set('tracking_no', e.target.value)} />
        </div>
      </Section>

      <Section title={s.feedbackSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={s.status} value={f.status} error={errors.status} onChange={(e) => set('status', e.target.value as SampleStatus)}>{SAMPLE_STATUSES.map((x) => <option key={x} value={x}>{t.samples.status[x]}</option>)}</Select>
          <Select label={s.result} value={f.result} error={errors.result} onChange={(e) => set('result', e.target.value as SampleResult)}>{SAMPLE_RESULTS.map((x) => <option key={x} value={x}>{t.samples.result[x]}</option>)}</Select>
        </div>
        <Textarea label={s.feedback} optional rows={4} value={f.feedback} error={errors.feedback} onChange={(e) => set('feedback', e.target.value)} />
      </Section>

      <Section title={s.internalSection}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={s.owner} optional value={f.assigned_to} error={errors.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}><option value="">{t.samples.unassigned}</option>{team.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select>
          {isAdmin && <Input label={s.cost} optional hint={s.costHint} inputMode="decimal" value={f.cost_inr} error={errors.cost_inr} onChange={(e) => set('cost_inr', e.target.value)} placeholder="450" />}
        </div>
        <Textarea label={s.notes} optional rows={3} value={f.notes} error={errors.notes} onChange={(e) => set('notes', e.target.value)} />
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
