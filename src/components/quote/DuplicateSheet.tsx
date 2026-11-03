/**
 * "Duplicate" sheet of the Quote detail screen: creates a new draft quote from an existing one.
 *
 * API: POST /quotes/:id/duplicate with `{}` or `{ buyer_id }`; GET /buyers?archived=false for the picker
 * (key ['buyers', { archived: 'false' }]). Invalidates ['quotes'] and ['dashboard'] (useInvalidateQuote) and
 * then navigates to `/quotes/<new id>/edit`. Composes: Sheet, Segmented, SearchSelect, ErrorNote.
 * Used by pages/QuoteDetail.tsx. The copy is always a fresh draft (no number until issued, BR-01).
 */
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useBuyers } from '@/lib/hooks';
import type { QuoteDetail } from '@/lib/types';
import { SearchSelect } from '@/components/SearchSelect';
import { Button, ErrorNote, Segmented, Sheet, errorMessage, useToast } from '@/components/ui';
import { t } from '@/strings';
import { useInvalidateQuote } from './shared';

/**
 * Bottom sheet "Duplicate quote": copy this quote into a NEW draft, for the same or another buyer.
 * Mounted only while open (returns null otherwise), so each opening starts with fresh state.
 * @param props.open - whether the sheet is shown.
 * @param props.onClose - close handler (Cancel, X, Escape, backdrop, and after success).
 * @param props.quote - the quote being copied (its buyer name is displayed, its id is used for the call).
 * The real work is in `DuplicateForm`.
 */
export function DuplicateSheet({ open, onClose, quote }: { open: boolean; onClose: () => void; quote: QuoteDetail }) {
  if (!open) return null;
  return <DuplicateForm onClose={onClose} quote={quote} />;
}

/**
 * Content of the Duplicate sheet.
 *
 * What the user sees: a hint, a switch "Same buyer" / "Other buyer", the buyer's name or (for "Other") a
 * searchable picker of ACTIVE buyers, and Cancel / Create buttons.
 * Action: "Create" -> POST /quotes/:id/duplicate with `{}` (same buyer) or `{ buyer_id }` (other buyer).
 * The API copies the latest revision's lines and terms into a new draft quote (new buyer => type, currency,
 * Incoterm and port follow that buyer, terms reset to Settings defaults, totals re-priced). On success:
 * invalidate list/dashboard, toast, close the sheet and navigate to the new draft's editor
 * `/quotes/<new id>/edit`. A failure (e.g. 409 buyer_archived) shows an ErrorNote inside the sheet.
 * @param props.onClose - closes the sheet.
 * @param props.quote - the source quote.
 * Local state: `mode` ('same' | 'other'), `buyerId` (picked buyer for 'other'), `err` (inline validation
 * message for the picker).
 */
function DuplicateForm({ onClose, quote }: { onClose: () => void; quote: QuoteDetail }) {
  const nav = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateQuote();
  const d = t.quoteDetail;
  const [mode, setMode] = useState<'same' | 'other'>('same');
  const [buyerId, setBuyerId] = useState('');
  const [err, setErr] = useState('');
  // active (non-archived) buyers only: a copy cannot be made for an archived buyer (API: 409 buyer_archived)
  const buyers = useBuyers({ archived: 'false' });
  // buyers -> {value,label,sub} options for SearchSelect (sub line: "city, country")
  const options = useMemo(
    () => (buyers.data ?? []).map((b) => ({ value: b.id, label: b.company_name, sub: [b.city, b.country].filter(Boolean).join(', ') || undefined })),
    [buyers.data],
  );

  // POST /quotes/:id/duplicate; the response is the new quote (only its `id` is needed to open the editor)
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/quotes/${quote.id}/duplicate`, mode === 'other' ? { buyer_id: buyerId } : {}),
    onSuccess: (r) => {
      invalidate();
      toast(d.duplicated);
      onClose();
      nav(`/quotes/${r.id}/edit`);
    },
    onError: (e) => toast(errorMessage(e) || t.common.saveFailed, 'error'),
  });

  /**
   * "Create" button handler. Ignores clicks while the request is running (double-submit guard). If "Other
   * buyer" is selected but no buyer picked, shows the "choose a buyer" message and does not call the API;
   * otherwise clears the message and starts the mutation.
   */
  const submit = () => {
    if (create.isPending) return;
    if (mode === 'other' && !buyerId) { setErr(d.duplicateBuyerRequired); return; }
    setErr('');
    create.mutate();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={d.duplicateTitle}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={create.isPending}>{t.common.cancel}</Button>
          <Button className="flex-[2]" onClick={submit} loading={create.isPending}>{d.duplicateCreate}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-secondary">{d.duplicateHint}</p>
        <Segmented
          value={mode} onChange={(v) => { setMode(v); setErr(''); }} disabled={create.isPending}
          options={[{ value: 'same', label: d.duplicateSame }, { value: 'other', label: d.duplicateOther }]}
        />
        {mode === 'same'
          ? <p className="text-base font-medium text-forest-900">{quote.buyer.company_name}</p>
          : (
            <SearchSelect
              label={t.quoteDetail.buyer} value={buyerId} options={options} onChange={(v) => { setBuyerId(v); setErr(''); }}
              placeholder={d.duplicateChooseBuyer} searchPlaceholder={d.duplicateBuyerSearch} emptyText={t.common.noResults}
              error={err} disabled={create.isPending}
            />
          )}
        {buyers.isError && mode === 'other' && <ErrorNote error={buyers.error} onRetry={() => void buyers.refetch()} />}
        {create.isError && <ErrorNote error={create.error} />}
      </div>
    </Sheet>
  );
}
