/**
 * Responsive buyer Kanban. Requirement/sample substages are grouped under the seven visible sales stages.
 * Cards link to buyer records; stage changes remain in the buyer profile where they are persisted.
 */
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { StagePill } from '@/components/buyers/StagePill';
import { date } from '@/lib/format';
import type { Buyer, Stage } from '@/lib/types';
import { t } from '@/strings';

const c = t.crm;
const COLUMNS: { key: Stage; label: string; includes: Stage[]; tint: string }[] = [
  { key: 'new_lead', label: 'New leads', includes: ['new_lead'], tint: 'border-slate-200 bg-slate-100/60' },
  { key: 'contacted', label: 'Contacted', includes: ['contacted'], tint: 'border-blue-100 bg-blue-50/60' },
  { key: 'qualified', label: 'Qualified', includes: ['qualified', 'requirements_received'], tint: 'border-indigo-100 bg-indigo-50/55' },
  { key: 'quotation_sent', label: 'Quotation sent', includes: ['quotation_sent', 'sample_requested', 'sample_payment_pending', 'sample_dispatched', 'sample_approved'], tint: 'border-emerald-100 bg-emerald-50/55' },
  { key: 'negotiation', label: 'Negotiation', includes: ['negotiation', 'po_received'], tint: 'border-amber-100 bg-amber-50/60' },
  { key: 'won', label: 'Won', includes: ['won'], tint: 'border-green-100 bg-green-50/60' },
  { key: 'lost', label: 'Lost', includes: ['lost'], tint: 'border-rose-100 bg-rose-50/55' },
];

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export function BuyerBoard({ buyers }: { buyers: Buyer[] }) {
  const today = todayIso();
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-[repeat(7,minmax(190px,1fr))] md:overflow-x-auto md:px-0">
      {COLUMNS.map((column) => {
        const list = buyers.filter((buyer) => column.includes.includes(buyer.stage));
        return (
          <section key={column.key} aria-label={column.label} className={clsx('min-w-[230px] shrink-0 snap-start rounded-2xl border p-2.5 shadow-sm backdrop-blur-md md:min-w-0', column.tint)}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="text-sm font-semibold text-crm-ink">{column.label}</h3>
              <span className="rounded-full border border-white/90 bg-white/75 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-600">{list.length}</span>
            </div>
            {list.length === 0 ? <p className="px-1 py-3 text-sm text-slate-500">{c.boardEmpty}</p> : (
              <ul className="space-y-2">
                {list.map((buyer) => {
                  const overdue = !!buyer.next_followup && buyer.next_followup <= today;
                  const location = [buyer.city, buyer.type === 'export' ? buyer.country : buyer.state].filter(Boolean).join(', ');
                  return (
                    <li key={buyer.id}>
                      <Link to={`/buyers/${buyer.id}`} className="card glass-interactive block bg-white/85 p-3 hover:bg-white">
                        <div className="break-words text-sm font-semibold text-crm-ink">{buyer.company_name}</div>
                        {location && <div className="mt-1 truncate text-xs text-slate-500">{location}</div>}
                        <div className="mt-1 flex flex-wrap items-center gap-1"><StagePill stage={buyer.stage} /></div>
                        {buyer.interested_products.length > 0 && <div className="mt-1 line-clamp-2 text-xs text-slate-600">{buyer.interested_products.join(', ')}</div>}
                        {(buyer.next_action || buyer.next_followup) && <div className={clsx('mt-2 border-t border-slate-100 pt-2 text-xs', overdue ? 'font-semibold text-red-700' : 'text-slate-600')}>
                          {[buyer.next_action, buyer.next_followup && date(buyer.next_followup)].filter(Boolean).join(' · ')}
                        </div>}
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
