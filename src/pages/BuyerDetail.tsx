/**
 * Buyer profile screen (route /buyers/:id): contact shortcuts, details, the buyer's quotes and their
 * activity timeline.
 * API: GET /buyers/:id (react-query key ['buyer', id]); PATCH /buyers/:id { archived } for archive/restore
 * (invalidates ['buyer', id] and ['buyers']); editing is done by BuyerForm (PATCH /buyers/:id).
 * Composes BuyerForm in a Sheet, StatusBadge, Card, Button. Links to /quotes/new?buyer=<id> and
 * /quotes/:id. SRS: BR-12 (archive instead of delete), FR-15.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Mail, MessageCircle, Phone, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BuyerForm } from '@/components/BuyerForm';
import { BuyerPipelineCard } from '@/components/buyers/BuyerPipelineCard';
import { BuyerSamples } from '@/components/buyers/BuyerSamples';
import { StagePill } from '@/components/buyers/StagePill';
import { Button, Card, EmptyState, ErrorNote, Sheet, Spinner, StatusBadge, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { date, dateTime, digits, money, waLink } from '@/lib/format';
import type { Buyer, BuyerDetail as BuyerDetailData, QuoteListRow } from '@/lib/types';
import { t } from '@/strings';

// Shorthand for the buyers strings.
const s = t.buyers;
// Shorthand for the buyer form strings (reused as labels for the details list).
const f = t.buyerForm;

/**
 * Call / WhatsApp / Email button. A real link when there is a value, otherwise a greyed-out disabled button
 * whose tooltip says what is missing.
 * @param props.href — tel:, wa.me or mailto: URL, or null when the buyer has no such contact.
 * @param props.icon — icon element. @param props.label — button text.
 * @param props.missing — text for the tooltip/aria-label when href is null (e.g. "No phone number").
 * @param props.external — open in a new tab with rel=noopener (used for WhatsApp).
 */
function ContactButton({ href, icon, label, missing, external }: { href: string | null; icon: ReactNode; label: string; missing: string; external?: boolean }) {
  const base = 'tap flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold';
  if (!href) {
    return (
      <button type="button" disabled aria-label={`${label}: ${missing}`} title={missing} className={clsx(base, 'cursor-not-allowed border border-forest-900/15 bg-cream-100 text-forest-900/40')}>
        {icon}{label}
      </button>
    );
  }
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className={clsx(base, 'border border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}>
      {icon}{label}
    </a>
  );
}

/**
 * One label/value pair in the details list; shows a grey "not set" when the value is empty. @param
 * props.label — caption. @param props.value — text (line breaks kept).
 */
function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="whitespace-pre-line break-words text-base text-ink">{value || <span className="text-fg-muted">{s.notSet}</span>}</dd>
    </div>
  );
}

/**
 * One row of the buyer's quote list: number (or "Draft"), status badge, product names and date, grand
 * total. Links to the quote: a draft that was never issued opens the editor (/quotes/:id/edit), everything
 * else opens the detail (/quotes/:id). Shows the quote's base number (quote_no), without the -R suffix of
 * revisions.
 * @param props.q — a QuoteListRow from the buyer's `quotes` list; money is shown with money() (decimal
 *   string, Indian grouping for INR).
 */
function QuoteRow({ q }: { q: QuoteListRow }) {
  // A draft with no quote number has never been issued, so the only useful action is to keep editing it.
  const neverIssued = q.latest_state === 'draft' && !q.quote_no;
  return (
    <li>
      <Link to={neverIssued ? `/quotes/${q.id}/edit` : `/quotes/${q.id}`} className="flex min-h-[56px] items-center gap-3 px-4 py-3 hover:bg-forest-50">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-forest-900">{q.quote_no ?? s.draftLabel}</span>
            <StatusBadge status={q.status} />
          </div>
          <div className="truncate text-sm text-fg-secondary">{[q.products, date(q.activity_at)].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="shrink-0 text-right text-base font-semibold tabular-nums text-forest-900">{money(q.grand_total, q.currency)}</div>
        <ChevronRight className="h-5 w-5 shrink-0 text-forest-800" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * Buyer profile screen (route /buyers/:id).
 * The user sees: Back link, company name with type (and Archived) badge, contact name; Call / WhatsApp /
 * Email buttons; a gold "New quote" button; a details card (address, country/currency/incoterm/port for
 * export or GSTIN/state/state code for domestic, phone, email, notes) with Edit and Archive/Restore; the
 * buyer's quotes; and the activity timeline across all their quotes.
 * Data: GET /buyers/:id, react-query key ['buyer', id] (returns the buyer plus `quotes` and `activities`).
 * Loading -> Spinner; 404 -> "buyer not found" note; other errors -> ErrorNote with Retry.
 * Actions: Call -> tel: link; WhatsApp -> https://wa.me link using the WhatsApp number, falling back to the
 * phone (opens in a new tab); Email -> mailto:; New quote -> /quotes/new?buyer=<id> (the quote form
 * pre-selects the buyer); quote row -> quote screen.
 * Edit: Sheet with BuyerForm (initial = this buyer) -> PATCH /buyers/:id (done inside the form) -> sheet
 * closes and ['buyer', id] is invalidated so the page refreshes.
 * Archive/Restore: asks for confirmation (inline warning with Yes/Keep), then PATCH /buyers/:id { archived
 * } -> invalidates ['buyer', id] and ['buyers'] -> toast. Archived buyers disappear from pickers but all
 * quotes and history stay; buyers cannot be deleted (BR-12). A failure shows an error toast.
 * Local state: editing (edit sheet open), confirming (archive confirmation visible).
 */
export default function BuyerDetail() {
  // Buyer id from the URL (/buyers/:id).
  const { id = '' } = useParams();
  // Used to refresh cached buyer data after changes.
  const qc = useQueryClient();
  // Shows success/error messages.
  const toast = useToast();
  // Whether the Edit sheet is open.
  const [editing, setEditing] = useState(false);
  // Whether the archive/restore confirmation box is showing.
  const [confirming, setConfirming] = useState(false);

  // GET /buyers/:id; only runs when an id exists.
  const query = useQuery({ queryKey: ['buyer', id], queryFn: () => api.get<BuyerDetailData>(`/buyers/${id}`), enabled: !!id });
  // The loaded buyer (with quotes and activities), or undefined while loading.
  const b = query.data;

  // react-query mutation: PATCH /buyers/:id { archived: true|false }. On success refresh this buyer and the
  // lists, hide the confirmation and toast; on error show the message in an error toast. isPending disables
  // the buttons while it runs.
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.patch<Buyer>(`/buyers/${id}`, { archived }),
    onSuccess: async (_r, archived) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['buyer', id] }), qc.invalidateQueries({ queryKey: ['buyers'] })]);
      setConfirming(false);
      toast(archived ? s.archived : s.restored);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : t.common.somethingWrong, 'error'),
  });

  // "Back to buyers" link, reused in the loading/error/normal views.
  const back = (
    <Link to="/buyers" className="tap -ml-2 mb-2 inline-flex items-center gap-1 rounded-lg px-2 text-base font-medium text-forest-800 hover:bg-forest-50">
      <ChevronLeft className="h-5 w-5" aria-hidden />{s.back}
    </Link>
  );

  // Loading.
  if (query.isPending) return <div>{back}<Spinner /></div>;
  // Failed, or no data. A 404 (unknown or malformed id) shows a plain "not found" message without Retry.
  if (query.isError || !b) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return <div>{back}<ErrorNote error={notFound ? new Error(s.notFound) : query.error} onRetry={notFound ? undefined : () => void query.refetch()} /></div>;
  }

  // Split the response: `buyer` (the plain Buyer fields) is what the edit form receives. NB: this object
  // has no quote_count, because only the list endpoint returns it.
  const { quotes, activities, assigned_name: _assigned, performance: _perf, ...buyer } = b;
  // Trimmed phone, or null.
  const phone = b.phone?.trim() || null;
  // WhatsApp number, falling back to the phone number when no WhatsApp number is stored.
  const wa = b.whatsapp?.trim() || phone;
  // Trimmed email, or null.
  const mail = b.email?.trim() || null;
  // Address and city on separate lines (blank parts skipped).
  const location = [b.address, b.city].filter(Boolean).join('\n');

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        {back}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="break-words text-2xl font-bold leading-8 tracking-tight text-ink">{b.company_name}</h1>
          <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', b.type === 'export' ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900')}>{t.common.type[b.type]}</span>
          <StagePill stage={b.stage} />
          {b.marketing_opt_out && <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-900">{t.crm.optedOutBadge}</span>}
          {b.archived && <span className="inline-block rounded-full bg-zinc-300 px-2.5 py-0.5 text-xs font-semibold text-zinc-800">{s.archivedBadge}</span>}
        </div>
        {b.contact_name && <p className="mt-1 text-lg text-fg-secondary">{b.contact_name}</p>}
      </div>

      {b.archived && <p className="rounded-lg bg-zinc-200 p-3 text-base text-zinc-900">{s.archivedNote}</p>}

      <div className="flex gap-2" role="group" aria-label={s.contact}>
        <ContactButton href={phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null} icon={<Phone className="h-5 w-5" aria-hidden />} label={s.call} missing={s.noPhone} />
        <ContactButton href={digits(wa) ? waLink(wa) : null} icon={<MessageCircle className="h-5 w-5" aria-hidden />} label={s.whatsapp} missing={s.noWhatsapp} external />
        <ContactButton href={mail ? `mailto:${mail}` : null} icon={<Mail className="h-5 w-5" aria-hidden />} label={s.email} missing={s.noEmail} />
      </div>

      {/* Starts a new quote for this buyer; the quote form reads ?buyer=<id> to pre-select them. */}
      <Link to={`/quotes/new?buyer=${b.id}`} className="tap flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-base font-semibold text-forest-950 hover:bg-gold-300">
        <Plus className="h-5 w-5" aria-hidden />{s.newQuote}
      </Link>

      {/* Buyer CRM: stage, lead source, what they want, next action; then quote performance */}
      <BuyerPipelineCard b={b} />

      <Card className="p-4">
        <h2 className="mb-3 text-[17px] font-bold leading-6 text-ink">{s.details}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label={f.address} value={location} />
          {b.type === 'export' ? (
            <>
              <Fact label={f.country} value={b.country} />
              <Fact label={f.currency} value={b.default_currency} />
              <Fact label={f.incoterm} value={b.default_incoterm} />
              <Fact label={f.port} value={b.default_port} />
            </>
          ) : (
            <>
              <Fact label={f.gstin} value={b.gstin} />
              <Fact label={f.state} value={b.state} />
              <Fact label={f.stateCode} value={b.state_code} />
            </>
          )}
          <Fact label={f.phone} value={b.phone} />
          <Fact label={f.email} value={b.email} />
          {b.notes && <div className="sm:col-span-2"><Fact label={s.notes} value={b.notes} /></div>}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>{s.edit}</Button>
          {!confirming && <Button variant="secondary" onClick={() => setConfirming(true)}>{b.archived ? s.restore : s.archive}</Button>}
        </div>
        {confirming && (
          <div role="alertdialog" aria-label={b.archived ? s.restoreQuestion : s.archiveQuestion} className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
            <p className="font-semibold text-forest-900">{b.archived ? s.restoreQuestion : s.archiveQuestion}</p>
            <p className="mt-1 text-base text-fg-secondary">{b.archived ? s.restoreExplain : s.archiveExplain}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button variant={b.archived ? 'primary' : 'danger'} className="flex-1" loading={archive.isPending} onClick={() => archive.mutate(!b.archived)}>
                {b.archived ? s.restoreYes : s.archiveYes}
              </Button>
              <Button variant="secondary" className="flex-1" disabled={archive.isPending} onClick={() => setConfirming(false)}>{s.keep}</Button>
            </div>
          </div>
        )}
        <p className="mt-3 text-sm text-fg-muted">{s.noDeleteNote}</p>
      </Card>

      <Card>
        <h2 className="px-4 pt-4 text-[17px] font-bold leading-6 text-ink">{s.quotesTitle}</h2>
        {quotes.length === 0 ? <EmptyState title={s.noQuotes} /> : <ul className="mt-2 divide-y divide-cream-200 pb-2">{quotes.map((q) => <QuoteRow key={q.id} q={q} />)}</ul>}
      </Card>

      <BuyerSamples buyerId={b.id} />

      <Card className="p-4">
        <h2 className="mb-3 text-[17px] font-bold leading-6 text-ink">{s.activityTitle}</h2>
        {activities.length === 0 ? <p className="text-base text-fg-muted">{s.noActivity}</p> : (
          <ol className="space-y-3">
            {activities.map((a) => (
              <li key={a.id} className="border-l-2 border-gold-500 pl-3">
                <div className="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
                  <span className="font-semibold text-forest-900">{t.common.activityKind[a.kind]}</span>
                  <span>{dateTime(a.happened_at)}</span>
                  {a.user_name && <span>{s.by} {a.user_name}</span>}
                  {a.quote_id && a.quote_no && <Link to={`/quotes/${a.quote_id}`} className="font-semibold text-forest-800 underline">{a.quote_no}</Link>}
                </div>
                {a.body && <p className="mt-0.5 whitespace-pre-line break-words text-base text-ink">{a.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/*
      Edit sheet: the form saves itself with PATCH /buyers/:id; onSaved just closes it and refreshes
      this page's data.
      */}
      <Sheet wide open={editing} onClose={() => setEditing(false)} title={f.editTitle}>
        <BuyerForm
          initial={buyer}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); void qc.invalidateQueries({ queryKey: ['buyer', id] }); }}
        />
      </Sheet>
    </div>
  );
}
