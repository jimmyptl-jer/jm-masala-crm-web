/**
 * Follow-up date picker (quick +1 / +3 / +7 day buttons, date input, clear). No API calls of its own.
 * Used by components/quote/LogActivitySheet.tsx and pages/QuoteDetail.tsx (the "Change follow-up" sheet),
 * which send the value to POST /quotes/:id/activities (`next_followup`) or PATCH /quotes/:id/followup.
 * Related rule: BR-07 (follow-up date, cleared when a quote is Won/Lost/Expired). Dates use the India
 * calendar (NFR-12).
 */
import { addDays, todayIST } from '@/lib/format';
import { Button, Input } from '@/components/ui';
import { t } from '@/strings';

/**
 * Controlled picker for the NEXT FOLLOW-UP date (BR-07).
 *
 * What the user sees: three quick buttons (tomorrow, in 3 days, in a week; the one matching the current value
 * is highlighted), a date input that cannot go earlier than today (India date), and a "Clear" button while a
 * date is set. Picking any of them calls `onChange` with a `YYYY-MM-DD` string; "Clear" calls it with ''.
 * @param props.value - current date as `YYYY-MM-DD`, or '' for "no date".
 * @param props.onChange - receives the new value ('' = cleared).
 * @param props.error - optional message shown under the date input (e.g. an API field error).
 * No local state and no API calls; the parent decides when to save. Used by LogActivitySheet and the Quote
 * detail "Change follow-up" sheet. The server stores it only for Sent/Negotiating quotes.
 */
export function FollowupPicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  // today's date in India (NFR-12); quick buttons count from it and the date input's `min` equals it
  const today = todayIST();
  // quick-pick offsets in days (labels come from the strings file)
  const quick = [
    { n: 1, label: t.quoteDetail.log.plus1 },
    { n: 3, label: t.quoteDetail.log.plus3 },
    { n: 7, label: t.quoteDetail.log.plus7 },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {quick.map((q) => {
          const d = addDays(today, q.n);
          return (
            <Button key={q.n} variant={value === d ? 'primary' : 'secondary'} className="px-2 text-sm" aria-pressed={value === d} onClick={() => onChange(d)}>
              {q.label}
            </Button>
          );
        })}
      </div>
      <Input type="date" label={t.quoteDetail.log.followupLabel} value={value} min={today} error={error} onChange={(e) => onChange(e.target.value)} />
      {value && <Button variant="ghost" onClick={() => onChange('')}>{t.quoteDetail.log.clear}</Button>}
    </div>
  );
}
