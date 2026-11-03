/**
 * Add / edit partner form (shown inside a Sheet). Calls POST /partners (create) and PATCH /partners/:id (edit) and invalidates the
 * react-query keys ['partners'] and ['partner', id]. It holds the company itself: name, legal name, roles (chips, one or more), status, contact
 * and address, GST number and PAN, notes. Contacts, services and documents are edited on the partner's profile page. Errors from the API
 * (ApiError.fields) are shown under the same inputs.
 */
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Button, ErrorNote, Input, Select, Textarea, errorMessage, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { revealFirstError } from '@/lib/formFeedback';
import { PARTNER_ROLES, PARTNER_STATUSES, type Partner, type PartnerInput, type PartnerRole, type PartnerStatus } from '@/lib/partners';
import { t } from '@/strings';

const s = t.partners;
const GSTIN_RE = /^\d{2}[A-Z0-9]{13}$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

type Form = { [K in Exclude<keyof PartnerInput, 'roles' | 'status'>]-?: string } & { roles: PartnerRole[]; status: PartnerStatus };

function start(p?: Partner): Form {
  return {
    company_name: p?.company_name ?? '', legal_name: p?.legal_name ?? '', roles: p?.roles ?? [], status: p?.status ?? 'active', email: p?.email ?? '', phone: p?.phone ?? '', whatsapp: p?.whatsapp ?? '',
    website: p?.website ?? '', address: p?.address ?? '', city: p?.city ?? '', state: p?.state ?? '', country: p?.country ?? 'India', postal_code: p?.postal_code ?? '', gstin: p?.gstin ?? '', pan: p?.pan ?? '',
    registration_details: p?.registration_details ?? '', notes: p?.notes ?? '',
  };
}

/** @param initial the partner being edited (leave out to add one). @param onSaved gets the partner the API returned. @param onCancel closes without saving. */
export function PartnerForm({ initial, onSaved, onCancel }: { initial?: Partner; onSaved: (p: Partner) => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<Form>(() => start(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);
  const text = (key: keyof Form) => ({ value: f[key] as string, error: errors[key], onChange: (e: { target: { value: string } }) => setF((c) => ({ ...c, [key]: e.target.value })) });
  const toggleRole = (role: PartnerRole) => setF((c) => ({ ...c, roles: c.roles.includes(role) ? c.roles.filter((r) => r !== role) : [...c.roles, role] }));

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!f.company_name.trim()) e.company_name = s.f.enterName;
    if (f.roles.length === 0) e.roles = s.f.chooseRole;
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid e-mail address.';
    if (f.gstin.trim() && !GSTIN_RE.test(f.gstin.trim().toUpperCase())) e.gstin = 'A GST number has 15 characters.';
    if (f.pan.trim() && !PAN_RE.test(f.pan.trim().toUpperCase())) e.pan = 'A PAN has 10 characters, like ABCDE1234F.';
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const form = ev.currentTarget as HTMLFormElement;
    const local = validate();
    setErrors(local);
    if (Object.keys(local).length) { toast(t.common.fixFields, 'error'); revealFirstError(form); return; }
    setBusy(true);
    setFatal(null);
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    try {
      const saved = initial ? await api.patch<Partner>(`/partners/${initial.id}`, body) : await api.post<Partner>('/partners', body);
      void qc.invalidateQueries({ queryKey: ['partners'] });
      void qc.invalidateQueries({ queryKey: ['partner', saved.id] });
      toast(initial ? s.f.updated : s.f.added);
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) { setErrors(e.fields); toast(t.common.fixFields, 'error'); revealFirstError(form); }
      else { setFatal(e); toast(errorMessage(e) || t.common.saveFailed, 'error'); }
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-6">
      <section aria-labelledby="pf-company" className="space-y-4">
        <h3 id="pf-company" className="text-sm font-bold uppercase tracking-wide text-ink-muted">{s.f.sectionCompany}</h3>
        <Input label={s.f.company} autoFocus {...text('company_name')} />
        <Input label={s.f.legal} optional {...text('legal_name')} />
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">{s.f.roles}</legend>
          <p className="mb-2 text-xs text-ink-muted">{s.f.rolesHint}</p>
          <div className="flex flex-wrap gap-2">
            {PARTNER_ROLES.map((role) => {
              const on = f.roles.includes(role);
              return <button key={role} type="button" aria-pressed={on} title={s.roleHint[role]} onClick={() => toggleRole(role)}
                className={clsx('tap rounded-full border px-3 text-sm font-semibold transition-colors', on ? 'border-paprika bg-paprika-50 text-paprika-700' : 'border-line-strong bg-surface text-ink-secondary hover:bg-surface-hover')}>{s.roles[role]}</button>;
            })}
          </div>
          {errors.roles && <p role="alert" className="mt-1 text-xs text-danger-ink">{errors.roles}</p>}
        </fieldset>
        <Select label={s.f.status} value={f.status} onChange={(e) => setF((c) => ({ ...c, status: e.target.value as PartnerStatus }))} error={errors.status}>
          {PARTNER_STATUSES.map((x) => <option key={x} value={x}>{s.status[x]}</option>)}
        </Select>
      </section>

      <section aria-labelledby="pf-contact" className="space-y-4">
        <h3 id="pf-contact" className="text-sm font-bold uppercase tracking-wide text-ink-muted">{s.f.sectionContact}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={s.f.phone} optional type="tel" {...text('phone')} />
          <Input label={s.f.whatsapp} optional type="tel" {...text('whatsapp')} />
          <Input label={s.f.email} optional type="email" {...text('email')} />
          <Input label={s.f.website} optional {...text('website')} />
        </div>
        <Textarea label={s.f.address} optional rows={2} {...text('address')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={s.f.city} optional {...text('city')} />
          <Input label={s.f.state} optional {...text('state')} />
          <Input label={s.f.country} optional {...text('country')} />
          <Input label={s.f.postal} optional {...text('postal_code')} />
        </div>
      </section>

      <section aria-labelledby="pf-tax" className="space-y-4">
        <h3 id="pf-tax" className="text-sm font-bold uppercase tracking-wide text-ink-muted">{s.f.sectionTax}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={s.f.gstin} optional {...text('gstin')} />
          <Input label={s.f.pan} optional {...text('pan')} />
        </div>
        <Textarea label={s.f.registration} optional rows={2} {...text('registration_details')} />
        <Textarea label={s.f.notes} optional rows={3} {...text('notes')} />
      </section>

      {fatal !== null && <ErrorNote error={fatal} />}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>{s.f.cancel}</Button>
        <Button type="submit" loading={busy}>{s.f.save}</Button>
      </div>
    </form>
  );
}
