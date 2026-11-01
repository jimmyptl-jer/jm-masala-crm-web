/**
 * One sample: /samples/:id. Shows the sample, its dispatch details, the buyer's feedback and internal notes (and the cost, for an
 * administrator), with buttons to edit and archive / restore. API: GET /samples/:id (key ['sample', id]), PATCH /samples/:id
 * (archive / restore); every change invalidates ['samples'].
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronLeft, Pencil, RotateCcw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { SampleResultPill, SampleStatusPill } from '@/components/samples/SamplePills';
import { Button, ErrorNote, PageHeader, Spinner, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { date } from '@/lib/format';
import type { SampleDetail as SampleDetailData } from '@/lib/samples';
import { t } from '@/strings';

const s = t.samples;
const d = s.detail;

const Fact = ({ label, value }: { label: string; value?: string | null }) => <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{value || '—'}</dd></div>;

export default function SampleDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ['sample', id], queryFn: () => api.get<SampleDetailData>(`/samples/${id}`), enabled: !!id });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.patch(`/samples/${id}`, { archived }),
    onSuccess: async (_r, archived) => { await qc.invalidateQueries({ queryKey: ['samples'] }); await qc.invalidateQueries({ queryKey: ['sample', id] }); toast(archived ? s.form.archived : s.form.restored); },
  });
  const back = <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-600"><Link to="/samples" className="inline-flex items-center gap-1 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />{d.back}</Link></nav>;
  if (query.isPending) return <div className="space-y-4">{back}<Spinner /></div>;
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return <div className="space-y-4">{back}<ErrorNote error={notFound ? new Error(d.notFound) : query.error} onRetry={notFound ? undefined : () => void query.refetch()} /></div>;
  }
  const x = query.data;
  return (
    <div className="space-y-4">
      {back}
      <PageHeader title={`${x.sample_code} · ${x.buyer_name}`} subtitle={`${d.requested} ${date(x.requested_at)}`} actions={<div className="flex flex-wrap gap-2">
        <Link to={`/samples/${x.id}/edit`} className="tap inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover"><Pencil className="h-4 w-4" />{s.actions.edit}</Link>
        <Button variant="secondary" loading={archive.isPending} onClick={() => archive.mutate(!x.archived)}>{x.archived ? <><RotateCcw className="h-4 w-4" />{s.actions.restore}</> : <><Archive className="h-4 w-4" />{s.actions.archive}</>}</Button>
      </div>} />
      {x.archived && <p className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">{d.archivedNote}</p>}
      {archive.isError && <ErrorNote error={archive.error} />}

      <section className="glass-panel p-4 md:p-5" aria-label={d.overview}>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs font-medium text-slate-500">{s.cols.status}</dt><dd className="mt-1"><SampleStatusPill status={x.status} /></dd></div>
          <div><dt className="text-xs font-medium text-slate-500">{s.cols.result}</dt><dd className="mt-1"><SampleResultPill result={x.result} /></dd></div>
          <Fact label={s.cols.owner} value={x.assigned_name ?? s.unassigned} />
          <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{s.filters.buyer}</dt><dd className="mt-1 text-sm font-medium"><Link to={`/buyers/${x.buyer_id}`} className="text-crm-blue hover:underline">{x.buyer_name}</Link></dd></div>
        </dl>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-panel p-4 md:p-5" aria-label={d.sample}>
          <h2 className="mb-3 text-sm font-semibold text-ink">{d.sample}</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label={s.cols.product} value={x.product_name} /><Fact label={s.form.grade} value={x.grade} />
            <Fact label={s.cols.weight} value={s.grams(x.weight_g)} />
            {x.cost_inr !== undefined && <Fact label={s.cols.cost} value={x.cost_inr ? `₹${Number(x.cost_inr).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : null} />}
          </dl>
        </section>
        <section className="glass-panel p-4 md:p-5" aria-label={d.dispatch}>
          <h2 className="mb-3 text-sm font-semibold text-ink">{d.dispatch}</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label={s.cols.sent} value={x.sent_at ? date(x.sent_at) : null} /><Fact label={s.form.courier} value={x.courier} />
            <Fact label={s.form.tracking} value={x.tracking_no} />
          </dl>
        </section>
      </div>

      <section className="glass-panel p-4 md:p-5">
        <h2 className="mb-2 text-sm font-semibold text-ink">{d.feedback}</h2>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{x.feedback || d.noFeedback}</p>
        <h2 className="mb-2 mt-5 text-sm font-semibold text-ink">{d.notes}</h2>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{x.notes || d.noNotes}</p>
      </section>
    </div>
  );
}
