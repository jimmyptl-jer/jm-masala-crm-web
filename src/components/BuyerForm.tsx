/**
 * Create / edit buyer form (FR-15 quick-add uses the same form).
 * Calls POST /buyers (create) and PATCH /buyers/:id (edit); on success invalidates the react-query key
 * ['buyers'].
 * Validation: a copy of the API's buyer rules runs first (company name; domestic state + GSTIN consistency;
 * export country); server errors come back as ApiError.fields and are shown under the same inputs.
 * Used by pages/Buyers.tsx, pages/BuyerDetail.tsx and the quote form. Composes Segmented, Input, Select,
 * Textarea, Button, ErrorNote from ui.tsx. Reads INDIAN_STATES and GSTIN_RE from lib/india.ts. SRS: FR-15,
 * BR-06, BR-09.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { BuyerCrmFields } from '@/components/buyers/BuyerCrmFields';
import { ApiError, api } from '@/lib/api';
import { GSTIN_RE, INDIAN_STATES } from '@/lib/india';
import type { Buyer, BuyerInput, Currency, Incoterm, QuoteType } from '@/lib/types';
import { t } from '@/strings';
import { Button, ErrorNote, Input, Segmented, Select, Textarea, useToast } from './ui';

// Shorthand for this form's strings.
const s = t.buyerForm;
// Currencies selectable for an export buyer. Domestic buyers are always INR (BR-09), so INR is not offered
// here.
const EXPORT_CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'AED'];
// Default incoterm options for an export buyer (optional).
const INCOTERMS: Incoterm[] = ['FOB', 'CIF', 'CFR', 'EXW'];

/**
 * Form to create or edit a buyer; always shown inside a Sheet. Used by Buyers (Add buyer), BuyerDetail
 * (Edit) and the quote form's quick-add (FR-15).
 * @param props.initial — buyer being edited; leave out to create a new one. Its values pre-fill the form.
 * @param props.onSaved — called with the Buyer the API returned after a successful save; the caller closes
 *   the sheet, navigates or selects the buyer.
 * @param props.onCancel — called by the Cancel button (nothing is saved).
 * @param props.defaultType — type of a NEW buyer, 'export' by default; it sets the starting currency (INR
 *   for domestic, USD for export).
 * What the user sees: Export/Domestic toggle, company name, contact, phone, WhatsApp, email, address, city;
 * then for Domestic a state dropdown (picking it fills both state name and the 2-digit state code, BR-06)
 * and GSTIN, for Export a country, default currency, default incoterm and default port; notes; Cancel and
 * Save.
 * Save: validate() runs in the browser first (stops with messages if it fails). Then POST /buyers (new) or
 * PATCH /buyers/:id (edit), then invalidates ['buyers'] (every buyer list refreshes), shows a "Buyer
 * added/updated" toast and calls onSaved(saved).
 * API errors: an ApiError with `fields` is copied straight into `errors`; the form shows keys company_name,
 * phone, email, country, state (or state_code), gstin and default_currency under their inputs. Any other
 * error (network, 500) is shown in an ErrorNote above the buttons.

 * Sales tracking: the Buyer CRM fields (BuyerCrmFields: pipeline stage, lead source, interested products, follow-up)
 * are always shown under Notes, for a new buyer and when editing.
 * Local state: f = all form values (same shape as BuyerInput; text stays text; an empty field is sent as ''
 * and the API stores it as null), errors = per-field messages, busy = request running (Save shows a spinner
 * and is disabled, which also blocks Enter-key resubmits), fatal = non-field error.
 */
export function BuyerForm({ initial, onSaved, onCancel, defaultType = 'export' }:
  { initial?: Buyer; onSaved: (b: Buyer) => void; onCancel: () => void; defaultType?: QuoteType }) {
  // Query client, used to refresh the buyer lists after saving.
  const qc = useQueryClient();
  // Shows the success toast.
  const toast = useToast();
  // Form values. When editing, the whole loaded buyer is the start value (including id, archived and
  // quote_count, which are sent back on save: the API ignores unknown keys and re-applies the same archived
  // value).
  const [f, setF] = useState<BuyerInput>(() => initial ?? { type: defaultType, company_name: '', default_currency: defaultType === 'domestic' ? 'INR' : 'USD' });
  // Field name -> message, from validate() or from the API's ApiError.fields.
  const [errors, setErrors] = useState<Record<string, string>>({});
  // True while the save request runs.
  const [busy, setBusy] = useState(false);
  // A non-field error (network or server) to show in an ErrorNote.
  const [fatal, setFatal] = useState<unknown>(null);

  /** Update one form field: set('city', 'Rajkot'). Keeps the other values. */
  const set = <K extends keyof BuyerInput>(k: K, v: BuyerInput[K]) => setF((x) => ({ ...x, [k]: v }));
  /** Read a field as a string for an input's value: null/undefined become ''. */
  const text = (k: keyof BuyerInput) => (f[k] as string | null | undefined) ?? '';
  // True when the buyer type is Domestic (Indian, INR, GST); switches which fields are shown.
  const domestic = f.type === 'domestic';

  /**
   * Handler for the Export/Domestic toggle. Switching to domestic sets currency INR and clears the default
   * incoterm; switching to export keeps the current currency unless it is INR (then USD). Other typed
   * values are kept.
   * The toggle is disabled when editing a buyer whose quote_count is above 0 (changing type would not fit
   * existing quotes); note that quote_count is only present when the buyer came from the list endpoint.
   */
  const changeType = (type: QuoteType) =>
    setF((x) => ({ ...x, type, default_currency: type === 'domestic' ? 'INR' : x.default_currency && x.default_currency !== 'INR' ? x.default_currency : 'USD', default_incoterm: type === 'domestic' ? null : x.default_incoterm }));

  /**
   * Browser-side check that mirrors the API rules (checkBuyer in api/src/schemas.ts) so errors appear
   * instantly: company name required; Domestic needs a state (error key `state`), a GSTIN (if typed)
   * matching the 15-character pattern and starting with the chosen state code; Export needs a country.
   * @returns a field -> message map; an empty object means the form is valid. The API checks everything
   *   again on save.
   */
  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.company_name.trim()) e.company_name = `${s.companyName} ${t.common.required}`;
    if (domestic) {
      if (!f.state_code) e.state = s.chooseState;
      const g = text('gstin').trim().toUpperCase();
      if (g && !GSTIN_RE.test(g)) e.gstin = s.gstinHint;
      else if (g && f.state_code && g.slice(0, 2) !== f.state_code) e.gstin = `GSTIN starts with ${g.slice(0, 2)} but the state code is ${f.state_code}`;
    } else if (!text('country').trim()) e.country = `${s.country} ${t.common.required}`;
    return e;
  };

  /**
   * Form submit handler (Save button or Enter key).
   * Stops the browser's own submit, validates, then POST /buyers or PATCH /buyers/:id with the form values
   * (GSTIN trimmed and upper-cased). On success: refresh ['buyers'], toast, onSaved(saved). On an ApiError
   * with fields: show them under the inputs. Otherwise: show the error in an ErrorNote. busy is cleared in
   * all cases.
   * @param ev — the form's submit event.
   */
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setFatal(null);
    try {
      const body = { ...f, gstin: text('gstin').trim().toUpperCase() };
      const saved = initial
        ? await api.patch<Buyer>(`/buyers/${initial.id}`, body)
        : await api.post<Buyer>('/buyers', body);
      await qc.invalidateQueries({ queryKey: ['buyers'] });
      toast(initial ? 'Buyer updated' : 'Buyer added');
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      else setFatal(e);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Segmented<QuoteType> label={s.type} value={f.type} onChange={changeType} disabled={!!initial && (initial.quote_count ?? 0) > 0}
        options={[{ value: 'export', label: t.common.type.export }, { value: 'domestic', label: t.common.type.domestic }]} />
      <Input label={s.companyName} value={f.company_name} onChange={(e) => set('company_name', e.target.value)} error={errors.company_name} autoComplete="organization" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={s.contactName} optional value={text('contact_name')} onChange={(e) => set('contact_name', e.target.value)} />
        <Input label={s.phone} optional type="tel" inputMode="tel" value={text('phone')} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
        <Input label={s.whatsapp} optional type="tel" inputMode="tel" value={text('whatsapp')} onChange={(e) => set('whatsapp', e.target.value)} hint="With country code, e.g. +971…" />
        <Input label={s.email} optional type="email" inputMode="email" value={text('email')} onChange={(e) => set('email', e.target.value)} error={errors.email} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea label={s.address} optional value={text('address')} onChange={(e) => set('address', e.target.value)} rows={2} />
        <Input label={s.city} optional value={text('city')} onChange={(e) => set('city', e.target.value)} />
      </div>

      {/* Domestic buyers: state + GSTIN. Export buyers: country, currency, incoterm, port. */}
      {domestic ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={s.state} value={text('state_code')} error={errors.state ?? errors.state_code}
            onChange={(e) => {
              const st = INDIAN_STATES.find((x) => x.code === e.target.value);
              setF((x) => ({ ...x, state: st?.name ?? null, state_code: st?.code ?? null }));
            }}>
            <option value="">{s.chooseState}</option>
            {INDIAN_STATES.map((st) => <option key={st.code} value={st.code}>{st.name} ({st.code})</option>)}
          </Select>
          <Input label={s.gstin} optional value={text('gstin')} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} autoCapitalize="characters" hint={s.gstinHint} error={errors.gstin} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={s.country} value={text('country')} onChange={(e) => set('country', e.target.value)} error={errors.country} autoComplete="country-name" />
          <Select label={s.currency} value={f.default_currency ?? 'USD'} onChange={(e) => set('default_currency', e.target.value as Currency)} error={errors.default_currency}>
            {EXPORT_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select label={s.incoterm} optional value={f.default_incoterm ?? ''} onChange={(e) => set('default_incoterm', (e.target.value || null) as Incoterm | null)}>
            <option value="">{t.common.none}</option>
            {INCOTERMS.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Input label={s.port} optional value={text('default_port')} onChange={(e) => set('default_port', e.target.value)} />
        </div>
      )}
      <Textarea label={s.notes} optional value={text('notes')} onChange={(e) => set('notes', e.target.value)} rows={2} />

      {/* Buyer CRM: pipeline, lead source, what the buyer wants, follow-up (always visible) */}
      <div className="border-t border-forest-900/15 pt-4">
        <h3 className="font-serif text-xl font-semibold text-forest-900">{t.crm.moreDetails}</h3>
        <p className="mb-3 text-sm text-ink/60">{t.crm.moreDetailsHint}</p>
        <BuyerCrmFields f={f} set={set} errors={errors} />
      </div>

      {fatal !== null && <ErrorNote error={fatal} />}
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>{t.common.cancel}</Button>
        <Button type="submit" className="flex-1" loading={busy}>{busy ? t.common.saving : s.save}</Button>
      </div>
    </form>
  );
}
