/**
 * Cards on the buyer page for the Buyer CRM: "Sales pipeline" (stage with a quick-change dropdown, lead source,
 * what the buyer wants, next action and follow-up date) and "Performance" (quotes issued / won / lost and the
 * quoted and won value per currency).
 * API: PATCH /buyers/:id { stage, lost_reason? } for the quick stage change (invalidates ['buyer', id] and
 * ['buyers']); everything else is read from the GET /buyers/:id data the page already has. The performance numbers
 * are computed by the API (the web never adds money). Used by pages/BuyerDetail.tsx.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { StagePill } from '@/components/buyers/StagePill';
import { Button, Card, Input, Select, useToast, errorMessage } from '@/components/ui';
import { api } from '@/lib/api';
import { STAGES, stageGroup } from '@/lib/crm';
import { date, dateTime, money } from '@/lib/format';
import type { Buyer, BuyerDetail, Stage } from '@/lib/types';
import { t } from '@/strings';

const c = t.crm;
const nf = t.buyers.notSet;

/** One label / value pair; a grey "not set" when the value is empty. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink/60">{label}</dt>
      <dd className="whitespace-pre-line break-words text-base text-ink">{children || <span className="text-ink/40">{nf}</span>}</dd>
    </div>
  );
}

/** Makes a typed website address clickable (adds https:// when it has no scheme). */
const href = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

/**
 * @param props.b — the buyer as returned by GET /buyers/:id (with performance, assigned_name and activities).
 * Local state: `pending` (a stage chosen in the dropdown but not saved yet, only used for 'lost', which needs a
 * reason first) and `reason` (the lost reason being typed).
 */
export function BuyerPipelineCard({ b }: { b: BuyerDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pending, setPending] = useState<Stage | null>(null);
  const [reason, setReason] = useState('');

  // PATCH /buyers/:id with only the stage (and the reason when lost); the other fields stay as they are.
  const move = useMutation({
    mutationFn: (v: { stage: Stage; lost_reason?: string }) => api.patch<Buyer>(`/buyers/${b.id}`, v),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['buyer', b.id] }), qc.invalidateQueries({ queryKey: ['buyers'] })]);
      setPending(null);
      setReason('');
      toast(c.stageSaved);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  /** Dropdown handler: 'lost' waits for a reason; every other stage is saved straight away. */
  const choose = (stage: Stage) => {
    if (stage === b.stage) { setPending(null); return; }
    if (stage === 'lost') { setPending('lost'); return; }
    setPending(null);
    move.mutate({ stage });
  };

  // Newest logged contact (calls, WhatsApp, e-mail, meetings, notes; automatic status entries do not count).
  const lastContact = b.activities.find((a) => a.kind !== 'status_change')?.happened_at;
  const overdue = !!b.next_followup && b.next_followup <= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const p = b.performance;

  return (
    <>
      <Card className="p-4">
        <h2 className="mb-3 font-serif text-xl font-semibold md:text-2xl text-forest-900">{c.pipelineTitle}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StagePill stage={b.stage} />
          <span className="text-sm text-ink/70">{c.groups[stageGroup(b.stage)]}</span>
          {b.qualified && <span className="inline-block rounded-full bg-forest-50 px-2.5 py-0.5 text-xs font-semibold text-forest-800">{c.qualifiedBadge}</span>}
        </div>
        {b.stage === 'lost' && b.lost_reason && <p className="mt-2 text-base text-red-800">{b.lost_reason}</p>}

        <div className="mt-3">
          <Select label={c.changeStage} value={pending ?? b.stage} onChange={(e) => choose(e.target.value as Stage)} disabled={move.isPending}>
            {STAGES.map((x) => <option key={x} value={x}>{c.stages[x]}</option>)}
          </Select>
          {pending === 'lost' && (
            <div className="mt-2 space-y-2">
              <Input label={c.lostReason} value={reason} onChange={(e) => setReason(e.target.value)} hint={c.lostNeedsReason} />
              <Button variant="danger" loading={move.isPending} disabled={!reason.trim()} onClick={() => move.mutate({ stage: 'lost', lost_reason: reason.trim() })}>{c.saveLost}</Button>
            </div>
          )}
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <Fact label={c.nextAction}>{b.next_action}</Fact>
          <Fact label={c.nextFollowup}>{b.next_followup && <span className={clsx(overdue && 'font-semibold text-red-700')}>{date(b.next_followup)}{overdue ? ` (${c.overdueWord})` : ''}</span>}</Fact>
          <Fact label={c.assignedLabel}>{b.assigned_name}</Fact>
          <Fact label={c.lastContactLabel}>{lastContact ? dateTime(lastContact) : c.noContactYet}</Fact>
          <Fact label={c.channel}>{b.channel && c.channels[b.channel]}</Fact>
          <Fact label={c.leadSource}>{[b.lead_source, b.source_detail].filter(Boolean).join(' · ')}</Fact>
          <Fact label={c.firstInquiryOn}>{b.first_inquiry_date && date(b.first_inquiry_date)}</Fact>
          <Fact label={c.leadCostIs}>{b.lead_cost && money(b.lead_cost, 'INR')}</Fact>
          <div className="sm:col-span-2">
            <Fact label={c.interestedProducts}>
              {b.interested_products.length > 0 && (
                <span className="flex flex-wrap gap-1.5">
                  {b.interested_products.map((n) => <span key={n} className="rounded-full bg-cream-100 px-2.5 py-0.5 text-sm text-forest-900">{n}</span>)}
                </span>
              )}
            </Fact>
          </div>
          <div className="sm:col-span-2"><Fact label={c.requirements}>{b.requirements}</Fact></div>
          <Fact label={c.businessType}>{b.business_type && c.businessTypes[b.business_type]}</Fact>
          <Fact label={c.designation}>{b.designation}</Fact>
          <Fact label={c.website}>{b.website && <a className="text-forest-800 underline" href={href(b.website)} target="_blank" rel="noopener noreferrer">{b.website}</a>}</Fact>
          <Fact label={c.linkedin}>{b.linkedin && <a className="text-forest-800 underline" href={href(b.linkedin)} target="_blank" rel="noopener noreferrer">{b.linkedin}</a>}</Fact>
          <div className="sm:col-span-2"><Fact label={c.registration}>{b.registration_details}</Fact></div>
        </dl>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-serif text-xl font-semibold md:text-2xl text-forest-900">{c.secPerformance}</h2>
        {p.quotes_issued === 0 ? <p className="text-base text-ink/60">{c.perfNone}</p> : (
          <>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div><dd className="text-2xl font-semibold tabular-nums text-forest-900">{p.quotes_issued}</dd><dt className="text-sm text-ink/60">{c.perfQuotes}</dt></div>
              <div><dd className="text-2xl font-semibold tabular-nums text-emerald-800">{p.won}</dd><dt className="text-sm text-ink/60">{c.perfWon}</dt></div>
              <div><dd className="text-2xl font-semibold tabular-nums text-red-800">{p.lost}</dd><dt className="text-sm text-ink/60">{c.perfLost}</dt></div>
            </dl>
            <table className="mt-4 w-full text-left text-base">
              <thead><tr className="text-sm text-ink/60"><th className="py-1 font-normal" />
                <th className="py-1 text-right font-normal">{c.perfQuoted}</th><th className="py-1 text-right font-normal">{c.perfRevenue}</th></tr></thead>
              <tbody>
                {p.by_currency.map((r) => (
                  <tr key={r.currency} className="border-t border-cream-200">
                    <th className="py-1.5 font-medium text-forest-900">{r.currency}</th>
                    <td className="py-1.5 text-right tabular-nums">{money(r.quoted, r.currency)}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(r.won, r.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </>
  );
}
