/**
 * Small pieces shared by the Marketing screens: the coloured status pill of a campaign or recipient, and the note shown
 * when the server has no e-mail account configured (campaigns can still be built and previewed). No API calls except
 * GET /send-channels through useSendChannels.
 */
import clsx from 'clsx';
import { useSendChannels } from '@/lib/hooks';
import { t } from '@/strings';

const STYLE: Record<string, string> = {
  draft: 'bg-stone-200 text-stone-800',
  sending: 'bg-amber-100 text-amber-900',
  sent: 'bg-green-100 text-green-900',
  failed: 'bg-red-100 text-red-900',
  queued: 'bg-stone-200 text-stone-800',
  skipped: 'bg-zinc-300 text-zinc-800',
};

/**
 * @param props.status — a campaign status (draft / sending / sent / failed) or a recipient status (queued / sent / failed / skipped).
 * @param props.recipient — true to use the recipient wording ("Waiting" instead of "Draft").
 */
export function StatusPill({ status, recipient }: { status: string; recipient?: boolean }) {
  const label = (recipient ? t.mkt.recipientStatus : t.mkt.status)[status] ?? status;
  return <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', STYLE[status] ?? STYLE.draft)}>{label}</span>;
}

/** A yellow note when the server cannot send e-mail yet; renders nothing when it can. */
export function EmailOffNote() {
  const channels = useSendChannels();
  if (channels.email) return null;
  return <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.mkt.emailOff}</p>;
}
