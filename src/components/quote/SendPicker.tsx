/**
 * The "Send to the buyer" choice: a radio group of Email / WhatsApp (and "Don't send now" while issuing).
 * Used by components/quoteform/IssueSheet.tsx (choose while issuing) and components/quote/ShareSheet.tsx
 * (send an already issued quote). No API calls of its own except GET /send-channels through useSendChannels.
 * Each option shows where it would go (the buyer's e-mail address / WhatsApp number) and whether the app sends
 * it itself ("direct") or opens the user's own mail program / WhatsApp ("manual", when the server has no
 * credentials for that channel). An option the buyer has no contact detail for is disabled with the reason.
 */
import { Mail, MessageCircle, Send } from 'lucide-react';
import { useSendChannels } from '@/lib/hooks';
import type { Buyer, SendChannel } from '@/lib/types';
import { t } from '@/strings';

const s = t.send;

/** What the user picked: a channel, or 'none' (issue without sending). */
export type SendChoice = 'none' | SendChannel;

/**
 * Where a quote would be sent for a channel.
 * @param buyer — the quote's buyer.
 * @param channel — 'email' or 'whatsapp'.
 * @returns the e-mail address, or the WhatsApp number (falling back to the phone number); null when there is none.
 */
export function recipientFor(buyer: Buyer | undefined, channel: SendChannel): string | null {
  if (!buyer) return null;
  const v = channel === 'email' ? buyer.email : (buyer.whatsapp || buyer.phone);
  return v && v.trim() ? v.trim() : null;
}

/**
 * @param props.buyer — the quote's buyer (undefined while unknown; every channel is then disabled).
 * @param props.value — the current choice. @param props.onChange — called with the new choice.
 * @param props.withNone — show the "Don't send now" option (issuing) or not (sharing an issued quote).
 * @param props.directOnly — show only channels the server can send itself (Share sheet); renders nothing when
 *   there are none.
 * Local state: none (the parent owns the choice).
 */
export function SendPicker({ buyer, value, onChange, withNone = false, directOnly = false }: {
  buyer: Buyer | undefined;
  value: SendChoice;
  onChange: (v: SendChoice) => void;
  withNone?: boolean;
  directOnly?: boolean;
}) {
  const channels = useSendChannels();
  const options: { key: SendChoice; label: string; icon: typeof Mail; hint: string; disabled: boolean }[] = [];

  for (const ch of ['email', 'whatsapp'] as const) {
    if (directOnly && !channels[ch]) continue;
    const to = recipientFor(buyer, ch);
    options.push({
      key: ch,
      label: ch === 'email' ? s.email : s.whatsapp,
      icon: ch === 'email' ? Mail : MessageCircle,
      disabled: !to,
      hint: !to
        ? (ch === 'email' ? s.noEmail : s.noNumber)
        : channels[ch] ? s.sentFromApp(to) : s.opensOwn(ch === 'email' ? s.ownMail : s.ownWhatsapp),
    });
  }
  if (withNone) options.push({ key: 'none', label: s.none, icon: Send, hint: s.noneHint, disabled: false });
  if (directOnly && options.length === 0) return null;

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-forest-900">{s.choiceLabel}</legend>
      <div className="space-y-2" role="radiogroup" aria-label={s.choiceLabel}>
        {options.map(({ key, label, icon: Icon, hint, disabled }) => (
          <label
            key={key}
            className={`flex min-h-tap cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
              value === key && !disabled ? 'border-forest-700 bg-forest-50' : 'border-forest-900/20 bg-white'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="radio" name="send-choice" value={key} checked={value === key && !disabled} disabled={disabled}
              onChange={() => onChange(key)} className="mt-1 h-5 w-5 accent-forest-700"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium text-forest-900"><Icon className="h-4 w-4" aria-hidden />{label}</span>
              <span className="block break-words text-sm text-fg-secondary">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
