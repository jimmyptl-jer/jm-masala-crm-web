/**
 * Responsive buyer Kanban. Requirement/sample substages are grouped under the seven visible sales stages.
 * Cards link to buyer records; stage changes remain in the buyer profile where they are persisted.
 */
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { StagePill } from '@/components/buyers/StagePill';
import { stageColors } from '@/lib/design-tokens';
import { date, money } from '@/lib/format';
import type { Buyer, QuoteListRow, Stage } from '@/lib/types';
import { t } from '@/strings';

const c = t.crm;
// Column dot colours come from the design system stage colours; our seven columns use the nearest stage.
const COLUMNS: { key: Stage; label: string; includes: Stage[]; dot: string }[] = [
  { key: 'new_lead', label: 'New leads', includes: ['new_lead'], dot: stageColors.enquiry },
  { key: 'contacted', label: 'Contacted', includes: ['contacted'], dot: stageColors.sample_sent },
  { key: 'qualified', label: 'Qualified', includes: ['qualified', 'requirements_received'], dot: stageColors.quotation },
  { key: 'quotation_sent', label: 'Quotation sent', includes: ['quotation_sent', 'sample_requested', 'sample_payment_pending', 'sample_dispatched', 'sample_approved'], dot: stageColors.pi_issued },
  { key: 'negotiation', label: 'Negotiation', includes: ['negotiation', 'po_received'], dot: stageColors.negotiation },
  { key: 'won', label: 'Won', includes: ['won'], dot: stageColors.fully_paid },
  { key: 'lost', label: 'Lost', includes: ['lost'], dot: stageColors.lost },
];

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * @param props.buyers - the buyers to place in columns.
 * @param props.quotes - optional quotes; when given each card shows the buyer's latest quote and its value, and a quote
 *   that expires within 3 days becomes the card's next-action line.
 * @param props.onOpen - when given, a card is a button that calls it (the pipeline opens a drawer); otherwise the card
 *   links to the buyer's page.
 * @param props.only - show just the column of this stage, full width (phones use it with a stage selector).
 * The card's single "next action" line, by priority: overdue follow-up (red) > quote expiring in 3 days or fewer
 * (orange) > the recorded next action and date.
 */
export function BuyerBoard({ buyers, quotes = [], onOpen, only }: { buyers: Buyer[]; quotes?: QuoteListRow[]; onOpen?: (b: Buyer) => void; only?: Stage }) {
  const today = todayIso();
  const latestQuote = new Map<string, QuoteListRow>();
  for (const q of quotes) if (!latestQuote.has(q.buyer_id)) latestQuote.set(q.buyer_id, q);
  return (
    <div className={only ? 'space-y-3' : '-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-[repeat(7,minmax(190px,1fr))] md:overflow-x-auto md:px-0'}>
      {COLUMNS.filter((column) => !only || column.key === only).map((column) => {
        const list = buyers.filter((buyer) => column.includes.includes(buyer.stage));
        return (
          <section key={column.key} id={`col-${column.key}`} aria-label={column.label} className={clsx('rounded-xl border border-line-strong bg-surface-muted p-2.5', !only && 'min-w-[230px] shrink-0 snap-start md:min-w-0')}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="flex items-center gap-2 text-sm font-bold text-fg"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.dot }} aria-hidden />{column.label}</h3>
              <span className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-xs font-bold tabular-nums text-slate-600">{list.length}</span>
            </div>
            {list.length === 0 ? <p className="px-1 py-3 text-sm text-slate-500">{c.boardEmpty}</p> : (
              <ul className="space-y-2">
                {list.map((buyer) => {
                  const overdue = !!buyer.next_followup && buyer.next_followup <= today;
                  const open = buyer.stage !== 'won' && buyer.stage !== 'lost';
                  const quote = latestQuote.get(buyer.id);
                  const location = [buyer.city, buyer.type === 'export' ? buyer.country : buyer.state].filter(Boolean).join(', ');
                  const expiresIn = quote?.valid_until && quote.status === 'sent' ? Math.round((Date.parse(`${quote.valid_until}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
                  const expiring = expiresIn !== null && expiresIn >= 0 && expiresIn <= 3;
                  const body = (
                    <>
                      <div className="break-words text-sm font-bold text-fg">{buyer.company_name}</div>
                      {location && <div className="mt-0.5 truncate text-xs text-fg-muted">{location}</div>}
                      <div className="mt-1 flex flex-wrap items-center gap-1"><StagePill stage={buyer.stage} /></div>
                      {buyer.interested_products.length > 0 && <div className="mt-1 line-clamp-2 text-xs text-fg-secondary">{buyer.interested_products.join(', ')}</div>}
                      {quote && <div className="mt-1 text-xs text-fg-secondary">{c.latestQuote}: <span className="font-bold">{quote.number ?? 'Draft'}</span>{quote.grand_total && <span className="tabular-nums"> {'·'} {money(quote.grand_total, quote.currency)}</span>}</div>}
                      <div className="mt-1 text-xs text-fg-muted">{buyer.last_contact_at ? `${c.lastContactLabel} ${date(buyer.last_contact_at)}` : c.noContactYet}</div>
                      {overdue ? (
                        <div className="mt-2 border-t border-line pt-2 text-xs font-bold text-danger-ink">{c.overdueWord}: {[buyer.next_action, buyer.next_followup && date(buyer.next_followup)].filter(Boolean).join(' · ')}</div>
                      ) : expiring ? (
                        <div className="mt-2 border-t border-line pt-2 text-xs font-bold text-warning-ink">{expiresIn === 0 ? c.quoteExpiresToday : c.quoteExpiresIn(expiresIn as number)}</div>
                      ) : (buyer.next_action || buyer.next_followup) ? (
                        <div className="mt-2 border-t border-line pt-2 text-xs text-info-ink">{[buyer.next_action, buyer.next_followup && date(buyer.next_followup)].filter(Boolean).join(' · ')}</div>
                      ) : open && <div className="mt-2 border-t border-line pt-2 text-xs font-bold text-warning-ink">{c.cardNoNextAction}</div>}
                    </>
                  );
                  const cls = clsx('block w-full rounded-lg border bg-surface p-3 text-left shadow-card transition-shadow hover:shadow-pop', ['quotation_sent', 'negotiation', 'won'].includes(buyer.stage) ? 'border-accent-300' : 'border-line');
                  return (
                    <li key={buyer.id}>
                      {onOpen
                        ? <button type="button" onClick={() => onOpen(buyer)} className={cls}>{body}</button>
                        : <Link to={`/buyers/${buyer.id}`} className={cls}>{body}</Link>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
