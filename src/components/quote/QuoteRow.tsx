/**
 * One row (card) of the Quotes list, used by pages/Quotes.tsx. Pure display + a link: no API calls.
 * Data comes from GET /quotes (`QuoteListRow`: number, buyer, status, product names, total, follow-up).
 * Links to `/quotes/:id/edit` for never-issued drafts and to `/quotes/:id` otherwise. Follow-up dates are
 * compared with today's India date (NFR-12); totals are decimal strings formatted by `money`.
 */
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { date, money, todayIST } from '@/lib/format';
import type { QuoteListRow } from '@/lib/types';
import { StatusBadge } from '@/components/ui';
import { t } from '@/strings';

/**
 * One quote as a tappable card in the Quotes list.
 *
 * What the user sees: the printed quote number (or "Draft" while it has none), a small "revision draft" tag
 * when a new revision of an issued quote is being edited, the buyer name, status badge, the product names,
 * the grand total with currency and - for Sent/Negotiating quotes - the next follow-up date (red and worded
 * as overdue when the date is before today in India).
 * Action: tapping anywhere opens the quote. A quote that was NEVER issued (latest revision is a draft and it
 * has no quote number) opens the editor `/quotes/:id/edit`; every other quote opens `/quotes/:id`, including
 * issued quotes that have an open revision draft (the detail screen offers "Continue draft").
 * @param props.q - a row of GET /quotes (`QuoteListRow`); amounts are decimal strings, shown with `money`.
 * No local state and no API calls.
 */
export function QuoteRow({ q }: { q: QuoteListRow }) {
  // first draft that never got a number
  const neverIssued = q.latest_state === 'draft' && q.quote_no === null;
  // issued quote whose newest revision is an unissued draft
  const revisionDraft = q.latest_state === 'draft' && q.quote_no !== null;
  // Sent/Negotiating: a decision is pending, so the follow-up date is relevant
  const open = q.status === 'sent' || q.status === 'negotiating';
  // YYYY-MM-DD strings compare correctly as text; todayIST() is the India date
  const overdue = open && !!q.next_followup && q.next_followup < todayIST();
  // number as printed (e.g. QT/26-27/0042-R1), or "Draft" before the first issue
  const label = q.number ?? t.quotes.draftLabel;

  return (
    <Link
      to={neverIssued ? `/quotes/${q.id}/edit` : `/quotes/${q.id}`}
      aria-label={t.quotes.rowAria(label, q.buyer_name)}
      className="card block min-h-tap p-4 transition-colors hover:bg-forest-50 active:bg-forest-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-forest-900">{label}</span>
            {revisionDraft && <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-wood-800">{t.quotes.revisionDraft}</span>}
          </div>
          <div className="truncate text-base text-ink">{q.buyer_name}</div>
        </div>
        <StatusBadge status={q.status} />
      </div>
      <div className="mt-1 truncate text-sm text-fg-muted">{q.products || t.quotes.noProducts}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-base font-semibold tabular-nums text-forest-900">{money(q.grand_total, q.currency)}</span>
        {open && q.next_followup && (
          <span className={clsx('text-sm', overdue ? 'font-semibold text-red-700' : 'text-fg-muted')}>
            {overdue ? t.quotes.followupOverdue(date(q.next_followup)) : t.quotes.followup(date(q.next_followup))}
          </span>
        )}
      </div>
    </Link>
  );
}
