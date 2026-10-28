/**
 * Shared helpers for the quote screens (Today, Quote detail, Quotes list): activity icons, the cache
 * invalidation hook, PDF-link hooks (GET /quotes/:id/revisions/:rev/pdf?json=1, key ['pdf', quoteId, rev]),
 * a media-query hook and two link components styled like buttons (RouterButton, ExternalButton).
 * Used by pages/Today.tsx, pages/Quotes.tsx, pages/QuoteDetail.tsx and the other files in this folder.
 * No SRS rule is implemented here; the helpers only keep screens consistent.
 */
import clsx from 'clsx';
import { Mail, MessageCircle, Phone, RefreshCw, StickyNote, Users } from 'lucide-react';
import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pdfUrl } from '@/lib/api';
import type { ActivityKind } from '@/lib/types';

/**
 * Small icon for each activity kind (call, whatsapp, email, meeting, note, status_change).
 * Used by ActivityTimeline, LogActivitySheet (kind picker) and the Today card's "last activity" line.
 */
export const ACTIVITY_ICON: Record<ActivityKind, ReactNode> = {
  call: <Phone className="h-4 w-4" aria-hidden />,
  whatsapp: <MessageCircle className="h-4 w-4" aria-hidden />,
  email: <Mail className="h-4 w-4" aria-hidden />,
  meeting: <Users className="h-4 w-4" aria-hidden />,
  note: <StickyNote className="h-4 w-4" aria-hidden />,
  status_change: <RefreshCw className="h-4 w-4" aria-hidden />,
};

/**
 * Hook returning a function that refreshes everything a quote change can affect.
 * @returns `(quoteId?) => void`. It invalidates ['quotes'] (the list) and ['dashboard'] (Today) always, and
 *   ['quote', quoteId] (the detail) only when an id is given. react-query then refetches whichever of those
 *   are on screen. Call it with NO id after deleting a quote (its own detail query would 404).
 * Used after status change, duplicate, log activity, revise, follow-up change, delete and PDF retry.
 */
export function useInvalidateQuote() {
  const qc = useQueryClient();
  return (quoteId?: string) => {
    if (quoteId) void qc.invalidateQueries({ queryKey: ['quote', quoteId] });
    void qc.invalidateQueries({ queryKey: ['quotes'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

/**
 * Hook: does the browser window currently match a CSS media query? Re-renders when the answer changes.
 * @param query - a media query string, e.g. '(min-width: 768px)'.
 * @returns boolean. False when `window.matchMedia` does not exist (tests / old browsers).
 * Used by PdfPanel to pick an inline preview (wide screens) or an "Open PDF" button (phones).
 */
export function useMediaQuery(query: string): boolean {
  const [m, setM] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [query]);
  return m;
}

// react-query key of one revision's signed PDF link (['pdf', quoteId] invalidates all of a quote's links)
export const pdfKey = (quoteId: string, rev: number) => ['pdf', quoteId, rev] as const;
// signed links last 30 days (server side), so reusing one for 10 minutes is safe and saves requests
const PDF_STALE = 10 * 60_000;

/**
 * Hook: signed PDF link for one revision. GET /quotes/:id/revisions/:rev/pdf?json=1 -> `{ url, expires_at }`.
 * @param quoteId - quote id.
 * @param rev - revision number (0, 1, 2 ...).
 * @param enabled - fetch only when true (e.g. the revision is issued and its PDF exists, or the share sheet
 *   is open).
 * @returns the react-query result (`data.url`, `data.expires_at`); cached for 10 minutes.
 * Used by PdfPanel and ShareSheet.
 */
export function usePdf(quoteId: string, rev: number, enabled: boolean) {
  return useQuery({ queryKey: pdfKey(quoteId, rev), queryFn: () => pdfUrl(quoteId, rev), enabled, staleTime: PDF_STALE });
}

/**
 * Hook returning an imperative version of `usePdf`: `(quoteId, rev) => Promise<{ url, expires_at }>`.
 * It goes through the same cache key and 10-minute freshness, so a link fetched by PdfPanel is reused.
 * Used by QuoteDetail's "Download PDF" button, which needs the link on click rather than on render.
 */
export function usePdfFetcher() {
  const qc = useQueryClient();
  return (quoteId: string, rev: number) =>
    qc.fetchQuery({ queryKey: pdfKey(quoteId, rev), queryFn: () => pdfUrl(quoteId, rev), staleTime: PDF_STALE });
}

// ---- link styled like a Button (a link must not be wrapped in a button) --------------------------
// colour variants for links that look like buttons (only the three that are needed)
type LinkVariant = 'primary' | 'gold' | 'secondary';
const LINK_VARIANTS: Record<LinkVariant, string> = {
  primary: 'bg-paprika text-white hover:bg-paprika-700 active:bg-paprika-800',
  gold: 'bg-paprika text-white hover:bg-paprika-700 active:bg-paprika-800',
  secondary: 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-hover',
};
// same size/shape as ui Button so links and buttons line up in a row
const LINK_BASE = 'tap inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-semibold transition-colors';

/**
 * In-app link (react-router `Link`) styled like a Button. Use it for navigation; a <button> inside a <Link>
 * (or the reverse) is invalid HTML and breaks keyboard/screen-reader behaviour.
 * @param props.variant - 'primary' (default), 'gold' or 'secondary'.
 * @param props.className - extra classes; all other props (`to`, `aria-label` ...) go to the Link.
 */
export function RouterButton({ variant = 'primary', className, ...rest }: LinkProps & { variant?: LinkVariant }) {
  return <Link className={clsx(LINK_BASE, LINK_VARIANTS[variant], className)} {...rest} />;
}

/**
 * Link to an outside target (`tel:`, `https://wa.me/...`, `mailto:`, a PDF URL) styled like a Button.
 * @param props.href - the target; when null/undefined/empty NOTHING is linked and a disabled, greyed-out
 *   <button> is rendered instead (e.g. buyer without a phone number), keeping the same size in the layout.
 * @param props.variant - 'secondary' (default), 'primary' or 'gold'.
 * @param props.title - tooltip; on the disabled button it explains why the button is disabled.
 * Other anchor props (`target`, `rel`, `onClick`, `aria-label`) are passed to the <a>.
 */
export function ExternalButton({ variant = 'secondary', href, className, children, ...rest }:
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { variant?: LinkVariant; href?: string | null }) {
  if (!href) {
    return (
      <button type="button" disabled aria-disabled="true" title={rest.title}
        className={clsx(LINK_BASE, 'cursor-not-allowed border border-forest-900/15 bg-white text-forest-900/40', className)}>
        {children}
      </button>
    );
  }
  return <a href={href} className={clsx(LINK_BASE, LINK_VARIANTS[variant], className)} {...rest}>{children}</a>;
}
