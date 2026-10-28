/**
 * "Log activity" sheet: records a call, WhatsApp, email, meeting or note on a quote.
 *
 * API: POST /quotes/:id/activities with `{ kind, body, next_followup }`. On success it invalidates
 * ['quote', id], ['quotes'] and ['dashboard'].
 * Composes: Sheet, Textarea, FollowupPicker, ErrorNote, ACTIVITY_ICON.
 * Used by pages/Today.tsx (per due card) and pages/QuoteDetail.tsx (timeline button and the "I shared it,
 * log it" prompt in ShareSheet). Implements the activity log / follow-up part of BR-07.
 */
import clsx from 'clsx';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { ActivityKind } from '@/lib/types';
import { Button, ErrorNote, Sheet, Textarea, useToast } from '@/components/ui';
import { t } from '@/strings';
import { FollowupPicker } from './FollowupPicker';
import { ACTIVITY_ICON, useInvalidateQuote } from './shared';

// kinds a person can log by hand; `status_change` entries are written only by the API
type LogKind = Exclude<ActivityKind, 'status_change'>;
// order of the kind buttons
const KINDS: LogKind[] = ['call', 'whatsapp', 'email', 'meeting', 'note'];

/**
 * Props of LogActivitySheet.
 *  - open: whether the sheet is shown.
 *  - onClose: close handler (also called after a successful save).
 *  - quoteId: id of the quote the note is attached to.
 *  - subtitle: optional "Buyer name, QT/26-27/0001" line shown under the title.
 *  - initialKind: which kind button starts selected (default 'call').
 */
interface Props {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  /** e.g. "Buyer name, QT/26-27/0001" shown under the title */
  subtitle?: string;
  initialKind?: LogKind;
}

/**
 * Bottom sheet "Log activity": record a call / WhatsApp / email / meeting / note against a quote and
 * optionally set the next follow-up date. Shared by Today and Quote detail.
 * Mounted only while `open` (returns null otherwise) so every opening starts with an empty form.
 * @param props - see `Props`. The form itself is `LogForm`.
 */
export function LogActivitySheet(props: Props) {
  if (!props.open) return null;
  return <LogForm {...props} />;
}

/**
 * Content of the Log activity sheet.
 *
 * What the user sees: kind buttons (Call, WhatsApp, Email, Meeting, Note), a required text box (max 2000
 * characters), the follow-up picker ("when should we follow up next?") and Cancel / Save.
 * Action: Save -> POST /quotes/:id/activities `{ kind, body, next_followup }` (`body` trimmed, follow-up
 * null when empty; `happened_at` is not sent, so the server uses the current time). The API also moves the
 * quote's follow-up date to `next_followup`, but only while the quote is Sent or Negotiating (otherwise the
 * date is ignored). On success: invalidate ['quote', id], ['quotes'], ['dashboard'], toast, close.
 * Errors: an empty text is caught locally (`body` error under the box); API validation errors come back in
 * `ApiError.fields` and are shown under the inputs with the same keys (`body`, `next_followup`); any error is
 * also shown in an ErrorNote at the bottom.
 * Local state: `kind`, `body`, `next` (follow-up date or ''), `fieldErr` (field key -> message).
 */
function LogForm({ onClose, quoteId, subtitle, initialKind = 'call' }: Props) {
  const toast = useToast();
  const invalidate = useInvalidateQuote();
  const [kind, setKind] = useState<LogKind>(initialKind);
  const [body, setBody] = useState('');
  const [next, setNext] = useState('');
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  // POST /quotes/:id/activities; success refreshes the quote, list and Today dashboard
  const save = useMutation({
    mutationFn: () => api.post(`/quotes/${quoteId}/activities`, { kind, body: body.trim(), next_followup: next || null }),
    onSuccess: () => {
      invalidate(quoteId);
      toast(t.quoteDetail.log.saved);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.fields) setFieldErr(e.fields);
    },
  });

  /**
   * Save button handler. Ignored while a save is running (double-submit guard). Blocks an empty/blank note
   * with a local error; otherwise clears old errors and starts the mutation.
   */
  const submit = () => {
    if (save.isPending) return;
    if (!body.trim()) {
      setFieldErr({ body: t.quoteDetail.log.textRequired });
      return;
    }
    setFieldErr({});
    save.mutate();
  };

  // translated names of the kinds, for the buttons
  const kindLabel = t.common.activityKind;
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.quoteDetail.log.title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={save.isPending}>{t.common.cancel}</Button>
          <Button className="flex-[2]" onClick={submit} loading={save.isPending}>{t.quoteDetail.log.save}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {subtitle && <p className="text-sm text-fg-secondary">{t.quoteDetail.log.forQuote(subtitle)}</p>}

        <div>
          <div id="log-kind" className="mb-1 text-sm font-medium text-forest-900">{t.quoteDetail.log.kind}</div>
          <div role="radiogroup" aria-labelledby="log-kind" className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button
                key={k} type="button" role="radio" aria-checked={kind === k} disabled={save.isPending}
                onClick={() => setKind(k)}
                className={clsx('tap flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-sm font-semibold',
                  kind === k ? 'border-forest-900 bg-forest-900 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}
              >
                {ACTIVITY_ICON[k]}
                {kindLabel[k]}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          label={t.quoteDetail.log.text} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000}
          placeholder={t.quoteDetail.log.textPlaceholder} error={fieldErr.body} aria-required="true"
        />

        <div>
          <div className="mb-1 text-sm text-fg-muted">{t.quoteDetail.log.followupHint}</div>
          <FollowupPicker value={next} onChange={setNext} error={fieldErr.next_followup} />
        </div>

        {save.isError && <ErrorNote error={save.error} />}
      </div>
    </Sheet>
  );
}
