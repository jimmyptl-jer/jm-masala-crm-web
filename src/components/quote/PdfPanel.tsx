/**
 * PDF panel for one revision (inline preview / open button / retry), used by pages/QuoteDetail.tsx.
 *
 * API: GET /quotes/:id/revisions/:rev/pdf?json=1 (signed link, key ['pdf', quoteId, rev]) and
 * POST /quotes/:id/revisions/:rev/render (retry; result is the QuoteDetail, written to ['quote', quoteId]).
 * Implements NFR-07 (the PDF is produced after issuing; failure leaves the quote issued and retryable) and
 * BR-03 (the PDF is built from the frozen snapshot, so it never changes). Composes ExternalButton, the
 * shared usePdf / useMediaQuery / useInvalidateQuote hooks and the ui kit.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import type { QuoteDetail, Revision } from '@/lib/types';
import { Button, Card, ErrorNote, Spinner, errorMessage, useToast } from '@/components/ui';
import { t } from '@/strings';
import { ExternalButton, useInvalidateQuote, useMediaQuery, usePdf } from './shared';

/**
 * PDF area under the selected revision on the Quote detail screen.
 *
 * What the user sees depends on the revision:
 *  - Draft revision: a short note that the PDF is created when the quote is issued.
 *  - Issued but `pdf_ready` is false (PDF generation failed after issuing): an amber warning with a
 *    "Retry PDF" button. The quote is already issued and numbered; only the file is missing (NFR-07).
 *  - Issued with a PDF: a "PDF" card. On wide screens (>= 768px) an inline preview (iframe, 75% of the window
 *    height) of the signed link; on phones an "Open PDF" button that opens it in a new tab.
 * Actions -> API:
 *  - Loading the card fetches the signed link: GET /quotes/:id/revisions/:rev/pdf?json=1 (key
 *    ['pdf', quoteId, rev], cached 10 minutes; the link itself is valid 30 days).
 *  - Retry PDF: POST /quotes/:id/revisions/:rev/render renders the PDF again from the frozen snapshot. The
 *    response is the full QuoteDetail, which is stored into ['quote', quoteId]; ['pdf', quoteId] and the
 *    quote caches are invalidated; success toast. A failure (the API answers with an error) shows an error
 *    toast.
 * @param props.quoteId - id of the quote.
 * @param props.revision - the revision being shown (uses `state`, `revision`, `pdf_ready`, `number`).
 * Local state: none besides react-query results; `wide` comes from a media query.
 */
export function PdfPanel({ quoteId, revision }: { quoteId: string; revision: Revision }) {
  const d = t.quoteDetail;
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateQuote();
  // iframe previews are poor on phones (and often blocked), so small screens get a button instead
  const wide = useMediaQuery('(min-width: 768px)');
  const issued = revision.state === 'issued';
  // fetch the signed link only when the revision is issued and the PDF file exists
  const link = usePdf(quoteId, revision.revision, issued && revision.pdf_ready);

  // POST /quotes/:id/revisions/:rev/render (re-render a missing PDF from the stored snapshot)
  const retry = useMutation({
    mutationFn: () => api.post<QuoteDetail>(`/quotes/${quoteId}/revisions/${revision.revision}/render`),
    onSuccess: (q) => {
      qc.setQueryData(['quote', quoteId], q);
      void qc.invalidateQueries({ queryKey: ['pdf', quoteId] });
      invalidate(quoteId);
      if (q.pdf?.status === 'failed') toast(d.pdfRetryFailed, 'error');
      else toast(d.pdfRetried);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  // draft revision: nothing to show yet
  if (!issued) return <p className="text-sm text-ink/65">{d.pdfDraftHint}</p>;

  // issued but no PDF file: offer Retry (the revision stays issued either way)
  if (!revision.pdf_ready) {
    return (
      <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="text-base">{d.pdfNotReady}</p>
        </div>
        <Button className="mt-3 w-full" onClick={() => retry.mutate()} loading={retry.isPending}>{d.pdfRetry}</Button>
      </div>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-serif text-xl font-semibold text-forest-900">{d.pdfTitle}</h3>
      {link.isLoading && <Spinner label={d.pdfLoading} />}
      {link.isError && <ErrorNote error={link.error} onRetry={() => void link.refetch()} />}
      {link.data && (
        wide ? (
          <iframe src={link.data.url} title={d.pdfFrameTitle(revision.number ?? '')} className="h-[75vh] w-full rounded-lg border border-cream-200 bg-white" />
        ) : (
          <ExternalButton variant="primary" className="w-full" href={link.data.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden />{d.pdfOpen}
          </ExternalButton>
        )
      )}
    </Card>
  );
}
