/**
 * Buyers list screen (route /buyers): search, filter by type, show archived, add a buyer.
 * API: GET /buyers via useBuyers (react-query key ['buyers', { q, type, archived }]); creating a buyer is
 * done by BuyerForm (POST /buyers, invalidates ['buyers']).
 * The Buyer CRM numbers, pipeline board and sales-by-channel report live on the Marketing tab (pages/Marketing.tsx).
 * Buyer CRM: filter by pipeline stage and lead channel, "follow-ups due today"; each card shows the stage, qualified
 * badge, channel / lead source and the next action with its date (red when overdue).
 * Links to /buyers/:id (pages/BuyerDetail.tsx). Composes PageHeader, Input, Segmented, Sheet, BuyerForm,
 * Card, EmptyState, Spinner, ErrorNote.
 * Everyone can add and edit buyers; buyers can only be archived, never deleted (BR-12).
 */

import clsx from 'clsx';
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BuyerForm } from '@/components/BuyerForm';
import { StagePill } from '@/components/buyers/StagePill';
import { Button, Card, EmptyState, ErrorNote, Input, PageHeader, Segmented, Select, Sheet, Spinner } from '@/components/ui';
import { CHANNELS, STAGES } from '@/lib/crm';
import { date } from '@/lib/format';
import { useBuyers, useDebounced } from '@/lib/hooks';
import type { Buyer, Channel, QuoteType, Stage } from '@/lib/types';
import { t } from '@/strings';

// Shorthand for the buyers strings.
const s = t.buyers;

/** Small pill saying Export (blue) or Domestic (amber). @param props.type — the buyer type. */
function TypeBadge({ type }: { type: QuoteType }) {
  return (
    <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', type === 'export' ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900')}>
      {t.common.type[type]}
    </span>
  );
}

/** Today's date as 'YYYY-MM-DD' in India time, to compare with a buyer's next follow-up date (also a date string). */
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * Short location text for a buyer row: city plus country (export) or state (domestic), e.g. 'Dubai, UAE';
 * skips missing parts. @param b — the buyer.
 */
const place = (b: Buyer) => [b.city, b.type === 'export' ? b.country : b.state].filter(Boolean).join(', ');

/**
 * Buyers list screen (route /buyers).
 * The user sees: title with an "Add buyer" button, a search box, an All/Export/Domestic filter, a "show
 * archived" checkbox and a list of buyer cards (company, type badge, contact, place, number of quotes, an
 * Archived badge). Tapping a card opens /buyers/:id (BuyerDetail).
 * Data: useBuyers({ q, type, archived }) -> GET /buyers, react-query key ['buyers', opts]. The search text
 * is debounced 300 ms so typing does not send a request per key. "Show archived" requests archived=all
 * (active AND archived together); unchecked requests only active buyers.
 * Add buyer: opens a Sheet with BuyerForm; on save it closes and navigates to the new buyer's page
 * (BuyerForm already invalidated ['buyers']).
 * Empty states: no buyers at all (with a hint to add one) vs no match for the current search/filter.
 * Loading -> Spinner; error -> ErrorNote with Retry.
 * Local state: q (search text), type ('all' | 'export' | 'domestic'), showArchived, adding (sheet open).
 */
export default function Buyers() {
  // Used to open the new buyer's page after it is created.
  const navigate = useNavigate();
  // Search box text (immediate).
  const [q, setQ] = useState('');
  // Type filter.
  const [type, setType] = useState<'all' | QuoteType>('all');
  // Whether archived buyers are included.
  const [showArchived, setShowArchived] = useState(false);
  // Buyer CRM filters: pipeline stage, lead channel, and "follow-up due today or earlier".
  const [stage, setStage] = useState<'' | Stage>('');
  const [channel, setChannel] = useState<'' | Channel>('');
  const [due, setDue] = useState(false);
  // Whether the Add buyer sheet is open.
  const [adding, setAdding] = useState(false);
  // Search text after trimming and a 300 ms pause; this is what is sent to the API.
  const dq = useDebounced(q.trim(), 300);

  // GET /buyers with the current filters; '' and 'all' are turned into 'not sent' by qs().
  const query = useBuyers({ q: dq || undefined, type: type === 'all' ? undefined : type, archived: showArchived ? 'all' : 'false', stage: stage || undefined, channel: channel || undefined, due: due ? '1' : undefined });
  // Buyers to show (empty array while loading).
  const rows = query.data ?? [];
  // True when a search or type filter is active; picks the right empty-state text.
  const filtering = !!dq || type !== 'all' || !!stage || !!channel || due;

  return (
    <div>
      <PageHeader title={s.title} actions={<Button onClick={() => setAdding(true)}><Plus className="h-5 w-5" aria-hidden />{s.add}</Button>} />

      <div className="space-y-2">
        <Input label={s.searchLabel} type="search" inputMode="search" placeholder={s.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <Segmented<'all' | QuoteType> label={s.filterLabel} value={type} onChange={setType}
          options={[{ value: 'all', label: s.filterAll }, { value: 'export', label: t.common.type.export }, { value: 'domestic', label: t.common.type.domestic }]} />
        <div className="grid grid-cols-2 gap-3">
          <Select label={t.crm.filterStage} value={stage} onChange={(e) => setStage(e.target.value as '' | Stage)}>
            <option value="">{t.crm.allStages}</option>
            {STAGES.map((x) => <option key={x} value={x}>{t.crm.stages[x]}</option>)}
          </Select>
          <Select label={t.crm.filterChannel} value={channel} onChange={(e) => setChannel(e.target.value as '' | Channel)}>
            <option value="">{t.crm.allChannels}</option>
            {CHANNELS.map((x) => <option key={x} value={x}>{t.crm.channels[x]}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap gap-x-6">
        <label className="tap flex items-center gap-3 text-base text-forest-900">
          <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={due} onChange={(e) => setDue(e.target.checked)} />
          {t.crm.followupsDue}
        </label>
        <label className="tap flex items-center gap-3 text-base text-forest-900">
          <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {s.showArchived}
        </label>
        </div>
      </div>

      <div className="mt-4">
        {query.isPending ? <Spinner /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : rows.length === 0 ? (
          <Card><EmptyState title={filtering || showArchived ? s.noMatch : s.empty}>{!filtering && !showArchived && s.emptyHint}</EmptyState></Card>
        ) : (
          <ul className="grid gap-2 xl:grid-cols-2">
            {rows.map((b) => (
              <li key={b.id}>
                <Link to={`/buyers/${b.id}`} className="card flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-forest-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-words text-lg font-semibold text-forest-900">{b.company_name}</span>
                      <TypeBadge type={b.type} />
                      <StagePill stage={b.stage} />
                      {b.qualified && b.stage !== 'won' && <span className="inline-block rounded-full bg-forest-50 px-2.5 py-0.5 text-xs font-semibold text-forest-800">{t.crm.qualifiedBadge}</span>}
                      {b.archived && <span className="inline-block rounded-full bg-zinc-300 px-2.5 py-0.5 text-xs font-semibold text-zinc-800">{s.archivedBadge}</span>}
                    </div>
                    {b.contact_name && <div className="truncate text-base text-ink/80">{b.contact_name}</div>}
                    <div className="text-sm text-ink/60">{[place(b), s.quoteCount(b.quote_count ?? 0), b.channel && t.crm.channels[b.channel], b.lead_source].filter(Boolean).join(' · ')}</div>
                    {(b.next_action || b.next_followup) && (
                      <div className={clsx('text-sm', b.next_followup && b.next_followup <= todayIso() ? 'font-semibold text-red-700' : 'text-forest-800')}>
                        {[b.next_action, b.next_followup && (b.next_followup <= todayIso() ? t.crm.followupOverdue(date(b.next_followup)) : t.crm.followupOn(date(b.next_followup)))].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-forest-800" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet wide open={adding} onClose={() => setAdding(false)} title={t.buyerForm.newTitle}>
        <BuyerForm onCancel={() => setAdding(false)} onSaved={(b) => { setAdding(false); navigate(`/buyers/${b.id}`); }} />
      </Sheet>
    </div>
  );
}
