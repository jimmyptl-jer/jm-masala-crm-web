/**
 * The Buyer CRM inputs of the buyer form: business profile, lead source, pipeline stage, what the buyer wants
 * and follow-up. Rendered by components/BuyerForm.tsx under the "Sales tracking" heading, always visible (also in the
 * quote form's quick-add). Holds no state of its own except the product search box: the parent owns the
 * form values (`f`), `set` and the API's per-field `errors`.
 * API: only GET /products (useProducts, for the product checklist) and GET /team (useTeam, for "Assigned to").
 * The stage / channel / business-type lists are in lib/crm.ts; their words in strings/buyersCrm.ts.
 */
import { useMemo, useState } from 'react';
import { BUSINESS_TYPES, CHANNELS, STAGES } from '@/lib/crm';
import { useProducts, useTeam } from '@/lib/hooks';
import type { BuyerInput, BusinessType, Channel, Stage } from '@/lib/types';
import { isApprovedProduct } from '@/lib/products';
import { t } from '@/strings';
import { Input, Select, Textarea } from '../ui';

const c = t.crm;

/**
 * @param props.f — current form values. @param props.set — set one field: set('stage', 'contacted').
 * @param props.errors — field name -> message (from the API); shown under the matching input.
 */
export function BuyerCrmFields({ f, set, errors }: {
  f: BuyerInput;
  set: <K extends keyof BuyerInput>(k: K, v: BuyerInput[K]) => void;
  errors: Record<string, string>;
}) {
  // Every active catalogue product as a checkbox, labelled with its grade ("Cumin Seeds (Singapore 99 Machine Clean)") so
  // the different grades of one spice can be ticked separately. The label text is what is stored on the buyer.
  const products = useProducts();
  const names = useMemo(
    () => [...new Set((products.data ?? []).filter((p) => isApprovedProduct(p.name)).map((p) => (p.grade ? `${p.name} (${p.grade})` : p.name)))].sort((a, b) => a.localeCompare(b)),
    [products.data],
  );
  // text typed in the small search box above the checklist
  const [find, setFind] = useState('');
  const team = useTeam();
  const text = (k: keyof BuyerInput) => (f[k] as string | null | undefined) ?? '';
  const chosen = f.interested_products ?? [];
  // Keep products the buyer already has even if they were archived or renamed in the catalogue.
  const allNames = [...new Set([...names, ...chosen.filter((name) => isApprovedProduct(name))])];
  const shown = find.trim() ? allNames.filter((n) => n.toLowerCase().includes(find.trim().toLowerCase())) : allNames;

  /** Adds or removes one product name from the interest list. */
  const toggle = (name: string) => set('interested_products', chosen.includes(name) ? chosen.filter((x) => x !== name) : [...chosen, name]);

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-[17px] font-bold leading-6 text-ink">{c.secPipeline}</h3>
        <Select label={c.stage} value={f.stage ?? 'new_lead'} onChange={(e) => set('stage', e.target.value as Stage)} error={errors.stage}>
          {STAGES.map((s) => <option key={s} value={s}>{c.stages[s]}</option>)}
        </Select>
        {f.stage === 'lost' && <Input label={c.lostReason} value={text('lost_reason')} onChange={(e) => set('lost_reason', e.target.value)} error={errors.lost_reason} />}
        <label className="tap flex items-start gap-3 text-base text-forest-900">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-forest-700" checked={!!f.qualified} onChange={(e) => set('qualified', e.target.checked)} />
          {c.qualified}
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-[17px] font-bold leading-6 text-ink">{c.secSource}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={c.channel} optional value={f.channel ?? ''} onChange={(e) => set('channel', (e.target.value || null) as Channel | null)} error={errors.channel}>
            <option value="">{c.chooseOne}</option>
            {CHANNELS.map((x) => <option key={x} value={x}>{c.channels[x]}</option>)}
          </Select>
          <Input label={c.leadSource} optional value={text('lead_source')} onChange={(e) => set('lead_source', e.target.value)} hint={c.leadSourceHint} error={errors.lead_source} />
          <Input label={c.sourceDetail} optional value={text('source_detail')} onChange={(e) => set('source_detail', e.target.value)} error={errors.source_detail} />
          <Input label={c.firstInquiry} optional type="date" value={text('first_inquiry_date')} onChange={(e) => set('first_inquiry_date', e.target.value || null)} error={errors.first_inquiry_date} />
          <Input label={c.leadCost} optional inputMode="decimal" value={text('lead_cost')} onChange={(e) => set('lead_cost', e.target.value)} hint={c.leadCostHint} error={errors.lead_cost} />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[17px] font-bold leading-6 text-ink">{c.secInterest}</h3>
        <fieldset>
          <legend className="mb-1 flex w-full items-center justify-between gap-2 text-sm font-medium text-forest-900">
            <span>{c.interestedProducts}</span>
            <span className="font-normal text-fg-muted">{c.productsSelected(chosen.length)}</span>
          </legend>
          <p className="mb-2 text-sm text-fg-muted">{c.productsHint}</p>
          <Input label={c.productsFind} type="search" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} autoComplete="off" />
          <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-forest-900/20 bg-white p-1">
            {shown.length === 0 ? <p className="p-3 text-sm text-fg-muted">{c.productsNone}</p> : (
              <ul className="grid sm:grid-cols-2">
                {shown.map((n) => (
                  <li key={n}>
                    <label className="flex min-h-[40px] cursor-pointer items-center gap-3 rounded-md px-2 py-1 text-base text-forest-900 hover:bg-forest-50">
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-forest-700" checked={chosen.includes(n)} onChange={() => toggle(n)} />
                      <span className="min-w-0 break-words">{n}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {chosen.length > 0 && (
            <button type="button" onClick={() => set('interested_products', [])} className="tap mt-1 text-sm font-medium text-forest-800 underline">{c.productsClear}</button>
          )}
        </fieldset>
        <Textarea label={c.requirements} optional value={text('requirements')} onChange={(e) => set('requirements', e.target.value)} rows={3} hint={c.requirementsHint} error={errors.requirements} />
      </section>

      <section className="space-y-3">
        <h3 className="text-[17px] font-bold leading-6 text-ink">{c.secFollowup}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={c.nextAction} optional value={text('next_action')} onChange={(e) => set('next_action', e.target.value)} hint={c.nextActionHint} error={errors.next_action} />
          <Input label={c.nextFollowup} optional type="date" value={text('next_followup')} onChange={(e) => set('next_followup', e.target.value || null)} error={errors.next_followup} />
          <Select label={c.assignedTo} optional value={f.assigned_to ?? ''} onChange={(e) => set('assigned_to', e.target.value || null)}>
            <option value="">{c.unassigned}</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
        </div>
        <label className="tap flex items-start gap-3 text-base text-forest-900">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-forest-700" checked={!!f.marketing_opt_out} onChange={(e) => set('marketing_opt_out', e.target.checked)} />
          <span>{c.optOut}<span className="block text-sm text-fg-muted">{c.optOutHint}</span></span>
        </label>
      </section>

      <section className="space-y-3">
        <h3 className="text-[17px] font-bold leading-6 text-ink">{c.secProfile}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={c.businessType} optional value={f.business_type ?? ''} onChange={(e) => set('business_type', (e.target.value || null) as BusinessType | null)}>
            <option value="">{c.chooseOne}</option>
            {BUSINESS_TYPES.map((x) => <option key={x} value={x}>{c.businessTypes[x]}</option>)}
          </Select>
          <Input label={c.designation} optional value={text('designation')} onChange={(e) => set('designation', e.target.value)} />
          <Input label={c.website} optional inputMode="url" value={text('website')} onChange={(e) => set('website', e.target.value)} />
          <Input label={c.linkedin} optional inputMode="url" value={text('linkedin')} onChange={(e) => set('linkedin', e.target.value)} />
        </div>
        <Textarea label={c.registration} optional value={text('registration_details')} onChange={(e) => set('registration_details', e.target.value)} rows={2} hint={c.registrationHint} />
      </section>
    </div>
  );
}
