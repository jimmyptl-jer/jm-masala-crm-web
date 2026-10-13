/**
 * Settings > Defaults form (admin only): default quote validity days and follow-up days (SRS follow-up
 * rule, BR-07/BR-08 defaults).
 * Saves through useSectionSave -> PUT /settings; cache key ['settings'] is updated. Used for the validity
 * of new quotes and the first follow-up date after a quote is issued.
 * Rendered by pages/Settings.tsx. Composes NumberInput and SaveBar.
 */

import { useState, type FormEvent } from 'react';
import { NumberInput } from '@/components/ui';
import type { Settings } from '@/lib/types';
import { t } from '@/strings';
import { SaveBar, useSectionSave } from './shared';

const s = t.settings;
/**
 * True when `v` is a whole number (digits only) between min and max inclusive. Used for the day-count
 * fields.
 * @param v — the typed text. @param min / max — allowed bounds.
 */
const inRange = (v: string, min: number, max: number) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;

/**
 * "Defaults" section of Settings (admin): default quote validity in days (1 to 365) and default follow-up
 * in days (0 to 60). New quotes start with the validity; after a quote is sent its first follow-up date is
 * that many days ahead.
 * @param props.settings — current settings from GET /settings; used once to fill the form.
 * Save: range checks in the browser (messages under the inputs), then run({ validity_days, followup_days })
 * -> PUT /settings -> toast. The inputs are NumberInput with decimals=0 and hold text; they are converted
 * to numbers only when sent (they are day counts, not money).
 * Local state: validity, followup (strings).
 */
export function DefaultsPanel({ settings }: { settings: Settings }) {
  // Save plumbing from shared.tsx (busy, errors, setErrors for client checks, fatal, run).
  const { busy, errors, setErrors, fatal, run } = useSectionSave();
  // Typed text of the validity-days field.
  const [validity, setValidity] = useState(String(settings.validity_days));
  // Typed text of the follow-up-days field.
  const [followup, setFollowup] = useState(String(settings.followup_days));

  /**
   * Form submit: validate both ranges (setErrors and stop if wrong), otherwise save with run(). @param ev —
   * submit event.
   */
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const v: Record<string, string> = {};
    if (!inRange(validity, 1, 365)) v.validity_days = s.validityInvalid;
    if (!inRange(followup, 0, 60)) v.followup_days = s.followupInvalid;
    if (Object.keys(v).length) { setErrors(v); return; }
    await run({ validity_days: Number(validity), followup_days: Number(followup) });
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-sm text-ink/70">{s.defaultsHelp}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberInput label={s.validityDays} decimals={0} value={validity} onChange={setValidity} error={errors.validity_days} />
        <NumberInput label={s.followupDays} decimals={0} value={followup} onChange={setFollowup} error={errors.followup_days} />
      </div>
      <SaveBar busy={busy} fatal={fatal} />
    </form>
  );
}
