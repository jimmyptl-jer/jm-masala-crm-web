/**
 * The pieces of the Marketing tab's dashboard, built from the answer of GET /buyers/summary:
 *  - CrmKpis: five number cards (total leads, qualified leads, open quotations, conversion rate, follow-ups due);
 *  - CrmPipeline: every pipeline stage with its buyer count, grouped into prospect / qualified / active opportunity /
 *    customer / lost; tapping a stage filters the board below it;
 *  - CrmChannels: the "Sales by channel" report (leads, qualified, customers, conversion, quotes, quoted / won value,
 *    estimated profit and lead cost per channel).
 * No API calls here: pages/Marketing.tsx fetches the summary (useBuyerSummary) and passes it in. All figures are
 * computed by the API; money arrives as decimal strings per currency and is only formatted here.
 */
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { GROUP_TINT, STAGES, stageGroup, type StageGroup } from '@/lib/crm';
import { money } from '@/lib/format';
import type { BuyerSummary, ChannelRow, Stage } from '@/lib/types';
import { t } from '@/strings';

const c = t.crm;

/** The order the pipeline groups are shown in. */
const GROUPS: StageGroup[] = ['prospect', 'qualified', 'opportunity', 'customer', 'lost'];

/** One number card. `to` makes it a link, `onClick` a button; `tone` colours the big number. */
function Kpi({ label, value, sub, tone, to, onClick }: {
  label: string; value: string | number; sub: string; tone?: string; to?: string; onClick?: () => void;
}) {
  const cls = clsx('card flex min-h-[88px] flex-col justify-between p-3 text-left', (to || onClick) && 'hover:bg-forest-50');
  const body = (
    <>
      <span className="text-sm font-medium text-fg-secondary">{label}</span>
      <span className={clsx('text-3xl font-bold tabular-nums', tone ?? 'text-forest-900')}>{value}</span>
      <span className="text-xs text-fg-muted">{sub}</span>
    </>
  );
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/**
 * The five number cards, plus a warning line when live buyers have no next follow-up date.
 * @param props.summary — the summary. @param props.onFollowups — called when the "Follow-ups due" card is tapped
 *   (the page scrolls to the follow-up list).
 */
export function CrmKpis({ summary, onFollowups }: { summary: BuyerSummary; onFollowups: () => void }) {
  const tt = summary.totals;
  const qualifiedPct = tt.leads > 0 ? (Math.round((tt.qualified * 1000) / tt.leads) / 10).toFixed(1) : '0.0';
  return (
    <div className="space-y-3">
      <section aria-label={c.kpiLeads} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label={c.kpiLeads} value={tt.leads} sub={c.kpiLeadsSub(tt.customers, tt.lost)} />
        <Kpi label={c.kpiQualified} value={tt.qualified} sub={c.kpiQualifiedSub(qualifiedPct)} tone="text-sky-800" />
        <Kpi label={c.kpiOpen} value={tt.open_quotations} sub={c.kpiOpenSub} tone="text-amber-800" to="/quotes?status=sent" />
        <Kpi label={c.kpiConversion} value={tt.conversion_rate === null ? '—' : `${tt.conversion_rate}%`} sub={c.kpiConversionSub} tone="text-emerald-800" />
        <Kpi
          label={c.kpiFollowups} value={tt.followups_due} sub={tt.followups_due > 0 ? c.kpiFollowupsSub : c.kpiFollowupsNone}
          tone={tt.followups_due > 0 ? 'text-red-700' : 'text-forest-900'} onClick={tt.followups_due > 0 ? onFollowups : undefined}
        />
      </section>
      {tt.no_next_action > 0 && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{c.noNextAction(tt.no_next_action)}</p>
      )}
    </div>
  );
}

/**
 * The pipeline: five coloured panels (one per group), each listing its stages with the number of buyers.
 * @param props.summary — the summary. @param props.stage — the stage currently filtering the board ('' = none).
 * @param props.onStage — called with a stage to filter by it, or '' (tapping the active stage again).
 */
export function CrmPipeline({ summary, stage, onStage }: { summary: BuyerSummary; stage: '' | Stage; onStage: (s: '' | Stage) => void }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-[17px] font-bold leading-6 text-ink">{c.pipelineHeading}</h2>
        <p className="text-sm text-fg-muted">{stage ? c.stageFilterOn : c.pipelineHint}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {GROUPS.map((g) => {
          const stages = STAGES.filter((s) => stageGroup(s) === g);
          const total = stages.reduce((n, s) => n + (summary.stages[s] ?? 0), 0);
          return (
            <div key={g} className={clsx('rounded-lg p-2', GROUP_TINT[g])}>
              <div className="mb-1 flex items-baseline justify-between px-1">
                <span className="text-sm font-semibold text-forest-900">{c.groups[g]}</span>
                <span className="text-lg font-bold tabular-nums text-forest-900">{total}</span>
              </div>
              <ul className="space-y-1">
                {stages.map((s) => {
                  const n = summary.stages[s] ?? 0;
                  const on = stage === s;
                  return (
                    <li key={s}>
                      <button
                        type="button" aria-pressed={on} onClick={() => onStage(on ? '' : s)}
                        className={clsx('flex min-h-[36px] w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm', on ? 'bg-forest-900 text-white' : 'bg-surface text-forest-900 hover:bg-white', n === 0 && !on && 'opacity-60')}
                      >
                        <span className="min-w-0 truncate">{c.stages[s]}</span>
                        <span className="font-semibold tabular-nums">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Money lines of one channel, one per currency ("USD 38,500.00"); a dash when there is none. */
function MoneyLines({ row, field }: { row: ChannelRow; field: 'quoted' | 'won' | 'profit' }) {
  const lines = row.by_currency.filter((m) => Number(m[field]) !== 0);
  if (lines.length === 0) return <span className="text-fg-muted">—</span>;
  return <>{lines.map((m) => <div key={m.currency} className="whitespace-nowrap tabular-nums">{money(m[field], m.currency)}</div>)}</>;
}

/** Display name of a channel row. */
const channelName = (ch: ChannelRow['channel']) => (ch === 'unassigned' ? c.noChannel : c.channels[ch]);

/** Lead cost cell: rupees, or a dash when zero. */
const LeadCost = ({ row }: { row: ChannelRow }) => (Number(row.lead_cost) ? <>{money(row.lead_cost, 'INR')}</> : <span className="text-fg-muted">—</span>);

/** @param props.summary — the summary; the report is its `channels` list (biggest channel first). */
export function CrmChannels({ summary }: { summary: BuyerSummary }) {
  const withChannel = summary.channels.filter((r) => r.channel !== 'unassigned').length;
  return (
    <Card className="p-4">
      <h2 className="text-[17px] font-bold leading-6 text-ink">{c.channelHeading}</h2>
      <p className="mb-3 text-sm text-fg-muted">{c.channelHint}</p>
      {withChannel === 0 ? (
        <p className="rounded-lg bg-cream-100 p-3 text-base text-fg-secondary">{c.channelNone}</p>
      ) : (
        <>
          {/* wide screens: a table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-cream-200 text-fg-muted">
                  <th className="py-2 pr-3 font-medium">{c.colChannel}</th>
                  <th className="px-2 py-2 text-right font-medium">{c.colLeads}</th>
                  <th className="px-2 py-2 text-right font-medium">{c.colQualified}</th>
                  <th className="px-2 py-2 text-right font-medium">{c.colCustomers}</th>
                  <th className="px-2 py-2 text-right font-medium">{c.colConversion}</th>
                  <th className="px-2 py-2 text-right font-medium">{c.colQuotes}</th>
                  <th className="px-2 py-2 text-right font-medium">{c.colQuoted}</th>
                  <th className="px-2 py-2 text-right font-medium">{c.colWon}</th>
                  <th className="px-2 py-2 text-right font-medium">{c.colProfit}</th>
                  <th className="py-2 pl-2 text-right font-medium">{c.colLeadCost}</th>
                </tr>
              </thead>
              <tbody>
                {summary.channels.map((r) => (
                  <tr key={r.channel} className="border-b border-cream-200 align-top last:border-0">
                    <th className="py-2 pr-3 font-semibold text-forest-900">{channelName(r.channel)}</th>
                    <td className="px-2 py-2 text-right tabular-nums">{r.leads}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.qualified}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.customers}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.conversion_rate === null ? '—' : `${r.conversion_rate}%`}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.quotes_issued}</td>
                    <td className="px-2 py-2 text-right"><MoneyLines row={r} field="quoted" /></td>
                    <td className="px-2 py-2 text-right"><MoneyLines row={r} field="won" /></td>
                    <td className="px-2 py-2 text-right"><MoneyLines row={r} field="profit" /></td>
                    <td className="py-2 pl-2 text-right tabular-nums"><LeadCost row={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* phones: one small card per channel */}
          <ul className="space-y-2 md:hidden">
            {summary.channels.map((r) => (
              <li key={r.channel} className="rounded-lg border border-cream-200 p-3">
                <div className="mb-2 font-semibold text-forest-900">{channelName(r.channel)}</div>
                <dl className="grid grid-cols-4 gap-2 text-center">
                  <div><dd className="text-lg font-semibold tabular-nums">{r.leads}</dd><dt className="text-xs text-fg-muted">{c.colLeads}</dt></div>
                  <div><dd className="text-lg font-semibold tabular-nums">{r.qualified}</dd><dt className="text-xs text-fg-muted">{c.colQualified}</dt></div>
                  <div><dd className="text-lg font-semibold tabular-nums">{r.customers}</dd><dt className="text-xs text-fg-muted">{c.colCustomers}</dt></div>
                  <div><dd className="text-lg font-semibold tabular-nums">{r.conversion_rate === null ? '—' : `${r.conversion_rate}%`}</dd><dt className="text-xs text-fg-muted">{c.colConversion}</dt></div>
                </dl>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <div><dt className="text-xs text-fg-muted">{c.colQuoted} ({r.quotes_issued})</dt><dd><MoneyLines row={r} field="quoted" /></dd></div>
                  <div><dt className="text-xs text-fg-muted">{c.colWon}</dt><dd><MoneyLines row={r} field="won" /></dd></div>
                  <div><dt className="text-xs text-fg-muted">{c.colProfit}</dt><dd><MoneyLines row={r} field="profit" /></dd></div>
                  <div><dt className="text-xs text-fg-muted">{c.colLeadCost}</dt><dd className="tabular-nums"><LeadCost row={r} /></dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
