import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorNote, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import type { QuoteList } from '@/lib/types';
import { t } from '@/strings';

const o = t.orders;

/** Won quotations are the current source for handoff; fulfillment state is not stored by this app yet. */
export default function Orders() {
  const query = useQuery({ queryKey: ['orders', 'won-quotes'], queryFn: () => api.get<QuoteList>('/quotes?status=won&limit=100') });
  return (
    <div>
      <PageHeader title={o.title} subtitle={o.subtitle} />
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-crm-blue">
        <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-crm-blue" />
        <p>{o.note}</p>
      </div>
      {query.data && query.data.total > query.data.data.length && <p role="status" className="mb-4 rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">{t.common.listTruncated(query.data.data.length, query.data.total)}</p>}
      {query.isPending ? <Spinner /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : query.data?.data.length ? (
        <div className="glass-panel overflow-hidden bg-surface">
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-slate-500"><tr>
              <th className="px-4 py-3 font-medium">{o.colQuote}</th><th className="px-4 py-3 font-medium">{o.colBuyer}</th><th className="px-4 py-3 font-medium">{o.colProducts}</th><th className="px-4 py-3 font-medium">{o.colValue}</th><th className="px-4 py-3 font-medium">{o.colOutcome}</th><th className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-slate-200/80">{query.data.data.map((row) => <tr key={row.id} className="hover:bg-forest-50">
              <td className="px-4 py-3 font-medium text-crm-blue">{row.number ?? row.quote_no ?? o.wonQuote}</td>
              <td className="px-4 py-3 font-semibold text-slate-800">{row.buyer_name}</td>
              <td className="max-w-[240px] truncate px-4 py-3 text-slate-600">{row.products || '—'}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{money(row.grand_total, row.currency)}</td>
              <td className="px-4 py-3"><StatusBadge status={row.status} /><span className="mt-1 block text-xs text-slate-500">{date(row.activity_at)}</span></td>
              <td className="px-4 py-3"><Link to={`/quotes/${row.id}`} aria-label={o.openAria(row.buyer_name)} className="tap grid place-items-center rounded-lg text-crm-blue hover:bg-forest-50"><ArrowUpRight className="h-5 w-5" /></Link></td>
            </tr>)}</tbody>
          </table></div>
        </div>
      ) : <div className="glass-panel px-4 py-12 text-center text-sm text-slate-500">{o.empty}</div>}
    </div>
  );
}
