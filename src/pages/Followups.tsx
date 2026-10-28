import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, CalendarClock, CheckCircle2, Clock3, NotebookPen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogActivitySheet } from '@/components/quote/LogActivitySheet';
import { Button, ErrorNote, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { date, money, todayIST } from '@/lib/format';
import { useBuyers } from '@/lib/hooks';
import type { Dashboard, DueRow, QuoteList } from '@/lib/types';

function FollowupRow({ row, overdue, onLog }: { row: DueRow; overdue: boolean; onLog: (row: DueRow) => void }) {
  return (
    <article className="flex flex-wrap items-center gap-3 border-b border-slate-200/70 px-3 py-3 last:border-0">
      <span className={overdue ? 'grid h-10 w-10 place-items-center rounded-xl bg-red-100 text-red-700' : 'grid h-10 w-10 place-items-center rounded-xl bg-surface-muted text-ink-muted'}><CalendarClock className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <Link to={`/quotes/${row.id}`} className="truncate font-semibold text-brand hover:underline">{row.buyer_name}</Link>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><span>{row.number}</span><span>·</span><span>{money(row.grand_total, row.currency)}</span><StatusBadge status={row.status} /></div>
        <p className={overdue ? 'text-xs font-medium text-red-700' : 'text-xs text-slate-500'}>{overdue ? `${row.days_overdue} day${row.days_overdue === 1 ? '' : 's'} overdue` : `Due today · ${date(row.next_followup)}`}{row.last_body ? ` · Last note: ${row.last_body}` : ''}</p>
      </div>
      <Button variant="secondary" className="shrink-0 px-3 text-sm" onClick={() => onLog(row)}><NotebookPen className="h-4 w-4" />Log contact</Button>
    </article>
  );
}

export default function Followups() {
  const [logRow, setLogRow] = useState<DueRow | null>(null);
  const today = todayIST();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });
  const quotes = useQuery({ queryKey: ['follow-ups', 'quotes'], queryFn: () => api.get<QuoteList>('/quotes?limit=100') });
  const buyers = useBuyers();
  const due = dashboard.data?.due ?? [];
  const overdue = due.filter((row) => row.days_overdue > 0);
  const todayRows = due.filter((row) => row.days_overdue === 0);
  const upcoming = useMemo(() => (quotes.data?.data ?? []).filter((quote) =>
    (quote.status === 'sent' || quote.status === 'negotiating') && !!quote.next_followup && quote.next_followup > today,
  ), [quotes.data, today]);
  const buyerActions = useMemo(() => (buyers.data ?? []).filter((buyer) => !buyer.archived && buyer.next_followup), [buyers.data]);
  const isPending = dashboard.isPending || quotes.isPending || buyers.isPending;
  const error = dashboard.error ?? quotes.error ?? buyers.error;

  return (
    <div>
      <PageHeader title="Follow-ups" subtitle="Keep every open buyer conversation moving." />
      {isPending ? <Spinner /> : error ? <ErrorNote error={error} onRetry={() => { void dashboard.refetch(); void quotes.refetch(); }} /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="glass-panel overflow-hidden" aria-labelledby="overdue-heading">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3"><div><h2 id="overdue-heading" className="text-[15px] font-bold text-fg">Overdue</h2><p className="text-sm text-slate-500">Needs attention first</p></div><span className="rounded-full bg-red-100 px-2.5 py-1 text-sm font-semibold text-red-700">{overdue.length}</span></div>
            {overdue.length ? overdue.map((row) => <FollowupRow key={row.id} row={row} overdue onLog={setLogRow} />) : <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500"><CheckCircle2 className="h-5 w-5 text-emerald-600" />No overdue follow-ups.</div>}
          </section>
          <section className="glass-panel overflow-hidden" aria-labelledby="today-heading">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3"><div><h2 id="today-heading" className="text-[15px] font-bold text-fg">Due today</h2><p className="text-sm text-slate-500">Quotes awaiting a buyer response</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800">{todayRows.length}</span></div>
            {todayRows.length ? todayRows.map((row) => <FollowupRow key={row.id} row={row} overdue={false} onLog={setLogRow} />) : <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500"><CheckCircle2 className="h-5 w-5 text-emerald-600" />No follow-ups due today.</div>}
          </section>
          <section className="glass-panel overflow-hidden xl:col-span-2" aria-labelledby="upcoming-heading">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3"><div><h2 id="upcoming-heading" className="text-[15px] font-bold text-fg">Upcoming</h2><p className="text-sm text-slate-500">Scheduled follow-ups for active quotations</p></div><span className="rounded-full bg-blue-100 px-2.5 py-1 text-sm font-semibold text-crm-blue">{upcoming.length}</span></div>
            {upcoming.length ? <div className="divide-y divide-slate-200/70">{upcoming.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-crm-blue"><Clock3 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><Link to={`/quotes/${row.id}`} className="font-semibold text-brand hover:underline">{row.buyer_name}</Link><div className="text-sm text-slate-500">{row.number ?? 'Draft'} · {row.products || 'Quotation'} · {money(row.grand_total, row.currency)}</div></div><div className="text-sm text-slate-600">{date(row.next_followup)}</div><Link to={`/quotes/${row.id}`} aria-label={`Open quotation for ${row.buyer_name}`} className="tap grid place-items-center rounded-lg text-crm-blue hover:bg-forest-50"><ArrowUpRight className="h-5 w-5" /></Link></div>)}</div> : <p className="px-4 py-8 text-sm text-slate-500">No upcoming follow-ups are scheduled.</p>}
          </section>
          <section className="glass-panel overflow-hidden xl:col-span-2" aria-labelledby="buyer-actions-heading">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3"><div><h2 id="buyer-actions-heading" className="font-semibold text-crm-ink">Buyer next actions</h2><p className="text-sm text-slate-500">Relationship reminders saved on buyer profiles</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-800">{buyerActions.length}</span></div>
            {buyerActions.length ? <div className="divide-y divide-slate-200/70">{buyerActions.map((buyer) => {
              const late = buyer.next_followup! <= today;
              return <div key={buyer.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><span className={late ? 'grid h-10 w-10 place-items-center rounded-xl bg-red-100 text-red-700' : 'grid h-10 w-10 place-items-center rounded-xl bg-surface-muted text-ink-muted'}><Building2 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><Link to={`/buyers/${buyer.id}`} className="font-semibold text-crm-blue hover:underline">{buyer.company_name}</Link><div className="text-sm text-slate-500">{buyer.next_action || 'Review buyer requirements'}</div></div><div className={late ? 'text-sm font-medium text-red-700' : 'text-sm text-slate-600'}>{date(buyer.next_followup)}</div><Link to={`/buyers/${buyer.id}`} className="tap inline-flex items-center gap-1 rounded-lg px-2 text-sm font-medium text-crm-blue hover:bg-forest-50">Open buyer <ArrowUpRight className="h-4 w-4" /></Link></div>;
            })}</div> : <p className="px-4 py-8 text-sm text-slate-500">No buyer reminders have been set.</p>}
          </section>
        </div>
      )}
      <LogActivitySheet key={logRow?.id ?? 'none'} open={logRow !== null} onClose={() => setLogRow(null)} quoteId={logRow?.id ?? ''} subtitle={logRow ? `${logRow.buyer_name}, ${logRow.number}` : undefined} />
    </div>
  );
}
