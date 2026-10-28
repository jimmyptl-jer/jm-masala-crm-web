/**
 * Marketing > Campaigns: the campaign history. Each campaign shows its status, how many e-mails were sent / failed, how many
 * buyers replied and the date; tapping one opens its report (pages/CampaignDetail.tsx), a draft opens in the composer.
 * "New campaign" starts the composer (pages/CampaignNew.tsx).
 * API: GET /marketing/campaigns (useCampaigns, key ['marketing', 'campaigns']); refreshes every 4 s while a campaign is sending.
 * Used by pages/Marketing.tsx.
 */
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmailOffNote, StatusPill } from '@/components/marketing/shared';
import { RouterButton } from '@/components/quote/shared';
import { Card, EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { readable } from '@/lib/marketing';
import type { CampaignListRow } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;

/** The Campaigns tab; see the file comment. */
export function CampaignsTab() {
  // not useCampaigns(): this list polls while anything is sending, so a running campaign's counts move on their own
  const q = useQuery({
    queryKey: ['marketing', 'campaigns'],
    queryFn: () => api.get<{ data: CampaignListRow[] }>('/marketing/campaigns').then((r) => r.data),
    refetchInterval: (query) => (query.state.data?.some((c) => c.status === 'sending') ? 4000 : false),
  });
  const rows = q.data ?? [];

  return (
    <div className="space-y-3">
      <EmailOffNote />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-bold leading-6 text-ink">{m.campaignsHeading}</h2>
          <p className="text-sm text-fg-muted">{m.campaignsHint}</p>
        </div>
        <RouterButton to="/marketing/campaigns/new"><Plus className="h-5 w-5" aria-hidden />{m.newCampaign}</RouterButton>
      </div>

      {q.isPending ? <Spinner /> : q.isError ? <ErrorNote error={q.error} onRetry={() => void q.refetch()} /> : rows.length === 0 ? (
        <Card><EmptyState title={m.campaignsEmpty}>{m.campaignsEmptyHint}</EmptyState></Card>
      ) : (
        <ul className="grid gap-2 xl:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link to={c.status === 'draft' ? `/marketing/campaigns/${c.id}/edit` : `/marketing/campaigns/${c.id}`} className="card block px-4 py-3 hover:bg-forest-50">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words text-lg font-semibold text-forest-900">{c.name}</span>
                  <StatusPill status={c.status} />
                </div>
                <div className="truncate text-sm text-fg-secondary">{readable(c.subject)}</div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-fg-secondary">
                  {c.status === 'draft' ? <span>{dateTime(c.created_at)}</span> : (
                    <>
                      <span>{c.status === 'sending' ? m.progress(c.sent + c.failed + c.skipped, c.total) : `${m.colSent} ${c.sent}`}</span>
                      {c.failed > 0 && <span className="font-semibold text-red-700">{m.colFailed} {c.failed}</span>}
                      <span>{m.colReplied} {c.replied}</span>
                      <span className="text-fg-muted">{dateTime(c.started_at ?? c.created_at)}</span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
