/**
 * Shared React hooks: debounce, unsaved-changes guard and the common list queries.
 * API: GET /buyers (useBuyers), GET /products (useProducts), GET /settings (useSettings), using react-query
 * keys ['buyers', opts], ['products', opts] and ['settings'] so every screen shares one cache and a single
 * invalidation refreshes all of them.
 * Used by Buyers, Products, Settings, QuoteForm and the quote sheets. SRS: FR-15 (a quick-added buyer shows
 * up in the buyer picker because BuyerForm invalidates ['buyers']).
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { api, qs } from './api';
import { hasRoute } from './config';
import type { Partner, PartnerDetail } from './partners';
import type { Buyer, BuyerSummary, FxRate, Inquiry, Product, SendChannels, Settings, TeamMember } from './types';

/**
 * Return `value` only after it has stopped changing for `ms` milliseconds. Used so typing in a search box
 * (Buyers, Products: 300 ms) or editing quote-form amounts (400 ms, to trigger a recalculation) does not
 * fire a request per keystroke.
 * @param value — the fast-changing value.
 * @param ms — quiet period before the returned value follows (default 400).
 * @returns the delayed copy; the first render returns the initial value immediately.
 */
export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  // Restart the timer on every change; the cleanup cancels the previous timer, so only the last value
  // survives.
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

/**
 * Warn before the user loses unsaved edits (used by the quote form).
 * @param dirty — true while there are unsaved changes.
 * @param message — text for the in-app confirmation.
 * Two protections while dirty: (1) in-app navigation to a DIFFERENT path is blocked and a
 * window.confirm(message) asks "leave?" (OK proceeds, Cancel stays); changes that keep the same pathname,
 * e.g. only the query string, are not blocked; (2) closing or refreshing the tab triggers the browser's own
 * "Leave site?" prompt (browsers ignore custom text there).
 * Needs a data router (createBrowserRouter in router.tsx), because it uses react-router's useBlocker.
 */
export function useUnsavedChanges(dirty: boolean, message: string) {
  // useBlocker intercepts navigation; the callback decides whether this particular navigation should be
  // stopped.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  // When a navigation was blocked, ask the user. proceed() lets it continue; reset() cancels it and stays
  // on the page.
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(message)) blocker.proceed(); else blocker.reset();
    }
  }, [blocker, message]);
  // Tab close / reload: registered only while dirty, removed again when dirty becomes false or the
  // component unmounts.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}

// ---- shared queries (one cache key per list so every screen sees the same data) ---------------
/**
 * Shared list query for buyers: GET /buyers?q=&type=&archived= (returns { data: Buyer[] }, the hook unwraps
 * `data`).
 * React-query key: ['buyers', opts], so every distinct filter set is cached separately, and invalidating
 * ['buyers'] (done by BuyerForm after a save, ImportPanel after an import) refreshes all of them.
 * @param opts.q — search text (company, contact, city, country, email; case-insensitive).
 * @param opts.type — 'export' or 'domestic'.
 * @param opts.archived — 'false' (default on the API: active only), 'true' (archived only) or 'all'.
 * Used by Buyers, QuoteForm and DuplicateSheet (buyer pickers). Each Buyer has quote_count in this list.
 * @param opts.stage — one pipeline stage; @param opts.channel — one lead channel; @param opts.qualified — 'true' / 'false';
 * @param opts.due — '1' = the buyer's own next follow-up date is today or earlier (Buyer CRM filters).
 */
/** GET /inquiries (react-query key ['inquiries', opts]); every inquiry change invalidates ['inquiries']. */
export const useInquiries = (opts: { q?: string; status?: string; buyer_id?: string; product?: string; assigned_to?: string; archived?: 'true' | 'false' | 'all'; due?: '1' } = {}) =>
  useQuery({
    queryKey: ['inquiries', opts],
    queryFn: () => api.get<{ data: Inquiry[] }>(`/inquiries${qs(opts)}`).then((r) => r.data),
  });

export const useBuyers = (opts: { q?: string; type?: string; archived?: 'true' | 'false' | 'all'; stage?: string; channel?: string; qualified?: 'true' | 'false'; due?: '1' } = {}) =>
  useQuery({
    queryKey: ['buyers', opts],
    queryFn: () => api.get<{ data: Buyer[] }>(`/buyers${qs(opts)}`).then((r) => r.data),
  });

/**
 * Shared list query for products: GET /products?q=&archived= (returns { data: Product[] }, unwrapped).
 * React-query key: ['products', opts]; ProductForm and ImportPanel invalidate ['products'] after changes.
 * @param opts.q — search text (name or grade).
 * @param opts.archived — 'false' (default), 'true' or 'all'.
 * Used by Products and the quote form's product picker.
 */
export const useProducts = (opts: { q?: string; archived?: 'true' | 'false' | 'all' } = {}) =>
  useQuery({
    queryKey: ['products', opts],
    queryFn: () => api.get<{ data: Product[] }>(`/products${qs(opts)}`).then((r) => r.data),
  });

/**
 * Company settings: GET /settings (company, bank, default terms, validity_days, followup_days, logo_url).
 * React-query key: ['settings']. Kept fresh for 5 minutes (settings change rarely). Settings screens write
 * through saveSettings in components/settings/shared.tsx, which updates this same cache entry; QuoteForm
 * reads it for defaults (terms, validity).
 */
export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings'), staleTime: 5 * 60_000 });

/**
 * Today's dollar rate: GET /fx-rate (key ['fx-rate']), rupees for one US dollar, shared by the whole team and edited on the dashboard
 * (PUT /fx-rate, see components/FxRateBar.tsx). Only the API uses it for calculations; the screens show it and the rupee value it gives.
 */
export const useFxRate = () => useQuery({ queryKey: ['fx-rate'], queryFn: () => api.get<FxRate>('/fx-rate'), staleTime: 60_000 });

/**
 * GET /send-channels: which of Email / WhatsApp the server can send directly (key ['send-channels']).
 * Cached for 5 minutes; while loading or on error both are treated as off, so the UI falls back to the
 * "open my own mail program / WhatsApp" behaviour instead of offering something that might fail.
 */
export const useSendChannels = () => {
  const q = useQuery({ queryKey: ['send-channels'], queryFn: () => api.get<SendChannels>('/send-channels'), staleTime: 5 * 60_000 });
  return q.data ?? { email: false, whatsapp: false };
};

/**
 * GET /team (only when the route is live, see lib/config.ts hasRoute; otherwise always []): id and name of everyone who can be given a buyer (key ['team'], cached 5 minutes). Used by the
 * "Assigned to" dropdown of the buyer form. Empty while loading or on error.
 */
export const useTeam = (): TeamMember[] =>
  useQuery({ queryKey: ['team'], queryFn: () => api.get<{ data: TeamMember[] }>('/team').then((r) => r.data), staleTime: 5 * 60_000, enabled: hasRoute('GET', '/team') }).data ?? [];

/**
 * GET /buyers/summary (only when the route is live; otherwise the query stays idle with no data): the Buyer CRM numbers (totals, stage counts, sales by channel). React-query key
 * ['buyers', 'summary'], so BuyerForm's invalidation of ['buyers'] refreshes it after every buyer change.
 */
export const useBuyerSummary = () =>
  useQuery({ queryKey: ['buyers', 'summary'], queryFn: () => api.get<BuyerSummary>('/buyers/summary'), enabled: hasRoute('GET', '/buyers/summary') });

/**
 * GET /partners: the partner directory (key ['partners', opts]); every partner change invalidates ['partners'].
 * @param opts.q search text; @param opts.role one role; @param opts.status one status; @param opts.archived 'false' (default), 'true' or 'all'.
 */
export const usePartners = (opts: { q?: string; role?: string; status?: string; archived?: 'true' | 'false' | 'all' } = {}) =>
  useQuery({ queryKey: ['partners', opts], queryFn: () => api.get<{ data: Partner[] }>(`/partners${qs(opts)}`).then((r) => r.data) });

/** GET /partners/:id: one partner with its activity log (key ['partner', id]). */
export const usePartner = (id: string | undefined) =>
  useQuery({ queryKey: ['partner', id], queryFn: () => api.get<PartnerDetail>(`/partners/${id}`), enabled: !!id });

/** One day's rates of a grade, as GET /products/:id/rate-history returns them. */
export interface RateHistoryRow { date: string; ref_rate_usd: string | null; ref_rate_inr: string | null; set_by_name: string; set_at: string }

/** GET /products/:id/rate-history: the day-by-day rates of one grade, newest first (key ['rate-history', id]; the rate changes invalidate it). */
export const useRateHistory = (id: string | null) =>
  useQuery({ queryKey: ['rate-history', id], queryFn: () => api.get<{ data: RateHistoryRow[] }>(`/products/${id}/rate-history`).then((r) => r.data), enabled: !!id });
