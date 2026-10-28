import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ErrorNote, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import type { QuoteList } from '@/lib/types';

/** Won quotations are the current source for handoff; fulfillment state is not stored by this app yet. */
export default function Orders() {
  const query = useQuery({ queryKey: ['orders', 'won-quotes'], queryFn: () => api.get<QuoteList>('/quotes?status=won&limit=100') });
  return (
    <div>
      <PageHeader title="Orders" subtitle="Won business ready for order handoff." />
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
        <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
        <p>This list is based on won quotations. Order fulfillment and shipment statuses are not stored in the current CRM yet.</p>
      </div>
      {query.isPending ? <Spinner /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : query.data?.data.length ? (
        <div className="glass-panel overflow-hidden bg-white/80">
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-white/80 text-xs uppercase tracking-wide text-slate-500"><tr>
              <th className="px-4 py-3 font-medium">Winning quote</th><th className="px-4 py-3 font-medium">Buyer</th><th className="px-4 py-3 font-medium">Products</th><th className="px-4 py-3 font-medium">Value</th><th className="px-4 py-3 font-medium">Outcome</th><th className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-slate-200/80">{query.data.data.map((row) => <tr key={row.id} className="hover:bg-blue-50/40">
              <td className="px-4 py-3 font-medium text-crm-blue">{row.number ?? row.quote_no ?? 'Won quote'}</td>
              <td className="px-4 py-3 font-semibold text-slate-800">{row.buyer_name}</td>
              <td className="max-w-[240px] truncate px-4 py-3 text-slate-600">{row.products || '—'}</td>
              <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{money(row.grand_total, row.currency)}</td>
              <td className="px-4 py-3"><StatusBadge status={row.status} /><span className="mt-1 block text-xs text-slate-500">{date(row.activity_at)}</span></td>
              <td className="px-4 py-3"><Link to={`/quotes/${row.id}`} aria-label={`Open winning quotation for ${row.buyer_name}`} className="tap grid place-items-center rounded-lg text-blue-700 hover:bg-blue-50"><ArrowUpRight className="h-5 w-5" /></Link></td>
            </tr>)}</tbody>
          </table></div>
        </div>
      ) : <div className="glass-panel px-4 py-12 text-center text-sm text-slate-500">No won quotations are ready for handoff.</div>}
    </div>
  );
}
