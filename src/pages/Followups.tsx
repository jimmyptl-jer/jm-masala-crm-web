import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, CalendarClock, CheckCircle2, Clock3, NotebookPen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogActivitySheet } from '@/components/quote/LogActivitySheet';
import { Button, ErrorNote, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { hasRoute, PROBE_ID } from '@/lib/config';
import { date, money, todayIST } from '@/lib/format';
import { useBuyers } from '@/lib/hooks';
import type { Dashboard, DueRow, QuoteList } from '@/lib/types';
import { t } from '@/strings';

const f = t.followups;

function FollowupRow({ row, overdue, onLog }: { row: DueRow; overdue: boolean; onLog?: (row: DueRow) => void }) {
  return (
    <article className="flex flex-wrap items-center gap-3 border-b border-slate-200/70 px-3 py-3 last:border-0">
      <span className={overdue ? 'grid h-10 w-10 place-items-center rounded-xl bg-red-100 text-red-700' : 'grid h-10 w-10 place-items-center rounded-xl bg-surface-muted text-ink-muted'}><CalendarClock className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <Link to={`/quotes/${row.id}`} className="truncate font-semibold text-brand hover:underline">{row.buyer_name}</Link>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><span>{row.number}</span><span>·</span><span>{money(row.grand_total, row.currency)}</span><StatusBadge status={row.status} /></div>
        <p className={overdue ? 'text-xs font-medium text-red-700' : 'text-xs text-slate-500'}>{overdue ? f.daysOverdue(row.days_overdue) : f.dueToday(date(row.next_followup))}{row.last_body ? f.lastNote(row.last_body) : ''}</p>
      </div>
      {onLog && <Button variant="secondary" className="shrink-0 px-3 text-sm" onClick={() => onLog(row)}><NotebookPen className="h-4 w-4" />{f.logContact}</Button>}
    </article>
  );
}

export default function Followups() {
  const [logRow, setLogRow] = useState<DueRow | null>(null);
  const today = todayIST();
  // routes that may not be live yet (config.ts hasRoute)
  const dashOn = hasRoute('GET', '/dashboard');
  const logOn = hasRoute('POST', `/quotes/${PROBE_ID}/activities`);
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard'), enabled: dashOn });
  const quotes = useQuery({ queryKey: ['follow-ups', 'quotes'], queryFn: () => api.get<QuoteList>('/quotes?limit=100') });
  const buyers = useBuyers();
  const due = dashboard.data?.due ?? [];
  const overdue = due.filter((row) => row.days_overdue > 0);
  const todayRows = due.filter((row) => row.days_overdue === 0);
  const upcoming = useMemo(() => (quotes.data?.data ?? []).filter((quote) =>
    (quote.status === 'sent' || quote.status === 'negotiating') && !!quote.next_followup && quote.next_followup > today,
  ), [quotes.data, today]);
  const buyerActions = useMemo(() => (buyers.data ?? []).filter((buyer) => !buyer.archived && buyer.next_followup), [buyers.data]);
  const isPending = (dashOn && dashboard.isPending) || quotes.isPending || buyers.isPending;
  const error = dashboard.error ?? quotes.error ?? buyers.error;

  return (
    <div>
      <PageHeader title={f.title} subtitle={f.subtitle} />
      {quotes.data && quotes.data.total > quotes.data.data.length && <p role="status" className="mb-4 rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">{t.common.listTruncated(quotes.data.data.length, quotes.data.total)}</p>}
      {isPending ? <Spinner /> : error ? <ErrorNote error={error} onRetry={() => { if (dashOn) void dashboard.refetch(); void quotes.refetch(); }} /> : (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="glass-panel overflow-hidden" aria-labelledby="overdue-heading">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3"><div><h2 id="overdue-heading" className="text-[15px] font-bold text-fg">{f.overdueTitle}</h2><p className="text-sm text-slate-500">{f.overdueHint}</p></div><span className="rounded-full bg-red-100 px-2.5 py-1 text-sm font-semibold text-red-700">{overdue.length}</span></div>
            {overdue.length ? overdue.map((row) => <FollowupRow key={row.id} row={row} overdue onLog={logOn ? setLogRow : undefined} />) : <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">{dashOn ? <><CheckCircle2 className="h-5 w-5 text-emerald-600" />{f.overdueEmpty}</> : f.dueUnavailable}</div>}
          </section>
          <section className="glass-panel overflow-hidden" aria-labelledby="today-heading">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3"><div><h2 id="today-heading" className="text-[15px] font-bold text-fg">{f.todayTitle}</h2><p className="text-sm text-slate-500">{f.todayHint}</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-semibold text-amber-800">{todayRows.length}</span></div>
            {todayRows.length ? todayRows.map((row) => <FollowupRow key={row.id} row={row} overdue={false} onLog={logOn ? setLogRow : undefined} />) : <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">{dashOn ? <><CheckCircle2 className="h-5 w-5 text-emerald-600" />{f.todayEmpty}</> : f.dueUnavailable}</div>}
          </section>
          <section className="glass-panel overflow-hidden xl:col-span-2" aria-labelledby="upcoming-heading">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3"><div><h2 id="upcoming-heading" className="text-[15px] font-bold text-fg">{f.upcomingTitle}</h2><p className="text-sm text-slate-500">{f.upcomingHint}</p></div><span className="rounded-full bg-blue-100 px-2.5 py-1 text-sm font-semibold text-crm-blue">{upcoming.length}</span></div>
            {upcoming.length ? <div className="divide-y divide-slate-200/70">{upcoming.map((row) => <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-crm-blue"><Clock3 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><Link to={`/quotes/${row.id}`} className="font-semibold text-brand hover:underline">{row.buyer_name}</Link><div className="text-sm text-slate-500">{row.number ?? f.draft} · {row.products || f.quotation} · {money(row.grand_total, row.currency)}</div></div><div className="text-sm text-slate-600">{date(row.next_followup)}</div><Link to={`/quotes/${row.id}`} aria-label={f.openQuoteAria(row.buyer_name)} className="tap grid place-items-center rounded-lg text-crm-blue hover:bg-forest-50"><ArrowUpRight className="h-5 w-5" /></Link></div>)}</div> : <p className="px-4 py-8 text-sm text-slate-500">{f.upcomingEmpty}</p>}
          </section>
          <section className="glass-panel overflow-hidden xl:col-span-2" aria-labelledby="buyer-actions-heading">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3"><div><h2 id="buyer-actions-heading" className="font-semibold text-crm-ink">{f.buyerTitle}</h2><p className="text-sm text-slate-500">{f.buyerHint}</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-800">{buyerActions.length}</span></div>
            {buyerActions.length ? <div className="divide-y divide-slate-200/70">{buyerActions.map((buyer) => {
              const late = buyer.next_followup! <= today;
              return <div key={buyer.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><span className={late ? 'grid h-10 w-10 place-items-center rounded-xl bg-red-100 text-red-700' : 'grid h-10 w-10 place-items-center rounded-xl bg-surface-muted text-ink-muted'}><Building2 className="h-5 w-5" /></span><div className="min-w-0 flex-1"><Link to={`/buyers/${buyer.id}`} className="font-semibold text-crm-blue hover:underline">{buyer.company_name}</Link><div className="text-sm text-slate-500">{buyer.next_action || f.reviewBuyer}</div></div><div className={late ? 'text-sm font-medium text-red-700' : 'text-sm text-slate-600'}>{date(buyer.next_followup)}</div><Link to={`/buyers/${buyer.id}`} className="tap inline-flex items-center gap-1 rounded-lg px-2 text-sm font-medium text-crm-blue hover:bg-forest-50">{f.openBuyer} <ArrowUpRight className="h-4 w-4" /></Link></div>;
            })}</div> : <p className="px-4 py-8 text-sm text-slate-500">{f.buyerEmpty}</p>}
          </section>
        </div>
      )}
      <LogActivitySheet key={logRow?.id ?? 'none'} open={logRow !== null} onClose={() => setLogRow(null)} quoteId={logRow?.id ?? ''} subtitle={logRow ? `${logRow.buyer_name}, ${logRow.number}` : undefined} />
    </div>
  );
}
