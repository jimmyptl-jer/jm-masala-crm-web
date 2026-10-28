/**
 * Share sheet for an issued quote revision: copy link, WhatsApp, e-mail, then offer to log the contact.
 *
 * API: GET /quotes/:id/revisions/:rev/pdf?json=1 (signed link valid 30 days, key ['pdf', quoteId, rev]),
 * fetched via the shared usePdf hook only while the sheet is open. The link works without login, so the
 * PDF can be opened by the buyer directly. The PDF never contains cost or margin (NFR-04).
 * Composes: Sheet, ExternalButton, Button, Spinner, ErrorNote. Uses `useAuth().me.full_name` as sender name.
 * Used by pages/QuoteDetail.tsx (Share button; enabled only when the PDF exists). Sharing is not recorded
 * automatically: "Log it" opens LogActivitySheet (POST /quotes/:id/activities).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Mail, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { api } from '@/lib/api';
import { date, waLink } from '@/lib/format';
import { useSendChannels } from '@/lib/hooks';
import type { Buyer, SendResult } from '@/lib/types';
import { Button, ErrorNote, Sheet, Spinner, errorMessage, useToast } from '@/components/ui';
import { t } from '@/strings';
import { SendPicker, recipientFor, type SendChoice } from './SendPicker';
import { ExternalButton, usePdf } from './shared';

/**
 * Copies text to the clipboard, with a fallback for browsers/pages where the modern Clipboard API is not
 * available (older Android browsers, non-secure pages).
 * @param text - what to copy.
 * @returns true if the copy worked, false if both methods failed.
 * Method 1: `navigator.clipboard.writeText`. Method 2: a hidden read-only <textarea> + `execCommand('copy')`.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Props of ShareSheet.
 *  - open: whether the sheet is shown (the PDF link is fetched only while open).
 *  - onClose: close handler.
 *  - quoteId / revision: which revision's PDF to share (revision NUMBER, not id).
 *  - number: the revision number as printed, e.g. QT/26-27/0001-R1 (used in the message and e-mail subject).
 *  - buyer: the quote's buyer (contact name, company, WhatsApp/phone, e-mail).
 *  - onLog: called when the user taps "Log this" after sharing; the parent opens LogActivitySheet.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  revision: number;
  /** Revision number as printed, e.g. QT/26-27/0001-R1 */
  number: string;
  buyer: Buyer;
  /** Called when the user taps "Log activity" after sharing. */
  onLog: () => void;
}

/**
 * Bottom sheet "Share quote": gives the buyer a link to the quote PDF through WhatsApp, e-mail or copy-paste.
 *
 * What the user sees: the signed PDF link (read-only box, selects on focus) with its expiry date (30 days),
 * a "Copy link" button, a "WhatsApp" button and an "Email" button. WhatsApp opens
 * `https://wa.me/<number>?text=<message>` (number = buyer's WhatsApp, else phone) in a new tab; Email opens a
 * `mailto:` link to the buyer's e-mail address (blank when there is none) with a prefilled subject and
 * message. The message greets the contact person (or company name), names the quote, includes the link and
 * its validity date and is signed with the logged-in user's name. Without a phone number the WhatsApp button
 * is disabled and a note explains why.
 * After the user copies the link or taps WhatsApp/Email, a yellow prompt appears: "Log it" closes this sheet
 * and calls `onLog` so the follow-up can be recorded in the activity log. Nothing is logged automatically.
 * API: GET /quotes/:id/revisions/:rev/pdf?json=1 (via usePdf, key ['pdf', quoteId, rev]) - only while open.
 * Loading shows a spinner, failure an ErrorNote with Retry.
 * @param props - see `Props`.
 * Local state: `shared` - true once the user used one of the share buttons (shows the "log it" prompt);
 * reset to false whenever the sheet closes.
 */
export function ShareSheet({ open, onClose, quoteId, revision, number, buyer, onLog }: Props) {
  const toast = useToast();
  // logged-in user: their name signs the message
  const { me } = useAuth();
  // fetches the signed link only while the sheet is open; ShareSheet itself stays mounted while closed
  const link = usePdf(quoteId, revision, open);
  const [shared, setShared] = useState(false);
  const d = t.quoteDetail;
  const qc = useQueryClient();
  const channels = useSendChannels();
  // direct send from the app: the chosen channel (first usable one by default) and an optional note
  const [picked, setPicked] = useState<SendChoice | null>(null);
  const [note, setNote] = useState('');
  const usable = (['email', 'whatsapp'] as const).filter((ch) => channels[ch] && recipientFor(buyer, ch));
  const choice = (picked && picked !== 'none' && usable.includes(picked) ? picked : (usable[0] ?? 'none')) as SendChoice;
  // POST /quotes/:id/revisions/:rev/send; the server logs the activity, so the timeline is refreshed
  const send = useMutation({
    mutationFn: () => api.post<SendResult>(`/quotes/${quoteId}/revisions/${revision}/send`, { channel: choice, ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['quote', quoteId] }); toast(t.send.sentOk(r.to)); setNote(''); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  // forget the "I shared it" state when the sheet is closed, so the next opening starts clean
  useEffect(() => { if (!open) setShared(false); }, [open]);

  // signed PDF URL ('' until loaded)
  const url = link.data?.url ?? '';
  // expiry date of the link, as shown to the buyer ("valid until ...")
  const valid = link.data ? date(link.data.expires_at) : '';
  // text sent with the link: greeting, quote number, URL, validity date and the sender's name
  const message = url
    ? d.shareMessage(buyer.contact_name || buyer.company_name, number, url, valid, me?.full_name ?? '')
    : '';
  // wa.me link with the message prefilled; digits-only number (waLink strips everything else)
  const wa = url ? waLink(buyer.whatsapp ?? buyer.phone, message) : null;
  // the buyer has a WhatsApp or phone number to send to
  const hasWa = Boolean(buyer.whatsapp ?? buyer.phone);
  // mailto: link; the subject and body must be URL-encoded; recipient is empty if the buyer has no e-mail
  const mail = url
    ? `mailto:${buyer.email ?? ''}?subject=${encodeURIComponent(d.shareSubject(number))}&body=${encodeURIComponent(message)}`
    : null;

  /**
   * "Copy link" button handler: copies the signed URL (not the whole message) with `copyText`. Shows a
   * "copied" toast, or an error toast if copying failed; on success marks the quote as shared so the
   * "log it" prompt appears. Does nothing until the link has loaded.
   */
  const copy = async () => {
    if (!url) return;
    const ok = await copyText(url);
    toast(ok ? d.copied : d.copyFailed, ok ? 'ok' : 'error');
    if (ok) setShared(true);
  };

  return (
    <Sheet open={open} onClose={onClose} title={d.shareTitle}>
      <div className="space-y-3">
        <p className="text-sm text-fg-secondary">{d.shareHint}</p>

        {link.isLoading && <Spinner label={d.shareLinkLoading} />}
        {link.isError && <ErrorNote error={link.error} onRetry={() => void link.refetch()} />}

        {url && (
          <>
            <div>
              <div className="mb-1 text-sm font-medium text-forest-900">{d.shareLink}</div>
              <input
                readOnly value={url} aria-label={d.shareLink} onFocus={(e) => e.currentTarget.select()}
                className="min-h-tap w-full rounded-lg border border-forest-900/25 bg-white px-3 py-2 text-sm text-ink"
              />
              <p className="mt-1 text-sm text-fg-muted">{d.shareValid(valid)}</p>
            </div>

            {/* Send straight from the app (only channels the server is set up for) */}
            {usable.length > 0 && (
              <div className="space-y-3 rounded-lg border border-forest-900/15 p-3">
                <div className="font-medium text-forest-900">{t.send.sendTitle}</div>
                <SendPicker buyer={buyer} value={choice} onChange={setPicked} directOnly />
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-forest-900">{t.send.noteLabel}</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder={t.send.notePlaceholder}
                    className="w-full rounded-lg border border-forest-900/25 bg-white px-3 py-2 text-base text-ink" />
                </label>
                <Button className="w-full" loading={send.isPending} disabled={choice === 'none'} onClick={() => send.mutate()}>
                  {choice === 'email' ? t.send.sendButtonEmail : t.send.sendButtonWhatsapp}
                </Button>
                <p className="text-sm text-fg-muted">{t.send.sendOrManual}</p>
              </div>
            )}

            <Button variant="secondary" className="w-full" onClick={() => void copy()}><Copy className="h-4 w-4" aria-hidden />{d.copy}</Button>

            <div className="grid grid-cols-2 gap-2">
              <ExternalButton
                variant="primary" href={hasWa ? wa : null} target="_blank" rel="noopener noreferrer"
                title={hasWa ? undefined : d.shareNoWhatsapp} onClick={() => setShared(true)}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />{d.shareWhatsapp}
              </ExternalButton>
              <ExternalButton variant="primary" href={mail} onClick={() => setShared(true)}>
                <Mail className="h-4 w-4" aria-hidden />{d.shareEmail}
              </ExternalButton>
            </div>
            {!hasWa && <p className="text-sm text-fg-muted">{d.shareNoWhatsapp}</p>}

            {shared && (
              <div className="rounded-lg bg-gold-100 p-3">
                <p className="mb-2 text-sm text-forest-900">{d.shareDone}</p>
                <Button variant="gold" className="w-full" onClick={() => { onClose(); onLog(); }}>{d.shareLogIt}</Button>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
