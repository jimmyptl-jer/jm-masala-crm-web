/**
 * Composer step 3 "Recipients": choose who gets the campaign - every eligible buyer, buyers matching filters (country, buyer
 * type, interested products, pipeline stage, qualified, open quotation, not contacted for N days), or buyers ticked one by one.
 * A live line says how many buyers will really receive it and why others are left out (opted out, no e-mail address, invalid
 * address, repeated address); below it the list of recipients.
 * API: POST /marketing/audience/preview (debounced, key ['marketing', 'audience', audience]); GET /buyers (useBuyers) and
 * GET /products (useProducts) to offer countries, products and the buyer checklist. The server decides eligibility.
 * Used by pages/CampaignNew.tsx.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Button, Card, Input, Segmented, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { baseName } from '@/lib/marketing';
import { BUSINESS_TYPES } from '@/lib/crm';
import { useBuyers, useDebounced, useProducts } from '@/lib/hooks';
import type { Audience, AudienceFilters, AudiencePreview, CampaignInput } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;
const c = t.crm;
const GROUPS: AudienceFilters['groups'] = ['prospect', 'qualified', 'opportunity', 'customer', 'lost'];

/** A tick box with a label. */
function Check({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={clsx('flex min-h-[40px] items-center gap-3 rounded-md px-2 text-base text-forest-900', disabled ? 'opacity-50' : 'cursor-pointer hover:bg-forest-50')}>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-forest-700" checked={on} disabled={disabled} onChange={onChange} />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}

/** @param props.form — the campaign being built (its audience is edited here). @param props.set — change some fields of it. */
export function RecipientsStep({ form, set }: { form: CampaignInput; set: (p: Partial<CampaignInput>) => void }) {
  const a = form.audience;
  const f = a.filters;
  const buyers = useBuyers();
  const products = useProducts();
  const [find, setFind] = useState('');

  /** Changes the audience: setA({ mode: 'filtered' }) or setF({ countries: [...] }). */
  const setA = (p: Partial<Audience>) => set({ audience: { ...a, ...p } });
  const setF = (p: Partial<AudienceFilters>) => set({ audience: { ...a, filters: { ...f, ...p } } });
  /** Adds or removes a value in a list. */
  const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const countries = useMemo(() => [...new Set((buyers.data ?? []).map((b) => (b.country ?? '').trim()).filter(Boolean))].sort(), [buyers.data]);
  const productNames = useMemo(() => [...new Set((products.data ?? []).map((p) => baseName(p.name)))].sort(), [products.data]);

  const debounced = useDebounced(a, 400);
  const preview = useQuery({
    queryKey: ['marketing', 'audience', debounced],
    queryFn: () => api.post<AudiencePreview>('/marketing/audience/preview', debounced),
    placeholderData: keepPreviousData,
  });
  const p = preview.data;
  const left = p ? [
    p.excluded.opted_out && m.excludedOptedOut(p.excluded.opted_out),
    p.excluded.no_email && m.excludedNoEmail(p.excluded.no_email),
    p.excluded.invalid_email && m.excludedInvalid(p.excluded.invalid_email),
    p.excluded.duplicate_email && m.excludedDuplicate(p.excluded.duplicate_email),
  ].filter(Boolean) : [];

  const MODES: { key: Audience['mode']; label: string; hint: string }[] = [
    { key: 'all', label: m.modeAll, hint: m.modeAllHint },
    { key: 'filtered', label: m.modeFiltered, hint: m.modeFilteredHint },
    { key: 'selected', label: m.modeSelected, hint: m.modeSelectedHint },
  ];

  const q = find.trim().toLowerCase();
  const pickable = (buyers.data ?? []).filter((b) => !q || `${b.company_name} ${b.contact_name ?? ''} ${b.email ?? ''}`.toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="mb-3 font-serif text-xl font-semibold text-forest-900 md:text-2xl">{m.recipientsHeading}</h2>
        <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label={m.recipientsHeading}>
          {MODES.map((x) => (
            <button
              key={x.key} type="button" role="radio" aria-checked={a.mode === x.key} onClick={() => setA({ mode: x.key })}
              className={clsx('rounded-lg border px-3 py-2 text-left', a.mode === x.key ? 'border-forest-700 bg-forest-50 ring-2 ring-forest-700/30' : 'border-forest-900/20 bg-white hover:bg-forest-50')}
            >
              <span className="block font-semibold text-forest-900">{x.label}</span>
              <span className="block text-sm text-ink/60">{x.hint}</span>
            </button>
          ))}
        </div>

        {a.mode === 'filtered' && (
          <div className="mt-4 space-y-4">
            <Segmented<AudienceFilters['type']> label={m.filterType} value={f.type} onChange={(v) => setF({ type: v })}
              options={[{ value: 'all', label: m.typeAll }, { value: 'export', label: t.common.type.export }, { value: 'domestic', label: t.common.type.domestic }]} />
            {countries.length > 0 && (
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-forest-900">{m.filterCountries}</legend>
                <div className="flex flex-wrap gap-2">
                  {countries.map((x) => (
                    <button key={x} type="button" aria-pressed={f.countries.includes(x)} onClick={() => setF({ countries: flip(f.countries, x) })}
                      className={clsx('min-h-[40px] rounded-full border px-3 text-sm font-medium', f.countries.includes(x) ? 'border-forest-700 bg-forest-700 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}>{x}</button>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-forest-900">{m.filterProducts}</legend>
              <div className="grid max-h-56 overflow-y-auto rounded-lg border border-forest-900/20 bg-white p-1 sm:grid-cols-2 md:grid-cols-3">
                {productNames.map((x) => <Check key={x} label={x} on={f.products.includes(x)} onChange={() => setF({ products: flip(f.products, x) })} />)}
              </div>
            </fieldset>
            <div className="grid gap-4 md:grid-cols-2">
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-forest-900">{m.filterBusiness}</legend>
                {BUSINESS_TYPES.map((x) => <Check key={x} label={c.businessTypes[x]} on={f.business_types.includes(x)} onChange={() => setF({ business_types: flip(f.business_types, x) })} />)}
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-forest-900">{m.filterStage}</legend>
                {GROUPS.map((x) => <Check key={x} label={c.groups[x]} on={f.groups.includes(x)} onChange={() => setF({ groups: flip(f.groups, x) })} />)}
              </fieldset>
            </div>
            <div>
              <Check label={m.filterQualified} on={f.qualified_only} onChange={() => setF({ qualified_only: !f.qualified_only })} />
              <Check label={m.filterOpenQuotes} on={f.open_quotes_only} onChange={() => setF({ open_quotes_only: !f.open_quotes_only })} />
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-forest-900">{m.filterInactive}</legend>
              <div className="flex flex-wrap gap-2">
                {m.inactiveOptions.map((o) => (
                  <button key={String(o.value)} type="button" aria-pressed={f.inactive_days === o.value} onClick={() => setF({ inactive_days: o.value })}
                    className={clsx('min-h-[40px] rounded-full border px-3 text-sm font-medium', f.inactive_days === o.value ? 'border-forest-700 bg-forest-700 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}>{o.label}</button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {a.mode === 'selected' && (
          <div className="mt-4">
            <Input label={m.pickBuyersFind} type="search" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} autoComplete="off" />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="text-sm text-ink/60">{m.productsSelected(a.buyer_ids.length)}</span>
              <Button variant="secondary" onClick={() => setA({ buyer_ids: [...new Set([...a.buyer_ids, ...pickable.filter((b) => b.email && !b.marketing_opt_out).map((b) => b.id)])] })}>{m.selectAllShown}</Button>
              {a.buyer_ids.length > 0 && <button type="button" onClick={() => setA({ buyer_ids: [] })} className="tap text-sm font-medium text-forest-800 underline">{c.productsClear}</button>}
            </div>
            <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-forest-900/20 bg-white p-1">
              {buyers.isPending ? <Spinner /> : (
                <ul className="grid md:grid-cols-2">
                  {pickable.map((b) => (
                    <li key={b.id}>
                      <Check
                        label={`${b.company_name}${b.email ? '' : ' (no e-mail)'}${b.marketing_opt_out ? ' (opted out)' : ''}`}
                        on={a.buyer_ids.includes(b.id)} disabled={!b.email || b.marketing_opt_out}
                        onChange={() => setA({ buyer_ids: flip(a.buyer_ids, b.id) })}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p aria-live="polite" className={clsx('text-lg font-semibold', p && p.count === 0 ? 'text-red-700' : 'text-forest-900')}>
          {p ? m.willReceive(p.count) : <Spinner />}
        </p>
        {left.length > 0 && <p className="mt-1 text-sm text-ink/70">{m.leftOut} {left.join(' · ')}.</p>}
        {p && p.count === 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{m.noRecipients}</p>}
        {p && p.buyers.length > 0 && (
          <>
            <h3 className="mb-1 mt-3 text-sm font-medium text-forest-900">{m.recipientList}{p.count > p.buyers.length ? ` (${m.showingFirst(p.buyers.length)})` : ''}</h3>
            <ul className="grid max-h-64 overflow-y-auto rounded-lg border border-cream-200 md:grid-cols-2">
              {p.buyers.map((b) => (
                <li key={b.id} className="truncate px-3 py-1.5 text-sm text-ink/80">{b.company_name} <span className="text-ink/50">{b.email}</span></li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
