/**
 * Campaign report (route /marketing/campaigns/:id): how one campaign went. Shows its status, the numbers (recipients, sent,
 * failed, replied), the quotations issued to the recipients since the send began (with their value per currency), and every
 * recipient with the result of their e-mail (sent / failed with the reason / waiting / skipped) and a "Replied" tick you set by
 * hand when a buyer answers.
 * API: GET /marketing/campaigns/:id (key ['marketing', 'campaign', id], refreshed every 3 s while the campaign is sending);
 * PATCH /marketing/recipients/:id ({ replied }). A draft campaign opens the composer instead.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StatusPill } from '@/components/marketing/shared';
import { Card, ErrorNote, Spinner, errorMessage, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { readable } from '@/lib/marketing';
import type { CampaignReport } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;

/** One number card. */
function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="card p-3">
      <div className={`text-3xl font-bold tabular-nums ${tone ?? 'text-forest-900'}`}>{value}</div>
      <div className="text-sm text-fg-secondary">{label}</div>
    </div>
  );
}

/** Route component; see the file comment. */
export default function CampaignDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['marketing', 'campaign', id],
    queryFn: () => api.get<CampaignReport>(`/marketing/campaigns/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.campaign.status === 'sending' ? 3000 : false),
  });
  const r = q.data;
  const reply = useMutation({
    mutationFn: (v: { id: string; replied: boolean }) => api.patch(`/marketing/recipients/${v.id}`, { replied: v.replied }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['marketing', 'campaign', id] }); void qc.invalidateQueries({ queryKey: ['marketing', 'campaigns'] }); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  // a draft is not a report: open it in the composer
  useEffect(() => { if (r?.campaign.status === 'draft') navigate(`/marketing/campaigns/${id}/edit`, { replace: true }); }, [r, id, navigate]);

  const back = (
    <Link to="/marketing?tab=campaigns" className="tap -ml-2 mb-1 inline-flex items-center gap-1 rounded-lg px-2 text-base font-medium text-forest-800 hover:bg-forest-50">
      <ChevronLeft className="h-5 w-5" aria-hidden />{m.reportBack}
    </Link>
  );
  if (q.isPending) return <div>{back}<Spinner /></div>;
  if (q.isError || !r) {
    const gone = q.error instanceof ApiError && q.error.status === 404;
    return <div>{back}<ErrorNote error={gone ? new Error('This campaign could not be found.') : q.error} onRetry={gone ? undefined : () => void q.refetch()} /></div>;
  }

  const { campaign: c, totals: tt, attribution } = r;
  const done = tt.sent + tt.failed + tt.skipped;

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-8">
      <div>
        {back}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 break-words text-2xl font-bold leading-8 tracking-tight text-ink">{c.name}</h1>
          <StatusPill status={c.status} />
        </div>
        <p className="mt-1 text-base text-fg-secondary">{readable(c.subject)}</p>
        {c.started_at && <p className="text-sm text-fg-muted">{dateTime(c.started_at)}</p>}
      </div>

      {c.status === 'sending' && (
        <div role="status" className="rounded-lg bg-amber-50 p-3 text-amber-900">
          <p className="font-semibold">{m.progress(done, tt.total)}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-200"><div className="h-full bg-amber-600 transition-all" style={{ width: `${tt.total ? Math.round((done / tt.total) * 100) : 0}%` }} /></div>
          <p className="mt-1 text-sm">{m.reportWorking}</p>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={m.reportRecipients} value={tt.total} />
        <Stat label={m.reportSent} value={tt.sent} tone="text-emerald-800" />
        <Stat label={m.reportFailed} value={tt.failed} tone={tt.failed ? 'text-red-700' : undefined} />
        <Stat label={m.reportReplied} value={tt.replied} tone="text-sky-800" />
      </section>

      <Card className="p-4">
        <h2 className="text-[17px] font-bold leading-6 text-ink">{m.reportQuotes}: {attribution.quotes_created}</h2>
        <p className="mb-2 text-sm text-fg-muted">{m.reportQuotesHint}</p>
        {attribution.by_currency.length > 0 && (
          <table className="text-left text-base">
            <thead><tr className="text-sm text-fg-muted"><th className="pr-6 font-normal" /><th className="pr-6 font-normal">{m.reportQuoted}</th><th className="font-normal">{m.reportWon}</th></tr></thead>
            <tbody>
              {attribution.by_currency.map((x) => (
                <tr key={x.currency} className="border-t border-cream-200">
                  <th className="py-1 pr-6 font-medium">{x.currency}</th>
                  <td className="py-1 pr-6 tabular-nums">{money(x.quoted, x.currency)}</td>
                  <td className="py-1 tabular-nums">{money(x.won, x.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-[17px] font-bold leading-6 text-ink">{m.reportRecipients}</h2>
        <p className="mb-2 text-sm text-fg-muted">{m.reportReplyHint}</p>
        <ul className="divide-y divide-cream-200">
          {r.recipients.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              <div className="min-w-0 flex-1 basis-56">
                <Link to={`/buyers/${x.buyer_id}`} className="break-words font-semibold text-forest-900 underline-offset-2 hover:underline">{x.company_name}</Link>
                <div className="truncate text-sm text-fg-muted">{x.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={x.status} recipient />
                {x.sent_at && <span className="text-xs text-fg-muted">{dateTime(x.sent_at)}</span>}
              </div>
              {x.error && <p className="basis-full text-sm text-red-700">{x.error}</p>}
              <label className="tap flex items-center gap-2 text-sm text-forest-900">
                <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={x.replied} disabled={x.status !== 'sent' || reply.isPending} onChange={(e) => reply.mutate({ id: x.id, replied: e.target.checked })} />
                {m.reportReplyTick}
              </label>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
