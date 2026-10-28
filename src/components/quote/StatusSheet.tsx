/**
 * "Change status" sheet of the Quote detail screen (Sent -> Negotiating / Won / Lost, admin reopen).
 *
 * API: PATCH /quotes/:id/status `{ status: 'negotiating' | 'won' | 'lost', lost_reason?, lost_note? }`.
 * Invalidates ['quote', id], ['quotes'] and ['dashboard'] (useInvalidateQuote) on success.
 * Implements BR-05 (status flow; the allowed moves are mirrored in `optionsFor`), BR-07 (Won/Lost clear
 * the follow-up) and the "Lost needs a reason" rule. Reopening is admin only (`useAuth().isAdmin`).
 * Composes: Sheet, Textarea, StatusBadge, ErrorNote. Used by pages/QuoteDetail.tsx.
 */
import clsx from 'clsx';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { api, ApiError } from '@/lib/api';
import type { LostReason, QuoteDetail, QuoteStatus } from '@/lib/types';
import { Button, ErrorNote, Sheet, StatusBadge, Textarea, useToast } from '@/components/ui';
import { t } from '@/strings';
import { useInvalidateQuote } from './shared';

// statuses a user can move a quote to by hand (the API also only accepts these three)
type Target = 'negotiating' | 'won' | 'lost';
// lost reasons in display order (codes shared with the API: price, quality, delivery, no_reply, other)
const REASONS: LostReason[] = ['price', 'quality', 'delivery', 'no_reply', 'other'];

// one selectable status move: target status + label and explanatory hint shown on its button
interface Opt { to: Target; label: string; hint: string }

/**
 * Which status moves are offered for a quote, mirroring the API's transition table (BR-05).
 * @param status - the quote's current status.
 * @param isAdmin - whether the signed-in user is an admin.
 * @returns `{ opts, note }`: `opts` = the buttons to show; `note` = explanatory text shown instead when
 *   no move is possible.
 *   - sent -> negotiating, won, lost;  negotiating -> won, lost.
 *   - won / lost -> only "reopen" (to negotiating), and only for admins; others get an "ask an admin" note.
 *   - expired -> none (a new revision must be issued); draft -> none (issue the quote first).
 * The API re-checks every move (409 `invalid_transition`, 403 `forbidden`), so this only avoids offering
 * impossible buttons.
 */
function optionsFor(status: QuoteStatus, isAdmin: boolean): { opts: Opt[]; note: string | null } {
  const d = t.quoteDetail;
  const negotiating: Opt = { to: 'negotiating', label: d.statusNegotiating, hint: d.statusNegotiatingHint };
  const won: Opt = { to: 'won', label: d.statusWon, hint: d.statusWonHint };
  const lost: Opt = { to: 'lost', label: d.statusLost, hint: d.statusLostHint };
  switch (status) {
    case 'sent': return { opts: [negotiating, won, lost], note: null };
    case 'negotiating': return { opts: [won, lost], note: null };
    case 'won':
    case 'lost':
      return isAdmin
        ? { opts: [{ to: 'negotiating', label: d.statusReopen, hint: d.statusReopenHint }], note: null }
        : { opts: [], note: d.statusAdminOnly };
    case 'expired': return { opts: [], note: d.statusExpired };
    default: return { opts: [], note: d.statusDraft };
  }
}

/**
 * Bottom sheet "Change status" for a quote. Mounted only while open (returns null otherwise) so the
 * choices start fresh each time.
 * @param props.open - whether the sheet is shown.
 * @param props.onClose - close handler.
 * @param props.quote - the quote whose status is changed (its `status` decides the options).
 * The form is `StatusForm`.
 */
export function StatusSheet({ open, onClose, quote }: { open: boolean; onClose: () => void; quote: QuoteDetail }) {
  if (!open) return null;
  return <StatusForm onClose={onClose} quote={quote} />;
}

/**
 * Content of the Change status sheet.
 *
 * What the user sees: the current status, then (depending on `optionsFor`) big radio-style buttons for the
 * allowed new statuses, each with a one-line explanation. Choosing "Lost" reveals the lost-reason list
 * (Price, Quality, Delivery time, No reply, Other); choosing "Other" reveals a required note box (max 300
 * characters). Footer: Cancel and Save (Save is disabled until a status is picked; no footer when no move is
 * possible, only an explanatory note).
 * Action: Save -> PATCH /quotes/:id/status `{ status, lost_reason?, lost_note? }`. `lost_note` is sent only
 * for the reason "other". The API (BR-05, BR-07) validates the move, stores the reason (as `other: <note>`
 * for "other"), clears the follow-up date for Won/Lost, starts a new one when reopening and writes a
 * `status_change` activity. On success: invalidate ['quote', id], ['quotes'], ['dashboard'], toast, close.
 * Validation: Lost needs a reason, and "other" needs a note; checked locally first (`lost_reason` /
 * `lost_note` errors). The same keys from `ApiError.fields` are shown after a failed request; any other
 * error appears in an ErrorNote at the bottom.
 * @param props.onClose - closes the sheet.
 * @param props.quote - the quote being changed.
 * Local state: `to` (chosen status), `reason` (chosen lost reason), `note` (text for "other"),
 * `errs` (field key -> message). Changing a choice clears the errors.
 */
function StatusForm({ onClose, quote }: { onClose: () => void; quote: QuoteDetail }) {
  // reopening a Won/Lost quote is admin-only (the API returns 403 for anyone else)
  const { isAdmin } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateQuote();
  const [to, setTo] = useState<Target | null>(null);
  const [reason, setReason] = useState<LostReason | null>(null);
  const [note, setNote] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  // allowed moves for this quote and this user; `hint` is the explanatory note shown when there are none
  const { opts, note: hint } = optionsFor(quote.status, isAdmin);
  const d = t.quoteDetail;

  // PATCH /quotes/:id/status; the lost note is sent only when the reason is "other"
  const save = useMutation({
    mutationFn: () => api.patch(`/quotes/${quote.id}/status`, {
      status: to,
      ...(to === 'lost' ? { lost_reason: reason, lost_note: reason === 'other' ? note.trim() : undefined } : {}),
    }),
    onSuccess: () => {
      invalidate(quote.id);
      toast(d.statusSaved);
      onClose();
    },
    onError: (e) => setErrs(e instanceof ApiError && e.fields ? e.fields : {}),
  });

  /**
   * Save button handler. Ignored while a request runs or while no status is chosen. For "Lost" it checks
   * locally that a reason is chosen and, for "other", that the note is not blank; if there is a problem it
   * shows it and does not call the API. Otherwise starts the PATCH.
   */
  const submit = () => {
    if (save.isPending || !to) return;
    const local: Record<string, string> = {};
    if (to === 'lost') {
      if (!reason) local.lost_reason = d.statusLostReason;
      else if (reason === 'other' && !note.trim()) local.lost_note = d.statusLostNotePlaceholder;
    }
    setErrs(local);
    if (Object.keys(local).length === 0) save.mutate();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={d.statusTitle}
      footer={opts.length > 0 ? (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={save.isPending}>{t.common.cancel}</Button>
          <Button className="flex-[2]" onClick={submit} loading={save.isPending} disabled={!to}>{d.statusSave}</Button>
        </div>
      ) : undefined}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-fg-secondary">{d.statusCurrent}: <StatusBadge status={quote.status} /></div>

        {hint && <p className="rounded-lg bg-gold-100 p-3 text-sm text-forest-900">{hint}</p>}

        {opts.length > 0 && (
          <div>
            <div id="status-to" className="mb-1 text-sm font-medium text-forest-900">{d.statusChoose}</div>
            <div role="radiogroup" aria-labelledby="status-to" className="space-y-2">
              {opts.map((o) => (
                <button
                  key={o.to} type="button" role="radio" aria-checked={to === o.to} disabled={save.isPending}
                  onClick={() => { setTo(o.to); setErrs({}); }}
                  className={clsx('tap block w-full rounded-lg border px-4 py-3 text-left',
                    to === o.to ? 'border-forest-900 bg-forest-900 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}
                >
                  <span className="block text-base font-semibold">{o.label}</span>
                  <span className={clsx('block text-sm', to === o.to ? 'text-white/80' : 'text-fg-muted')}>{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {to === 'lost' && (
          <div>
            <div id="lost-reason" className="mb-1 text-sm font-medium text-forest-900">{d.statusLostReason}</div>
            <div role="radiogroup" aria-labelledby="lost-reason" className="space-y-2">
              {REASONS.map((r) => (
                <button
                  key={r} type="button" role="radio" aria-checked={reason === r} disabled={save.isPending}
                  onClick={() => { setReason(r); setErrs({}); }}
                  className={clsx('tap flex w-full items-center gap-3 rounded-lg border px-4 py-2 text-left text-base',
                    reason === r ? 'border-forest-900 bg-forest-50 font-semibold' : 'border-forest-900/25 bg-white')}
                >
                  <span aria-hidden className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2', reason === r ? 'border-forest-900' : 'border-forest-900/40')}>
                    {reason === r && <span className="h-2.5 w-2.5 rounded-full bg-forest-900" />}
                  </span>
                  {t.common.lostReason[r]}
                </button>
              ))}
            </div>
            {errs.lost_reason && <p role="alert" className="mt-1 text-sm text-red-700">{errs.lost_reason}</p>}
            {reason === 'other' && (
              <Textarea
                wrapperClassName="mt-3" label={d.statusLostNote} value={note} maxLength={300} rows={2}
                placeholder={d.statusLostNotePlaceholder} error={errs.lost_note} aria-required="true"
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </div>
        )}

        {save.isError && <ErrorNote error={save.error} />}
      </div>
    </Sheet>
  );
}
