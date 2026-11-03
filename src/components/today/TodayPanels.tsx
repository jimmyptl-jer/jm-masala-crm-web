/**
 * Pieces of the dashboard (pages/Today.tsx) that are shared with its tab panels: the product names a buyer wants, the square icon
 * button of a row, and the two list panels opened by the "New enquiries" and "Going cold" cards. Pure presentation: the buyers come in
 * as props (the dashboard already loaded them with GET /buyers); nothing here calls the API.
 */
import clsx from 'clsx';
import { MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { date, waLink } from '@/lib/format';
import type { Buyer } from '@/lib/types';
import { t } from '@/strings';

const c = t.today;

/** Product names a buyer wants, without any grade suffix like "Cumin Seeds (Europe)". */
export const wantsOf = (b: Buyer): string[] => b.interested_products.map((x) => x.split(' (')[0] ?? x);

/** Square icon button of a row (WhatsApp is tinted green); a disabled one when there is no number. */
export function IconAction({ href, label, tint, disabled, children, onClick, newTab }: { href?: string; label: string; tint?: boolean; disabled?: boolean; children: React.ReactNode; onClick?: () => void; newTab?: boolean }) {
  const cls = clsx('tap grid h-9 w-9 place-items-center rounded-lg border', tint ? 'border-success-bg bg-success-bg text-success-ink hover:border-success' : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover', disabled && 'cursor-not-allowed opacity-50');
  if (disabled) return <button type="button" disabled aria-label={label} title={c.noPhone} className={cls}>{children}</button>;
  if (href) return <a href={href} aria-label={label} title={label} className={cls} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
  return <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>{children}</button>;
}

const TH = 'px-3 text-left';

/** WhatsApp and call buttons of one buyer. */
function ContactButtons({ b }: { b: Buyer }) {
  const wa = b.whatsapp ?? b.phone;
  const callNo = b.phone ? b.phone.replace(/[^\d+]/g, '') : '';
  const wants = wantsOf(b);
  return (
    <div className="flex items-center justify-end gap-2">
      <IconAction href={wa ? waLink(wa, c.waMessage(b.contact_name ?? b.company_name, wants[0] ?? null)) : undefined} disabled={!wa} label={c.whatsappAria(b.company_name)} tint newTab><MessageCircle className="h-4 w-4" aria-hidden /></IconAction>
      <IconAction href={callNo ? `tel:${callNo}` : undefined} disabled={!callNo} label={c.callAria(b.company_name)}><Phone className="h-4 w-4" aria-hidden /></IconAction>
    </div>
  );
}

/** The "New enquiries" tab: every buyer still at the new-lead stage, with whether anyone has replied and a Quote button (opens the quote page). */
export function NewEnquiriesPanel({ buyers, onQuote }: { buyers: Buyer[]; onQuote: (b: Buyer) => void }) {
  if (buyers.length === 0) return <div className="border-t border-line px-5 py-8"><EmptyState title={c.newEmpty}>{c.newEmptyHint}</EmptyState></div>;
  return (
    <div className="overflow-x-auto">
      <table className="rt w-full min-w-[820px] text-left text-[13.5px]">
        <thead className="border-y border-line bg-surface-muted">
          <tr className="h-9 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted"><th className="px-5">{c.colBuyer}</th><th className={TH}>{c.colWants}</th><th className={TH}>{c.colEnquiry}</th><th className={TH}>{c.colReplied}</th><th className="px-5 text-right">{c.colAction}</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {buyers.map((b) => {
            const wants = wantsOf(b);
            return (
              <tr key={b.id} className="h-[72px] hover:bg-surface-hover">
                <td className="px-5"><Link to={`/buyers/${b.id}`} className="font-bold text-ink hover:underline">{b.company_name}</Link><div className="text-ink-muted">{b.country ?? b.state ?? '—'}</div></td>
                <td className="px-3 text-ink-secondary">{wants.length ? wants.join(', ') : <span className="text-ink-muted">{c.noWants}</span>}</td>
                <td className="px-3 whitespace-nowrap tabular-nums text-ink-secondary">{b.first_inquiry_date ? date(b.first_inquiry_date) : '—'}</td>
                <td className="px-3"><span className={clsx('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold', b.last_contact_at ? 'bg-success-bg text-success-ink' : 'bg-warning-bg text-warning-ink')}>{b.last_contact_at ? c.replied : c.notReplied}</span></td>
                <td className="px-5"><div className="flex items-center justify-end gap-2"><ContactButtons b={b} /><button type="button" onClick={() => onQuote(b)} aria-label={c.quoteAria(b.company_name)} className="tap h-9 rounded-lg bg-paprika px-4 text-sm font-bold text-white hover:bg-paprika-700">{c.quote}</button></div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The "Going cold" tab: buyers nobody has contacted for 14 days or more, longest silence first. */
export function ColdPanel({ rows }: { rows: { buyer: Buyer; days: number }[] }) {
  if (rows.length === 0) return <div className="border-t border-line px-5 py-8"><EmptyState title={c.coldEmpty}>{c.coldEmptyHint}</EmptyState></div>;
  return (
    <div className="overflow-x-auto">
      <table className="rt w-full min-w-[720px] text-left text-[13.5px]">
        <thead className="border-y border-line bg-surface-muted">
          <tr className="h-9 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted"><th className="px-5">{c.colBuyer}</th><th className={TH}>{c.colWants}</th><th className={TH}>{c.colSilent}</th><th className="px-5 text-right">{c.colAction}</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ buyer: b, days }) => {
            const wants = wantsOf(b);
            return (
              <tr key={b.id} className="h-[72px] hover:bg-surface-hover">
                <td className="px-5"><Link to={`/buyers/${b.id}`} className="font-bold text-ink hover:underline">{b.company_name}</Link><div className="text-ink-muted">{b.country ?? b.state ?? '—'}</div></td>
                <td className="px-3 text-ink-secondary">{wants.length ? wants.join(', ') : <span className="text-ink-muted">{c.noWants}</span>}</td>
                <td className={clsx('px-3 font-bold tabular-nums', days >= 30 ? 'text-danger-ink' : 'text-warning-ink')}>{c.coldDaysLong(days)}</td>
                <td className="px-5"><ContactButtons b={b} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
