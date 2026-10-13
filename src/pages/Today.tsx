/**
 * Today (dashboard) screen, route `/` (see web/src/router.tsx). Implements FR-60..62 and BR-08.
 *
 * API: GET /dashboard (react-query key ['dashboard']) for the follow-ups due, quotes expiring within 3 days
 * and the status counts. "Log activity" does POST /quotes/:id/activities through LogActivitySheet, which then
 * invalidates ['quote', id], ['quotes'] and ['dashboard'].
 * Composes: DueCard (local), LogActivitySheet, ExternalButton/RouterButton (quote/shared) and the ui kit
 * (Button, Card, ErrorNote, PageHeader, Spinner, StatusBadge). All words come from `t.today`.
 * All amounts are decimal strings from the API and are only formatted here (`money`, never added up).
 */
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MessageCircle, NotebookPen, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { date, money, todayIST, waLink } from '@/lib/format';
import type { Dashboard, DueRow } from '@/lib/types';
import { Button, Card, ErrorNote, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { ACTIVITY_ICON, ExternalButton, RouterButton } from '@/components/quote/shared';
import { LogActivitySheet } from '@/components/quote/LogActivitySheet';
import { t } from '@/strings';

/**
 * Config for the five count tiles at the top of Today. One entry per tile:
 *  - key: which field of `Dashboard['counts']` (the `counts` object from GET /dashboard) to show;
 *  - status: the `?status=` value the tile links to on the Quotes screen (`/quotes?status=<status>`);
 *  - label: the caption (from `t.today.tiles`); tone: the Tailwind text colour of the big number.
 * Note: `won_this_month` / `lost_this_month` are counted for the current India calendar month by the API
 * (api/src/services/dashboard.ts), but the Quotes screen they link to shows ALL won / lost quotes.
 */
const TILES: { key: keyof Dashboard['counts']; status: string; label: string; tone: string }[] = [
  { key: 'drafts', status: 'draft', label: t.today.tiles.drafts, tone: 'text-stone-800' },
  { key: 'awaiting_reply', status: 'sent', label: t.today.tiles.awaiting, tone: 'text-sky-900' },
  { key: 'negotiating', status: 'negotiating', label: t.today.tiles.negotiating, tone: 'text-amber-900' },
  { key: 'won_this_month', status: 'won', label: t.today.tiles.won, tone: 'text-green-800' },
  { key: 'lost_this_month', status: 'lost', label: t.today.tiles.lost, tone: 'text-red-800' },
];

/**
 * Turns a `YYYY-MM-DD` date into the full English weekday name ("Friday") for the page subtitle.
 * @param ymd - calendar date string (the API's `today`, an India date).
 * @returns weekday name in the en-IN locale.
 * Gotcha: the date is parsed as UTC midnight and formatted with `timeZone: 'UTC'` so the browser's own
 * time zone cannot shift it to the previous or next day.
 */
function weekday(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
}

/**
 * Wording for "how long ago was this quote sent" on a due card.
 * @param n - whole days between the issue date and today (`days_since_sent` from the API).
 * @returns "Sent today" (n <= 0), "Sent yesterday" (n = 1) or "Sent N days ago".
 */
const sentAgo = (n: number) => (n <= 0 ? t.today.sentToday : n === 1 ? t.today.sentYesterday : t.today.sentDaysAgo(n));

/**
 * One follow-up card on Today: a Sent/Negotiating quote whose follow-up date is today or earlier.
 *
 * What the user sees: buyer name, quote number, grand total with currency, status badge, how long ago it
 * was sent, a red "N days overdue" pill (or amber "due today"), and the last logged activity (kind, text,
 * date) or "no activity yet".
 * Actions:
 *  - Call: a `tel:` link built from `buyer_phone` (everything except digits and `+` removed). When the buyer
 *    has no phone the button is rendered disabled with a tooltip (see ExternalButton).
 *  - WhatsApp: opens `https://wa.me/<digits>` in a new tab using `buyer_whatsapp`, falling back to
 *    `buyer_phone`; disabled when neither exists.
 *  - Log activity: calls `onLog(row)`; the parent opens LogActivitySheet for this quote.
 *  - Open: router link to `/quotes/:id` (QuoteDetail).
 * No API call is made here; the data is one element of `due[]` from GET /dashboard.
 * @param props.row - the DueRow from the dashboard response (money fields are decimal strings).
 * @param props.onLog - called with the row when the user taps "Log activity".
 * Local state: none (all derived from `row`).
 */
function DueCard({ row, onLog }: { row: DueRow; onLog: (r: DueRow) => void }) {
  // digits and '+' only, so spaces/dashes in the stored phone do not break the tel: link
  const callNo = row.buyer_phone ? row.buyer_phone.replace(/[^\d+]/g, '') : '';
  // WhatsApp number if the buyer has one, otherwise the ordinary phone
  const waNo = row.buyer_whatsapp ?? row.buyer_phone;
  // days_overdue is today minus next_followup (computed by the API); > 0 means the follow-up date has passed
  const late = row.days_overdue > 0;
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-forest-900">{row.buyer_name}</div>
          <div className="text-sm text-ink/70">{row.number}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-semibold tabular-nums text-forest-900">{money(row.grand_total, row.currency)}</div>
          <StatusBadge status={row.status} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink/70">{sentAgo(row.days_since_sent)}</span>
        <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-semibold', late ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900')}>
          {late ? t.today.overdue(row.days_overdue) : t.today.dueToday}
        </span>
      </div>

      <div className="mt-2 rounded-lg bg-cream-100 px-3 py-2 text-sm">
        <div className="mb-0.5 text-xs uppercase tracking-wide text-ink/55">{t.today.lastActivity}</div>
        {row.last_kind ? (
          <div className="flex items-start gap-2 text-ink">
            <span className="mt-0.5 text-forest-800">{ACTIVITY_ICON[row.last_kind]}</span>
            <span className="min-w-0">
              <span className="line-clamp-2 break-words">
                <span className="font-semibold">{t.common.activityKind[row.last_kind]}</span>
                {row.last_body && <>: {row.last_body}</>}
              </span>
              {row.last_at && <span className="block text-xs text-ink/55">{date(row.last_at)}</span>}
            </span>
          </div>
        ) : (
          <span className="text-ink/60">{t.today.noActivity}</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <ExternalButton
          href={callNo ? `tel:${callNo}` : null} title={callNo ? undefined : t.today.noPhone}
          aria-label={t.today.callAria(row.buyer_name)}
        ><Phone className="h-4 w-4" aria-hidden />{t.today.call}</ExternalButton>
        <ExternalButton
          href={waNo ? waLink(waNo) : null} target="_blank" rel="noopener noreferrer" title={waNo ? undefined : t.today.noPhone}
          aria-label={t.today.whatsappAria(row.buyer_name)}
        ><MessageCircle className="h-4 w-4" aria-hidden />{t.today.whatsapp}</ExternalButton>
        <Button variant="secondary" onClick={() => onLog(row)} aria-label={t.today.logAria(row.buyer_name)}>
          <NotebookPen className="h-4 w-4" aria-hidden />{t.today.log}
        </Button>
        <RouterButton to={`/quotes/${row.id}`} aria-label={t.today.openAria(row.buyer_name, row.number)}>{t.today.open}</RouterButton>
      </div>
    </Card>
  );
}

/**
 * Today screen (route `/`): the daily dashboard the sales person opens first.
 *
 * What the user sees: a "New quote" button; five count tiles (drafts, awaiting reply, negotiating, won this
 * month, lost this month) that each link to `/quotes?status=...`; the "Follow-ups due" list (one DueCard per
 * quote, or a "You're all caught up" card with a New quote button when none are due); and, only when there
 * are any, an "Expiring soon" list of quotes whose validity ends within 3 days.
 * Actions:
 *  - Tile -> navigates to the filtered Quotes list.
 *  - Card "Log activity" -> opens LogActivitySheet; saving does POST /quotes/:id/activities and invalidates
 *    ['quote', id], ['quotes'] and ['dashboard'] (see useInvalidateQuote), so this screen refetches and the
 *    card leaves the list if the follow-up date moved to the future.
 *  - Expiring row -> `/quotes/:id`.
 * Data: GET /dashboard (react-query key ['dashboard']) returns `{ today, due, expiring, counts }`.
 * Loading shows a Spinner; a failure shows ErrorNote with a Retry button that refetches.
 * Local state: `logRow` - the DueRow whose "Log" button was tapped, or null; drives the sheet.
 */
export default function Today() {
  // single query for the whole screen; every quote mutation invalidates ['dashboard'] so it stays fresh
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });
  const [logRow, setLogRow] = useState<DueRow | null>(null);
  const d = dash.data;
  // show the server's idea of today (India date, NFR-12); fall back to the browser's India date while loading
  const day = d?.today ?? todayIST();

  return (
    <div>
      <PageHeader
        title={t.today.title}
        subtitle={`${weekday(day)}, ${date(day)}`}
        actions={<RouterButton to="/quotes/new" variant="gold"><Plus className="h-5 w-5" aria-hidden />{t.today.newQuote}</RouterButton>}
      />

      {dash.isLoading && <Spinner />}
      {dash.isError && <ErrorNote error={dash.error} onRetry={() => void dash.refetch()} />}

      {d && (
        <div className="space-y-4">
          <nav aria-label={t.today.tilesLabel} className="grid grid-cols-3 gap-2 md:grid-cols-5 md:gap-3">
            {TILES.map((tile) => (
              <Link
                key={tile.key} to={`/quotes?status=${tile.status}`} aria-label={t.today.tileAria(tile.label, d.counts[tile.key])}
                className="card flex min-h-[72px] flex-col justify-between p-3 hover:bg-forest-50 active:bg-forest-50"
              >
                <span className={clsx('text-2xl font-bold tabular-nums md:text-3xl', tile.tone)}>{d.counts[tile.key]}</span>
                <span className="text-xs leading-tight text-ink/70 md:text-sm">{tile.label}</span>
              </Link>
            ))}
          </nav>

          <section aria-labelledby="due-h">
            <h2 id="due-h" className="font-serif text-xl font-semibold md:text-2xl text-forest-900">{t.today.dueTitle}</h2>
            {d.due.length > 0 && <p className="mb-2 text-sm text-ink/65">{t.today.dueCount(d.due.length)}</p>}
            {d.due.length === 0 ? (
              <Card className="mt-2 flex flex-col items-center gap-2 px-4 py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-700" aria-hidden />
                <p className="text-xl font-semibold text-forest-900">{t.today.caughtUp}</p>
                <p className="text-base text-ink/70">{t.today.caughtUpHint}</p>
                <RouterButton to="/quotes/new" variant="gold" className="mt-2"><Plus className="h-5 w-5" aria-hidden />{t.today.newQuote}</RouterButton>
              </Card>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {d.due.map((r) => <DueCard key={r.id} row={r} onLog={setLogRow} />)}
              </div>
            )}
          </section>

          {d.expiring.length > 0 && (
            <section aria-labelledby="exp-h">
              <h2 id="exp-h" className="font-serif text-xl font-semibold md:text-2xl text-forest-900">{t.today.expiringTitle}</h2>
              <p className="mb-2 text-sm text-ink/65">{t.today.expiringHint}</p>
              <Card>
                <ul className="divide-y divide-cream-200">
                  {d.expiring.map((e) => (
                    <li key={e.id}>
                      <Link to={`/quotes/${e.id}`} className="tap flex items-center justify-between gap-3 p-3 hover:bg-forest-50">
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold text-forest-900">{e.buyer_name}</span>
                          <span className="block text-sm text-ink/65">{e.number} · {t.today.validUntil(date(e.valid_until))}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold text-amber-900">{e.days_left <= 0 ? t.today.expiresToday : t.today.daysLeft(e.days_left)}</span>
                          <span className="block text-sm tabular-nums text-ink/70">{money(e.grand_total, e.currency)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </div>
      )}

      {/* key resets the sheet's form state whenever a different quote is chosen; it renders nothing while
         closed */}
      <LogActivitySheet
        key={logRow?.id ?? 'none'}
        open={logRow !== null}
        onClose={() => setLogRow(null)}
        quoteId={logRow?.id ?? ''}
        subtitle={logRow ? `${logRow.buyer_name}, ${logRow.number}` : undefined}
      />
    </div>
  );
}
