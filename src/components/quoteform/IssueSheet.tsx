/**
 * The "Issue this quote" confirmation of the quote form: it replaces the plain confirm box and also asks how
 * the quote should reach the buyer (Email, WhatsApp or "don't send now"). Used by pages/QuoteForm.tsx.
 * No API calls here: the parent saves, issues and sends (POST /quotes/:id/issue, then
 * POST /quotes/:id/revisions/:rev/send); this sheet only collects the choice and the optional note.
 * The last choice is remembered in this browser (localStorage, optional: everything works without it).
 */
import { useState } from 'react';
import { Button, Sheet } from '@/components/ui';
import { SendPicker, recipientFor, type SendChoice } from '@/components/quote/SendPicker';
import { useSendChannels } from '@/lib/hooks';
import type { Buyer } from '@/lib/types';
import { t } from '@/strings';

const s = t.send;
const KEY = 'jm.sendChoice';

/** Reads the remembered choice; any storage problem (private window, blocked storage) means "none". */
function remembered(): SendChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'email' || v === 'whatsapp' ? v : 'none';
  } catch { return 'none'; }
}

/**
 * @param props.open / onClose — sheet visibility (closing does nothing else; the quote stays a draft).
 * @param props.buyer — the quote's buyer, to show where the quote would go and to disable options without a contact.
 * @param props.busy — true while the parent is saving / issuing / sending: buttons are disabled and show a spinner.
 * @param props.onConfirm — called with the final choice and the trimmed note ('' when empty or not sending).
 * Local state: `choice` (starts at the remembered one), `note`. The sheet unmounts when closed, so it always
 * starts fresh. A remembered channel the buyer has no contact for is treated as "don't send".
 */
export function IssueSheet({ open, onClose, buyer, busy, onConfirm }: {
  open: boolean;
  onClose: () => void;
  buyer: Buyer | undefined;
  busy: boolean;
  onConfirm: (choice: SendChoice, note: string) => void;
}) {
  const channels = useSendChannels();
  const [picked, setPicked] = useState<SendChoice>(remembered);
  const [note, setNote] = useState('');
  // a remembered channel without a recipient for THIS buyer falls back to "don't send"
  const choice: SendChoice = picked !== 'none' && !recipientFor(buyer, picked) ? 'none' : picked;
  // the server sends it itself (direct) or the user's own app opens afterwards (manual)
  const direct = choice !== 'none' && channels[choice];

  const label = choice === 'none' ? s.issueOnly
    : choice === 'email' ? (direct ? s.issueSendEmail : s.issueOpenEmail)
    : direct ? s.issueSendWhatsapp : s.issueOpenWhatsapp;

  /** Remembers the choice and hands it to the parent. */
  const go = () => {
    try { localStorage.setItem(KEY, choice); } catch { /* storage is optional */ }
    onConfirm(choice, direct ? note.trim() : '');
  };

  return (
    <Sheet
      open={open} onClose={onClose} title={s.issueTitle}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>{s.cancel}</Button>
          <Button className="flex-1" onClick={go} loading={busy}>{label}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink/80">{s.issueWarning}</p>
        <SendPicker buyer={buyer} value={choice} onChange={setPicked} withNone />
        {direct && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-forest-900">{s.noteLabel}</span>
            <textarea
              value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder={s.notePlaceholder}
              className="w-full rounded-lg border border-forest-900/25 bg-white px-3 py-2 text-base text-ink"
            />
          </label>
        )}
      </div>
    </Sheet>
  );
}
