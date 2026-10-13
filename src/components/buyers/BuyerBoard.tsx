/**
 * Pipeline board: the buyers shown as five columns (Prospect, Qualified buyer, Active opportunity, Customer, Lost),
 * each buyer a small card with their stage, product count, next action and follow-up date. Tapping a card opens the
 * buyer's page. Used by pages/Buyers.tsx as the "Board" view; it shows the same (filtered, searched) buyers as the
 * list. On a phone the columns scroll sideways. No API calls: the buyers are passed in.
 */
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { StagePill } from '@/components/buyers/StagePill';
import { GROUP_TINT, stageGroup, type StageGroup } from '@/lib/crm';
import { date } from '@/lib/format';
import type { Buyer } from '@/lib/types';
import { t } from '@/strings';

const c = t.crm;
const GROUPS: StageGroup[] = ['prospect', 'qualified', 'opportunity', 'customer', 'lost'];

/** Today's date as 'YYYY-MM-DD' in India time, to compare with follow-up dates. */
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** @param props.buyers — the buyers to place in columns by the group of their stage. */
export function BuyerBoard({ buyers }: { buyers: Buyer[] }) {
  const today = todayIso();
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
      {GROUPS.map((g) => {
        const list = buyers.filter((b) => stageGroup(b.stage) === g);
        return (
          <section key={g} aria-label={c.groups[g]} className={clsx('min-w-[260px] shrink-0 snap-start rounded-xl p-2 md:min-w-0', GROUP_TINT[g])}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="text-sm font-semibold text-forest-900">{c.groups[g]}</h3>
              <span className="text-sm font-bold tabular-nums text-forest-900">{list.length}</span>
            </div>
            {list.length === 0 ? <p className="px-1 py-3 text-sm text-ink/50">{c.boardEmpty}</p> : (
              <ul className="space-y-2">
                {list.map((b) => {
                  const overdue = !!b.next_followup && b.next_followup <= today;
                  return (
                    <li key={b.id}>
                      <Link to={`/buyers/${b.id}`} className="card block p-2.5 hover:bg-forest-50">
                        <div className="break-words font-semibold text-forest-900">{b.company_name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1"><StagePill stage={b.stage} /></div>
                        {(b.channel || b.lead_source) && (
                          <div className="mt-1 text-xs text-ink/60">{[b.channel && c.channels[b.channel], b.lead_source].filter(Boolean).join(' · ')}</div>
                        )}
                        {b.interested_products.length > 0 && (
                          <div className="mt-1 line-clamp-2 text-xs text-ink/70">{b.interested_products.join(', ')}</div>
                        )}
                        {(b.next_action || b.next_followup) && (
                          <div className={clsx('mt-1 text-xs', overdue ? 'font-semibold text-red-700' : 'text-forest-800')}>
                            {[b.next_action, b.next_followup && date(b.next_followup)].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </Link>
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
