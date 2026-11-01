/**
 * The "Samples" card of the buyer page (pages/BuyerDetail.tsx): this buyer's samples with their status and result, each linking to the
 * sample, and a button to record a new one for this buyer. API: GET /samples?buyer_id=<id> (key ['samples', opts]).
 */
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SampleResultPill, SampleStatusPill } from '@/components/samples/SamplePills';
import { Card, EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { date } from '@/lib/format';
import { useSamples } from '@/lib/hooks';
import { t } from '@/strings';

const s = t.samples;

export function BuyerSamples({ buyerId }: { buyerId: string }) {
  const query = useSamples({ buyer_id: buyerId, archived: 'false' });
  const rows = query.data ?? [];
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <h2 className="text-[17px] font-bold leading-6 text-ink">{s.buyerSection.title}</h2>
        <Link to={`/samples/new?buyer=${buyerId}`} className="tap inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-hover"><Plus className="h-4 w-4" aria-hidden />{s.buyerSection.add}</Link>
      </div>
      {query.isPending ? <Spinner label={s.loading} /> : query.isError ? <div className="p-4"><ErrorNote error={query.error} onRetry={() => void query.refetch()} /></div> : rows.length === 0 ? <EmptyState title={s.buyerSection.none} /> : (
        <ul className="mt-2 divide-y divide-line pb-2">{rows.map((x) => <li key={x.id}>
          <Link to={`/samples/${x.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-hover">
            <span><span className="font-mono text-xs font-semibold text-slate-600">{x.sample_code}</span> <span className="font-semibold text-ink">{x.product_name}</span> <span className="text-sm text-slate-600">· {s.grams(x.weight_g)} · {date(x.requested_at)}</span></span>
            <span className="flex gap-1.5"><SampleStatusPill status={x.status} /><SampleResultPill result={x.result} /></span>
          </Link></li>)}</ul>
      )}
    </Card>
  );
}
