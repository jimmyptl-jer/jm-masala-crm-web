/**
 * Add / edit / remove one service of a partner (what it supplies or does in one of its roles) together with its documents. The API saves
 * services as a whole list, so every change sends the full list with PATCH /partners/:id { services } and refreshes ['partner', id] and
 * ['partners']. The rate, currency, rate unit, minimum order and payment terms are shown and sent only to administrators; for a sales user
 * those fields are left out of the request, so the API keeps what an administrator entered. `service` is null while closed, 'new' to add, or
 * the service to edit.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Button, ErrorNote, Input, Select, Sheet, Textarea, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { RATE_CURRENCIES, unitsFor, type PartnerDetail, type PartnerRole, type PartnerService } from '@/lib/partners';
import { t } from '@/strings';

const s = t.partners.p;
const sv = s.sv;
const ADMIN_FIELDS = ['rate_amount', 'rate_currency', 'rate_unit', 'minimum_order_quantity', 'payment_terms'] as const;

interface Draft {
  id?: string;
  role: PartnerRole;
  service_name: string;
  products: string;
  areas: string;
  lead_time_days: string;
  capacity_notes: string;
  notes: string;
  rate_amount: string;
  rate_currency: string;
  rate_unit: string;
  minimum_order_quantity: string;
  payment_terms: string;
  documents: { name: string; document_number: string; expires_at: string }[];
}

const list = (text: string) => text.split(',').map((x) => x.trim()).filter(Boolean);
const toDraft = (partner: PartnerDetail, sv0?: PartnerService): Draft => ({
  id: sv0?.id, role: sv0?.role ?? partner.roles[0] ?? 'other', service_name: sv0?.service_name ?? '', products: (sv0?.products_supplied ?? []).join(', '), areas: (sv0?.service_areas ?? []).join(', '),
  lead_time_days: sv0?.lead_time_days == null ? '' : String(sv0.lead_time_days), capacity_notes: sv0?.capacity_notes ?? '', notes: sv0?.notes ?? '',
  rate_amount: sv0?.rate_amount ?? '', rate_currency: sv0?.rate_currency ?? 'INR', rate_unit: sv0?.rate_unit ?? '', minimum_order_quantity: sv0?.minimum_order_quantity ?? '', payment_terms: sv0?.payment_terms ?? '',
  documents: (sv0?.documents ?? []).map((d) => ({ name: d.name, document_number: d.document_number ?? '', expires_at: d.expires_at ?? '' })),
});

/** The request body of one service. The admin-only fields are included only for an administrator. */
function toBody(d: Draft, admin: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...(d.id ? { id: d.id } : {}), role: d.role, service_name: d.service_name.trim(), products_supplied: list(d.products), service_areas: list(d.areas),
    lead_time_days: d.lead_time_days.trim() === '' ? null : Number(d.lead_time_days), capacity_notes: d.capacity_notes.trim(), notes: d.notes.trim(),
    documents: d.documents.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), document_number: x.document_number.trim(), expires_at: x.expires_at || null })),
  };
  if (admin) {
    body.rate_amount = d.rate_amount.trim(); body.rate_currency = d.rate_amount.trim() ? d.rate_currency : null; body.rate_unit = d.rate_unit;
    body.minimum_order_quantity = d.minimum_order_quantity.trim(); body.payment_terms = d.payment_terms.trim();
  }
  return body;
}

/** An existing service as it goes back in the list: unchanged, with only the fields this reader may see. */
function keep(x: PartnerService, admin: boolean): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...x };
  if (!admin) for (const k of ADMIN_FIELDS) delete copy[k];
  return copy;
}

export function ServiceSheet({ partner, service, onClose }: { partner: PartnerDetail; service: PartnerService | 'new' | null; onClose: () => void }) {
  return <Sheet wide open={service !== null} onClose={onClose} title={service === 'new' ? s.addService : s.editService}>{service !== null && <ServiceForm key={service === 'new' ? 'new' : service.id} partner={partner} service={service} onClose={onClose} />}</Sheet>;
}

function ServiceForm({ partner, service, onClose }: { partner: PartnerDetail; service: PartnerService | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const editing = service === 'new' ? null : service;
  const [f, setF] = useState<Draft>(() => toDraft(partner, editing ?? undefined));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);
  const index = editing ? partner.services.findIndex((x) => x.id === editing.id) : partner.services.length;
  const err = (key: string) => errors[`services.${index}.${key}`];
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setF((c) => ({ ...c, [key]: value }));
  const text = (key: 'service_name' | 'products' | 'areas' | 'lead_time_days' | 'capacity_notes' | 'notes' | 'rate_amount' | 'minimum_order_quantity' | 'payment_terms', apiKey?: string) => ({ value: f[key], error: err(apiKey ?? key), onChange: (e: { target: { value: string } }) => set(key, e.target.value) });
  const units = unitsFor(f.role);

  async function save(next: Record<string, unknown>[]) {
    setBusy(true);
    setFatal(null);
    try {
      await api.patch(`/partners/${partner.id}`, { services: next });
      void qc.invalidateQueries({ queryKey: ['partner', partner.id] });
      void qc.invalidateQueries({ queryKey: ['partners'] });
      toast(sv.saved);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) setErrors(e.fields); else setFatal(e);
    } finally { setBusy(false); }
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const mine = toBody(f, isAdmin);
    void save(editing ? partner.services.map((x) => (x.id === editing.id ? mine : keep(x, isAdmin))) : [...partner.services.map((x) => keep(x, isAdmin)), mine]);
  }

  const setDoc = (i: number, key: 'name' | 'document_number' | 'expires_at', value: string) => set('documents', f.documents.map((d, j) => (j === i ? { ...d, [key]: value } : d)));

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label={sv.role} value={f.role} onChange={(e) => { const role = e.target.value as PartnerRole; setF((c) => ({ ...c, role, rate_unit: unitsFor(role).includes(c.rate_unit) ? c.rate_unit : '' })); }} error={err('role')}>
          {partner.roles.map((r) => <option key={r} value={r}>{t.partners.roles[r]}</option>)}
        </Select>
        <Input label={sv.name} optional autoFocus {...text('service_name')} />
        <Input label={sv.products} optional hint={sv.listHint} {...text('products', 'products_supplied')} />
        <Input label={sv.areas} optional hint={sv.listHint} {...text('areas', 'service_areas')} />
        <Input label={sv.lead} optional inputMode="numeric" {...text('lead_time_days')} />
      </div>
      <Textarea label={sv.capacity} optional rows={2} {...text('capacity_notes')} />

      {isAdmin && (
        <fieldset className="space-y-3 rounded-lg border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{sv.rate}</legend>
          <p className="text-xs text-ink-muted">{sv.adminOnly}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label={sv.rate} optional inputMode="decimal" {...text('rate_amount')} />
            <Select label={sv.currency} value={f.rate_currency} onChange={(e) => set('rate_currency', e.target.value)} error={err('rate_currency')}>{RATE_CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
            <Select label={sv.unit} optional value={f.rate_unit} onChange={(e) => set('rate_unit', e.target.value)} error={err('rate_unit')}><option value="">—</option>{units.map((u) => <option key={u} value={u}>{s.units[u] ?? u}</option>)}</Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={sv.minimum} optional {...text('minimum_order_quantity')} />
            <Input label={sv.payment} optional {...text('payment_terms')} />
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink">{sv.documents}</legend>
        {f.documents.length === 0 && <p className="text-sm text-ink-muted">{sv.noDocuments}</p>}
        {f.documents.map((d, i) => (
          <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_10rem_auto]">
            <Input label={sv.docName} value={d.name} error={errors[`services.${index}.documents.${i}.name`]} onChange={(e) => setDoc(i, 'name', e.target.value)} />
            <Input label={sv.docNumber} optional value={d.document_number} onChange={(e) => setDoc(i, 'document_number', e.target.value)} />
            <Input label={sv.docExpiry} optional type="date" value={d.expires_at} error={errors[`services.${index}.documents.${i}.expires_at`]} onChange={(e) => setDoc(i, 'expires_at', e.target.value)} />
            <Button variant="ghost" aria-label={`Remove ${d.name || 'document'}`} onClick={() => set('documents', f.documents.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => set('documents', [...f.documents, { name: '', document_number: '', expires_at: '' }])}><Plus className="h-4 w-4" />{sv.addDocument}</Button>
      </fieldset>

      <Textarea label={sv.notes} optional rows={2} {...text('notes')} />
      {fatal !== null && <ErrorNote error={fatal} />}
      <div className="flex items-center justify-between gap-2">
        {editing ? <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(`${sv.remove}?`)) void save(partner.services.filter((x) => x.id !== editing.id).map((x) => keep(x, isAdmin))); }}>{sv.remove}</Button> : <span />}
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>{t.partners.f.cancel}</Button><Button type="submit" loading={busy}>{sv.save}</Button></div>
      </div>
    </form>
  );
}
