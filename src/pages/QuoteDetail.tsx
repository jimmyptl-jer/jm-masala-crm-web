/**
 * Quote detail screen, route `/quotes/:id` (see web/src/router.tsx). Shows one quote with all its revisions.
 *
 * API: GET /quotes/:id (key ['quote', id]); POST /quotes/:id/revise; PATCH /quotes/:id/followup;
 * DELETE /quotes/:id; GET /quotes/:id/revisions/:rev/pdf?json=1 (signed PDF link, key ['pdf', id, rev]).
 * Status change, duplicate, activity log, share and PDF retry are done by the child components below, which
 * call PATCH /quotes/:id/status, POST /quotes/:id/duplicate, POST /quotes/:id/activities and
 * POST /quotes/:id/revisions/:rev/render. After any change the caches ['quote', id], ['quotes'] and
 * ['dashboard'] are invalidated (useInvalidateQuote).
 * Composes: RevisionTabs, RevisionView, PdfPanel, ActivityTimeline, StatusSheet, DuplicateSheet,
 * LogActivitySheet, ShareSheet, FollowupPicker and the generic Sheet.
 * Implements the quote lifecycle UI: BR-02 (revisions), BR-03 (issued = read-only), BR-05 (status flow),
 * BR-07 (follow-up) and BR-12 (only drafts can be deleted). See docs/QUOTE-LIFECYCLE.md.
 */
import clsx from 'clsx';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, MoreHorizontal, Pencil, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { hasRoute, PROBE_ID } from '@/lib/config';
import { date, todayIST } from '@/lib/format';
import type { QuoteDetail as QuoteDetailT } from '@/lib/types';
import { Button, Card, EmptyState, ErrorNote, Sheet, Spinner, StatusBadge, errorMessage, useToast } from '@/components/ui';
import { ActivityTimeline } from '@/components/quote/ActivityTimeline';
import { DuplicateSheet } from '@/components/quote/DuplicateSheet';
import { FollowupPicker } from '@/components/quote/FollowupPicker';
import { LogActivitySheet } from '@/components/quote/LogActivitySheet';
import { PdfPanel } from '@/components/quote/PdfPanel';
import { RevisionTabs } from '@/components/quote/RevisionTabs';
import { RevisionView } from '@/components/quote/RevisionView';
import { ShareSheet } from '@/components/quote/ShareSheet';
import { StatusSheet } from '@/components/quote/StatusSheet';
import { RouterButton, useInvalidateQuote, usePdfFetcher } from '@/components/quote/shared';
import { t } from '@/strings';

/**
 * Which bottom sheet / dialog is open on the detail screen. Only ONE can be open at a time because they all
 * share a single state value: 'none' = nothing open; 'status' = Change status; 'duplicate' = Duplicate;
 * 'share' = Share; 'log' = Log activity; 'more' = the phone-only "More" menu; 'followup' = Change follow-up
 * date; 'delete' = confirm delete draft.
 */
type Sheets = 'none' | 'status' | 'duplicate' | 'share' | 'log' | 'more' | 'followup' | 'delete';

/**
 * Quote detail screen (route `/quotes/:id`): loads one quote and hands it to `Detail` for display.
 *
 * What the user sees: a Spinner while loading; if the API answers 404 a "quote not found" EmptyState with a
 * button back to `/quotes`; for any other failure an ErrorNote with Retry; otherwise the full quote screen.
 * API: GET /quotes/:id, react-query key ['quote', id] (id comes from the URL). Every mutation on this
 * screen invalidates that key (see useInvalidateQuote) so the page refetches after a change.
 * Gotcha: the `retry` rule never retries a 404 (a wrong or deleted id will not appear later) and retries
 * other errors at most twice; `enabled: !!id` stops the query from firing with an empty id.
 * Local state: none (the id is read from the route with useParams).
 */
export default function QuoteDetail() {
  const { id = '' } = useParams();
  const q = useQuery({
    queryKey: ['quote', id],
    queryFn: () => api.get<QuoteDetailT>(`/quotes/${id}`),
    enabled: !!id,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });

  if (q.isLoading) return <Spinner />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) {
      return (
        <EmptyState title={t.quoteDetail.notFoundTitle}>
          <p>{t.quoteDetail.notFoundHint}</p>
          <RouterButton to="/quotes" className="mt-4">{t.quoteDetail.backToQuotes}</RouterButton>
        </EmptyState>
      );
    }
    return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  }
  if (!q.data) return null;
  return <Detail quote={q.data} />;
}

/**
 * Turns the stored lost reason into display text.
 * @param reason - `quote.lost_reason` as saved by PATCH /quotes/:id/status: either a code (`price`,
 *   `quality`, `delivery`, `no_reply`) or `"other: <free text note>"` when the user picked "other".
 * @returns the translated label for a known code; for `other` the text built by `t.quoteDetail.lostOther`
 *   from the note (or the plain "other" label when the note is empty); an unknown code is returned unchanged.
 */
function lostText(reason: string): string {
  if (reason.startsWith('other')) {
    const note = reason.replace(/^other:?\s*/, '');
    return note ? t.quoteDetail.lostOther(note) : t.common.lostReason.other;
  }
  return t.common.lostReason[reason as keyof typeof t.common.lostReason] ?? reason;
}

/**
 * The body of the Quote detail screen, rendered once the quote has loaded.
 *
 * What the user sees (top to bottom):
 *  1. "Back to quotes" link and a header card: quote number (or "Draft" if never issued), status badge, buyer
 *     (link to `/buyers/:id`), lost reason (Lost only), valid-until date, next follow-up date with a Change
 *     button (Sent/Negotiating only; red "overdue" when the date is before today in India), "created by", and
 *     any `warnings` the API returned (e.g. a provisional GST split).
 *  2. Never issued (draft): a card with "Edit draft" (-> `/quotes/:id/edit`) and "Delete draft" buttons.
 *  3. Issued: an action row: "Continue draft" (a revision draft is open) or "Revise"; "Change status";
 *     "Share"; and, on desktop, "Download PDF" and "Duplicate" (on phones those two are in the "More" sheet).
 *  4. Revision tabs (only when there is more than one revision), the selected revision's RevisionView, and
 *     its PdfPanel (issued quotes only).
 *  5. ActivityTimeline with a "Log activity" button.
 *  6. Sheets (modal bottom drawers): StatusSheet, DuplicateSheet, LogActivitySheet, ShareSheet, More,
 *     Change follow-up and Delete draft.
 *
 * Actions -> API:
 *  - Revise: POST /quotes/:id/revise -> invalidate quote caches, toast, navigate to `/quotes/:id/edit`
 *    (BR-02: creates a draft revision copied from the latest issued one; idempotent if one is open).
 *  - Save follow-up: PATCH /quotes/:id/followup `{ next_followup: "YYYY-MM-DD" }`; "Remove" sends null.
 *    The API only accepts this for Sent/Negotiating quotes (409 `not_open` otherwise).
 *  - Delete draft: DELETE /quotes/:id (BR-12: never-issued drafts only) -> toast, navigate to `/quotes`
 *    replacing history.
 *  - Download PDF: GET /quotes/:id/revisions/:rev/pdf?json=1 (signed link) then opens it in a new tab.
 *  - Status / duplicate / share / log: handled inside their own sheet components.
 * All mutation failures show an error toast with the API's message.
 *
 * @param props.quote - the loaded QuoteDetail (money fields are decimal strings; never recalculated here).
 *
 * Local state:
 *  - `sheet` (which modal is open, see `Sheets`);
 *  - `picked` (revision number chosen in the tabs; null = use the default, see `selected` below);
 *  - `followup` (date being edited in the follow-up sheet, pre-filled when it opens);
 *  - `downloading` (true while the PDF link is being fetched; prevents double clicks).
 */
function Detail({ quote }: { quote: QuoteDetailT }) {
  // shorthand for this screen's strings
  const d = t.quoteDetail;
  const nav = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateQuote();
  const fetchPdf = usePdfFetcher();
  // `?share=1` (set by the quote form after issuing) opens the Share sheet straight away
  const [sp, setSp] = useSearchParams();
  const [sheet, setSheet] = useState<Sheets>(sp.get('share') ? 'share' : 'none');
  const [picked, setPicked] = useState<number | null>(null);
  const [followup, setFollowup] = useState('');
  const [downloading, setDownloading] = useState(false);
  // closes whichever sheet is open
  const close = () => {
    setSheet('none');
    if (sp.has('share')) setSp((p) => { p.delete('share'); return p; }, { replace: true });
  };

  // controls whose API route is not live yet are hidden (config.ts hasRoute); adding the route to LIVE_ROUTES turns them on
  const can = {
    status: hasRoute('PATCH', `/quotes/${PROBE_ID}/status`),
    followup: hasRoute('PATCH', `/quotes/${PROBE_ID}/followup`),
    log: hasRoute('POST', `/quotes/${PROBE_ID}/activities`),
    revise: hasRoute('POST', `/quotes/${PROBE_ID}/revise`),
    duplicate: hasRoute('POST', `/quotes/${PROBE_ID}/duplicate`),
    remove: hasRoute('DELETE', `/quotes/${PROBE_ID}`),
  };
  // no quote number yet = still the very first draft (never issued): edit/delete only, nothing to share
  const neverIssued = quote.quote_no === null;
  // Sent or Negotiating: the buyer has the quote and a decision is pending (follow-up date applies)
  const open = quote.status === 'sent' || quote.status === 'negotiating';
  // revisions arrive ordered by revision number, so the last one is the latest
  const lastRev = quote.revisions[quote.revisions.length - 1];
  // tab shown first: the revision the quote is currently 'at' (latest issued), else the newest one
  const defaultRev = quote.current_revision ?? lastRev?.revision ?? 0;
  // revision being displayed; falls back to the latest if `picked` no longer exists
  const selected = quote.revisions.find((r) => r.revision === (picked ?? defaultRev)) ?? lastRev;
  // heading text: the printed number of the latest revision (e.g. QT/26-27/0042-R1) or "Draft"
  const label = quote.number ?? d.draftNumber;
  // "Revise" is offered only for an issued Sent/Negotiating/Expired quote with no open draft revision (BR-02)
  const canRevise = can.revise && !neverIssued && quote.open_draft_revision === null && ['sent', 'negotiating', 'expired'].includes(quote.status);
  // the selected tab is an issued (frozen) revision, so it has a PDF and can be shared
  const issuedSelected = selected?.state === 'issued';
  // dates are YYYY-MM-DD strings, so plain string comparison orders them correctly; today is the India date
  const overdue = open && !!quote.next_followup && quote.next_followup < todayIST();

  /**
   * Mutation: start a new revision. POST /quotes/:id/revise (empty body). On success: invalidate this quote,
   * the list and the dashboard, show a toast and go to the editor `/quotes/:id/edit`. On error: error toast.
   * The Revise button shows a spinner (and is disabled) while `revise.isPending`, which blocks double clicks.
   */
  const revise = useMutation({
    mutationFn: () => api.post<QuoteDetailT>(`/quotes/${quote.id}/revise`),
    onSuccess: () => { invalidate(quote.id); toast(d.revised); nav(`/quotes/${quote.id}/edit`); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  /**
   * Mutation: set or clear the next follow-up date. PATCH /quotes/:id/followup with `{ next_followup: v }`
   * where `v` is a YYYY-MM-DD string, or null to remove the date. On success: invalidate caches, toast
   * ("saved" or "removed" depending on `v`) and close the sheet. On error: error toast (sheet stays open).
   * Called by the sheet's Save button (with `followup`) and its Remove button (with null).
   */
  const saveFollowup = useMutation({
    mutationFn: (v: string | null) => api.patch(`/quotes/${quote.id}/followup`, { next_followup: v }),
    onSuccess: (_r, v) => { invalidate(quote.id); toast(v ? d.followupSaved : d.followupRemoved); close(); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  /**
   * Mutation: delete a never-issued draft quote. DELETE /quotes/:id (204, no body). On success: invalidate
   * the list/dashboard (not this quote's own cache, which would 404), toast, and go to `/quotes` with
   * `replace` so Back does not return to the deleted quote. On error (e.g. 409 `issued_undeletable`): toast
   * and close the confirm sheet.
   */
  const remove = useMutation({
    mutationFn: () => api.del(`/quotes/${quote.id}`),
    onSuccess: () => { invalidate(); toast(d.deleted); nav('/quotes', { replace: true }); },
    onError: (e) => { toast(errorMessage(e), 'error'); close(); },
  });

  /**
   * Opens the selected revision's PDF in a new browser tab.
   * Does nothing unless the selected revision is issued, or if a download is already in progress.
   * Fetches the signed link via `fetchPdf` (GET /quotes/:id/revisions/:rev/pdf?json=1, cached 10 minutes),
   * then `window.open(url, '_blank')`. If the browser blocks the pop-up, it navigates the current tab to the
   * link instead. `w.opener = null` stops the new tab from controlling this one. Errors show a toast. Always
   * resets `downloading` and closes the "More" sheet afterwards.
   */
  const downloadPdf = async () => {
    if (!selected || !issuedSelected || downloading) return;
    setDownloading(true);
    try {
      const { url } = await fetchPdf(quote.id, selected.revision);
      const w = window.open(url, '_blank');
      if (w) w.opener = null;
      else window.location.assign(url); // pop-up blocked: open in this tab
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setDownloading(false);
      close();
    }
  };

  // Share and Download need an issued revision AND an existing PDF file (`pdf_ready`)
  const pdfOk = issuedSelected && !!selected?.pdf_ready;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to="/quotes" className="tap inline-flex items-center gap-1 text-base font-medium text-forest-800 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />{d.back}
      </Link>

      {/* header */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="min-w-0 break-words text-2xl font-bold leading-8 tracking-tight text-ink">{label}</h1>
          <StatusBadge status={quote.status} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-base md:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-fg-muted">{d.buyer}</dt>
            <dd><Link to={`/buyers/${quote.buyer_id}`} className="font-semibold text-forest-800 underline">{quote.buyer.company_name}</Link></dd>
          </div>
          {quote.status === 'lost' && quote.lost_reason && (
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-fg-muted">{d.lostBecause}</dt>
              <dd className="text-red-800">{lostText(quote.lost_reason)}</dd>
            </div>
          )}
          {quote.valid_until && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">{d.validUntil}</dt>
              <dd>{date(quote.valid_until)}</dd>
            </div>
          )}
          {open && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-fg-muted">{d.nextFollowup}</dt>
              <dd className="flex flex-wrap items-center gap-x-2">
                <span className={clsx(overdue && 'font-semibold text-red-700')}>
                  {quote.next_followup ? date(quote.next_followup) : d.noFollowup}{overdue && ` (${d.followupOverdue})`}
                </span>
                {can.followup && (
                  <Button variant="ghost" className="px-2" onClick={() => { setFollowup(quote.next_followup ?? ''); setSheet('followup'); }}>
                    <Pencil className="h-4 w-4" aria-hidden />{d.changeFollowup}
                  </Button>
                )}
              </dd>
            </div>
          )}
          {quote.created_by_name && <p className="col-span-full text-sm text-fg-muted">{d.createdBy(quote.created_by_name)}</p>}
        </dl>
        {quote.warnings && quote.warnings.length > 0 && (
          <div role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">{d.warnings}</div>
            <ul className="list-disc pl-5">{quote.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
      </Card>

      {/* never issued: draft actions */}
      {neverIssued && (
        <Card className="space-y-3 border-gold-500 p-4">
          <div>
            <h2 className="text-[17px] font-bold leading-6 text-ink">{d.draftTitle}</h2>
            <p className="text-base text-fg-secondary">{d.draftHint}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RouterButton to={`/quotes/${quote.id}/edit`}><Pencil className="h-4 w-4" aria-hidden />{d.editDraft}</RouterButton>
            {can.remove && <Button variant="danger" onClick={() => setSheet('delete')}><Trash2 className="h-4 w-4" aria-hidden />{d.deleteDraft}</Button>}
          </div>
        </Card>
      )}

      {/* issued: actions */}
      {/* Layout note: on phones the row is a 3-column grid and Download/Duplicate are hidden (see 'More');
          from md up it is one wrapping row with every button visible. */}
      {!neverIssued && (
        <section aria-label={d.actions} className="grid grid-cols-[1.5fr_1fr_1fr] gap-2 md:flex md:flex-wrap">
          {quote.open_draft_revision !== null ? (
            <RouterButton to={`/quotes/${quote.id}/edit`} className="col-span-3">{d.continueDraft}</RouterButton>
          ) : canRevise ? (
            <Button className="col-span-3" onClick={() => revise.mutate()} loading={revise.isPending}>{d.revise}</Button>
          ) : null}
          {can.status && <Button variant="secondary" onClick={() => setSheet('status')}>{d.changeStatus}</Button>}
          <Button variant="secondary" onClick={() => setSheet('share')} disabled={!pdfOk}><Share2 className="h-4 w-4" aria-hidden />{d.share}</Button>
          <Button variant="secondary" className="hidden md:inline-flex" onClick={() => void downloadPdf()} loading={downloading} disabled={!pdfOk}>
            <Download className="h-4 w-4" aria-hidden />{d.downloadPdf}
          </Button>
          {can.duplicate && <Button variant="secondary" className="hidden md:inline-flex" onClick={() => setSheet('duplicate')}><Copy className="h-4 w-4" aria-hidden />{d.duplicate}</Button>}
          <Button variant="secondary" className="md:hidden" onClick={() => setSheet('more')}><MoreHorizontal className="h-4 w-4" aria-hidden />{d.more}</Button>
        </section>
      )}

      {/* revisions */}
      {selected && (
        <section className="space-y-3">
          {quote.revisions.length > 1 && (
            <RevisionTabs revisions={quote.revisions} selected={selected.revision} onSelect={setPicked} />
          )}
          <RevisionView key={`view-${selected.id}`} quote={quote} revision={selected} />
          {!neverIssued && <PdfPanel key={`pdf-${selected.id}`} quoteId={quote.id} revision={selected} />}
        </section>
      )}

      <ActivityTimeline activities={quote.activities} onLog={can.log ? () => setSheet('log') : undefined} />

      {/* sheets */}
      <StatusSheet open={sheet === 'status'} onClose={close} quote={quote} />
      <DuplicateSheet open={sheet === 'duplicate'} onClose={close} quote={quote} />
      <LogActivitySheet open={sheet === 'log'} onClose={close} quoteId={quote.id} subtitle={`${quote.buyer.company_name}, ${label}`} />
      {selected && issuedSelected && (
        <ShareSheet
          open={sheet === 'share'} onClose={close} quoteId={quote.id} revision={selected.revision}
          number={selected.number ?? label} buyer={quote.buyer} onLog={can.log ? () => setSheet('log') : undefined}
        />
      )}

      <Sheet open={sheet === 'more'} onClose={close} title={d.moreTitle}>
        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={() => void downloadPdf()} loading={downloading} disabled={!pdfOk}>
            <Download className="h-4 w-4" aria-hidden />{d.downloadPdf}
          </Button>
          {can.duplicate && <Button variant="secondary" className="w-full" onClick={() => setSheet('duplicate')}><Copy className="h-4 w-4" aria-hidden />{d.duplicate}</Button>}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'followup'} onClose={close} title={d.followupTitle}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={close} disabled={saveFollowup.isPending}>{t.common.cancel}</Button>
            <Button className="flex-[2]" disabled={!followup} loading={saveFollowup.isPending} onClick={() => saveFollowup.mutate(followup)}>{d.followupSave}</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <FollowupPicker value={followup} onChange={setFollowup} />
          {quote.next_followup && (
            <Button variant="ghost" className="w-full" disabled={saveFollowup.isPending} onClick={() => saveFollowup.mutate(null)}>{d.followupRemove}</Button>
          )}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'delete'} onClose={close} title={d.deleteTitle}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={close} disabled={remove.isPending}>{t.common.cancel}</Button>
            <Button variant="danger" className="flex-[2]" loading={remove.isPending} onClick={() => remove.mutate()}>{d.deleteConfirm}</Button>
          </div>
        }
      >
        <p className="text-base text-fg-secondary">{d.deleteHint}</p>
      </Sheet>
    </div>
  );
}
