/**
 * Marketing > Overview: the Buyer CRM and sales-channel view. Top to bottom: five numbers (total leads, qualified leads,
 * open quotations, conversion rate, follow-ups due), the follow-ups that are due, the pipeline (every stage with its buyer
 * count; tap one to filter the board), the pipeline board (buyers in columns) and the "Sales by channel" report.
 * "Add lead" opens the same buyer form as the Buyers tab (a lead is a buyer record).
 * API: GET /buyers/summary (useBuyerSummary) for the numbers, pipeline and channel report; GET /buyers (useBuyers) for the
 * board (filtered by stage) and the follow-ups list (due=1). BuyerForm invalidates ['buyers'], so this refreshes after a
 * buyer is added or changed. Used by pages/Marketing.tsx.
 */
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BuyerForm } from '@/components/BuyerForm';
import { BuyerBoard } from '@/components/buyers/BuyerBoard';
import { CrmChannels, CrmKpis, CrmPipeline } from '@/components/buyers/CrmDashboard';
import { StagePill } from '@/components/buyers/StagePill';
import { Button, Card, ErrorNote, Sheet, Spinner } from '@/components/ui';
import { date } from '@/lib/format';
import { useBuyers, useBuyerSummary } from '@/lib/hooks';
import type { Stage } from '@/lib/types';
import { t } from '@/strings';

const c = t.crm;

/** The Overview tab; see the file comment. */
export function OverviewTab() {
  const navigate = useNavigate();
  const summary = useBuyerSummary();
  // the pipeline stage the board is filtered by ('' = all stages)
  const [stage, setStage] = useState<'' | Stage>('');
  const [adding, setAdding] = useState(false);
  const board = useBuyers({ stage: stage || undefined });
  const due = useBuyers({ due: '1' });
  // the follow-ups section, so the "Follow-ups due" card can scroll to it
  const followupsRef = useRef<HTMLElement>(null);
  const dueRows = due.data ?? [];

  return (
    <div className="space-y-4">
      {summary.isPending && <Spinner />}
      {summary.isError && <ErrorNote error={summary.error} onRetry={() => void summary.refetch()} />}

      {summary.data && (
        <>
          <CrmKpis summary={summary.data} onFollowups={() => followupsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

          {dueRows.length > 0 && (
            <section ref={followupsRef} aria-labelledby="fu-h" className="scroll-mt-4">
              <Card className="p-4">
                <h2 id="fu-h" className="text-[17px] font-bold leading-6 text-ink">{c.followupsHeading}</h2>
                <p className="mb-2 text-sm text-fg-muted">{c.followupsHint}</p>
                <ul className="divide-y divide-cream-200">
                  {dueRows.map((b) => (
                    <li key={b.id}>
                      <Link to={`/buyers/${b.id}`} className="flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-forest-50">
                        <span className="min-w-0 flex-1 break-words font-semibold text-forest-900">{b.company_name}</span>
                        <StagePill stage={b.stage} />
                        <span className="text-sm text-fg-secondary">{b.next_action}</span>
                        <span className="text-sm font-semibold text-red-700">{b.next_followup && date(b.next_followup)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <CrmPipeline summary={summary.data} stage={stage} onStage={setStage} />

          <section aria-labelledby="board-h">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 id="board-h" className="text-[17px] font-bold leading-6 text-ink">{c.boardHeading}</h2>
              <div className="flex flex-wrap items-center gap-3">
                {stage && (
                  <p className="text-sm text-fg-secondary">
                    {c.boardFiltered(c.stages[stage])}{' '}
                    <button type="button" onClick={() => setStage('')} className="font-medium text-forest-800 underline">{c.showAll}</button>
                  </p>
                )}
                <Button variant="secondary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />{c.addLead}</Button>
              </div>
            </div>
            {board.isPending ? <Spinner /> : board.isError ? <ErrorNote error={board.error} onRetry={() => void board.refetch()} /> : <BuyerBoard buyers={board.data ?? []} />}
          </section>

          <CrmChannels summary={summary.data} />
        </>
      )}

      <Sheet wide open={adding} onClose={() => setAdding(false)} title={t.buyerForm.newTitle}>
        <BuyerForm onCancel={() => setAdding(false)} onSaved={(b) => { setAdding(false); navigate(`/buyers/${b.id}`); }} />
      </Sheet>
    </div>
  );
}
