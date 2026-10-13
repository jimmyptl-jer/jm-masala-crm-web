/**
 * Settings > Bank details form (admin only, FR-04). Saves through useSectionSave -> PUT /settings; cache
 * key ['settings'] is updated.
 * Rendered by pages/Settings.tsx inside a Section. Composes Input and SaveBar. The bank details are printed
 * on the quote PDFs.
 */

import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui';
import type { Settings } from '@/lib/types';
import { t } from '@/strings';
import { SaveBar, useSectionSave } from './shared';

const s = t.settings;

/**
 * "Bank details" section of Settings (admin). Fields: bank name, branch, account number, IFSC, SWIFT and AD
 * code (the last two are for export quotes). The PDFs print exactly what is saved here.
 * @param props.settings — current settings from GET /settings; used once to fill the form.
 * Save -> run({ bank }) -> PUT /settings (see shared.tsx saveSettings) -> "Settings saved" toast, cache
 * ['settings'] refreshed. There is no client-side validation: the API accepts any text (length limits only)
 * and its messages, keyed 'bank.<field>', are shown under the matching input.
 * IFSC and SWIFT are upper-cased as you type. Local state: f (the six strings).
 */
export function BankPanel({ settings }: { settings: Settings }) {
  // Save plumbing from shared.tsx: busy, errors (from the API), fatal (other errors) and run().
  const { busy, errors, fatal, run } = useSectionSave();
  const b = settings.bank;
  // Editable copy of the bank fields (missing values become '').
  const [f, setF] = useState({
    bank_name: b.bank_name ?? '', branch: b.branch ?? '', account_no: b.account_no ?? '',
    ifsc: b.ifsc ?? '', swift: b.swift ?? '', ad_code: b.ad_code ?? '',
  });
  // Update one field.
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  // Message for a field: the API reports it as 'bank.<field>', so look that up first.
  const err = (k: string) => errors[`bank.${k}`] ?? errors[k];

  /**
   * Form submit: send the bank block with run(). @param ev — submit event (default browser submit is
   * prevented).
   */
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    await run({ bank: f });
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Input label={s.bankName} value={f.bank_name} onChange={(e) => set('bank_name', e.target.value)} error={err('bank_name')} autoComplete="off" />
      <Input label={s.branch} value={f.branch} onChange={(e) => set('branch', e.target.value)} error={err('branch')} autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={s.accountNo} inputMode="numeric" value={f.account_no} onChange={(e) => set('account_no', e.target.value)} error={err('account_no')} autoComplete="off" />
        <Input label={s.ifsc} value={f.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} autoCapitalize="characters" error={err('ifsc')} autoComplete="off" />
        <Input label={s.swift} value={f.swift} onChange={(e) => set('swift', e.target.value.toUpperCase())} autoCapitalize="characters" error={err('swift')} autoComplete="off" />
        <Input label={s.adCode} value={f.ad_code} onChange={(e) => set('ad_code', e.target.value)} error={err('ad_code')} autoComplete="off" />
      </div>
      <SaveBar busy={busy} fatal={fatal} />
    </form>
  );
}
