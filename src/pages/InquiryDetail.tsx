/**
 * One inquiry: /inquiries/:id. Shows what was asked for (every product line), the trade details, the buyer's own message, internal notes
 * and the quotations made from it, with buttons to edit, archive / restore and create a quotation. API: GET /inquiries/:id (key
 * ['inquiry', id]), PATCH /inquiries/:id (archive / restore); every change invalidates ['inquiries'].
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronLeft, FilePlus2, Pencil, RotateCcw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { InquiryStatusPill } from '@/components/inquiries/InquiryStatusPill';
import { Button, ErrorNote, PageHeader, Spinner, StatusBadge, errorMessage, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import type { InquiryDetail as InquiryDetailData } from '@/lib/types';
import { t } from '@/strings';

const s = t.inquiries;
const d = s.detail;

const Fact = ({ label, value }: { label: string; value?: string | null }) => <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{value || '—'}</dd></div>;

export default function InquiryDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ['inquiry', id], queryFn: () => api.get<InquiryDetailData>(`/inquiries/${id}`), enabled: !!id });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.patch(`/inquiries/${id}`, { archived }),
    onSuccess: async (_r, archived) => { await qc.invalidateQueries({ queryKey: ['inquiries'] }); await qc.invalidateQueries({ queryKey: ['inquiry', id] }); toast(archived ? s.form.archived : s.form.restored); },
    onError: (e) => toast(errorMessage(e) || t.common.saveFailed, 'error'),
  });
  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorNote error={query.error} onRetry={() => void query.refetch()} />;
  const i = query.data;
  const quoteLink = `/quotes/new?buyer=${i.buyer_id}&inquiry=${i.id}`;
  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-600"><Link to="/inquiries" className="inline-flex items-center gap-1 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />{d.back}</Link></nav>
      <PageHeader title={`${i.inquiry_code} · ${i.buyer_name}`} subtitle={`${d.received} ${date(i.inquiry_date)}`} actions={<div className="flex flex-wrap gap-2">
        <Link to={`/inquiries/${i.id}/edit`} className="tap inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-hover"><Pencil className="h-4 w-4" />{s.actions.edit}</Link>
        <Button variant="secondary" loading={archive.isPending} onClick={() => archive.mutate(!i.archived)}>{i.archived ? <><RotateCcw className="h-4 w-4" />{s.actions.restore}</> : <><Archive className="h-4 w-4" />{s.actions.archive}</>}</Button>
        <Link to={quoteLink} className="tap inline-flex items-center gap-2 rounded-lg bg-paprika px-4 text-sm font-semibold text-white hover:bg-paprika-700"><FilePlus2 className="h-4 w-4" />{d.createQuote}</Link>
      </div>} />
      {i.archived && <p className="rounded-xl border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">{d.archivedNote}</p>}
      {archive.isError && <ErrorNote error={archive.error} />}

      <section className="glass-panel p-4 md:p-5" aria-label={d.overview}>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs font-medium text-slate-500">{s.cols.status}</dt><dd className="mt-1"><InquiryStatusPill status={i.status} /></dd></div>
          <Fact label={s.cols.owner} value={i.assigned_name ?? s.unassigned} />
          <Fact label={s.cols.followup} value={i.next_followup ? date(i.next_followup) : null} />
          <Fact label={s.cols.source} value={i.source ? s.source[i.source] : null} />
          <div className="min-w-0"><dt className="text-xs font-medium text-slate-500">{s.filters.buyer}</dt><dd className="mt-1 text-sm font-medium"><Link to={`/buyers/${i.buyer_id}`} className="text-crm-blue hover:underline">{i.buyer_name}</Link></dd></div>
        </dl>
      </section>

      <section className="glass-panel overflow-hidden" aria-label={d.products}>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink md:px-5">{d.products}</h2>
        <div className="overflow-x-auto"><table className="rt w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2 font-medium">{s.form.product}</th><th className="px-3 py-2 font-medium">{s.form.grade}</th><th className="px-3 py-2 font-medium">{s.form.purity}</th><th className="px-3 py-2 text-right font-medium">{s.form.quantity}</th><th className="px-3 py-2 font-medium">{s.form.packaging}</th><th className="px-3 py-2 font-medium">{s.form.specifications}</th></tr></thead>
          <tbody className="divide-y divide-line">{i.products.map((l, n) => <tr key={n}>
            <td className="px-4 py-2.5 font-semibold text-ink">{l.product_name}</td><td className="px-3 py-2.5 text-slate-600">{l.grade || '—'}</td><td className="px-3 py-2.5 text-slate-600">{l.purity || '—'}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-800">{l.quantity} {l.unit}</td><td className="px-3 py-2.5 text-slate-600">{l.packaging || '—'}</td><td className="px-3 py-2.5 text-slate-600">{l.specifications || '—'}</td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-panel p-4 md:p-5" aria-label={d.trade}>
          <h2 className="mb-3 text-sm font-semibold text-ink">{d.trade}</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label={s.form.country} value={i.destination_country} /><Fact label={s.form.port} value={i.destination_port} />
            <Fact label={s.form.incoterm} value={i.incoterm} /><Fact label={s.form.currency} value={i.currency} />
          </dl>
        </section>
        <section className="glass-panel p-4 md:p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink">{d.message}</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{i.original_message || d.noMessage}</p>
          <h2 className="mb-2 mt-5 text-sm font-semibold text-ink">{d.notes}</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{i.notes || d.noNotes}</p>
        </section>
      </div>

      <section className="glass-panel overflow-hidden" aria-label={d.quotes}>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink md:px-5">{d.quotes}</h2>
        {i.quotes.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500 md:px-5">{d.noQuotes}</p> : <ul className="divide-y divide-line">{i.quotes.map((q) => <li key={q.id}>
          <Link to={`/quotes/${q.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-hover md:px-5">
            <span className="font-semibold text-crm-blue">{q.number ?? q.quote_no ?? 'Draft'}</span><span className="text-sm text-slate-600">{q.products || '—'}</span>
            <span className="tabular-nums text-sm text-slate-700">{money(q.grand_total, q.currency)}</span><StatusBadge status={q.status} />
          </Link></li>)}</ul>}
      </section>
    </div>
  );
}
