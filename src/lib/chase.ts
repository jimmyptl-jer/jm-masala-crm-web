/**
 * The chase engine behind the dashboard: builds today's list of buyers to contact, each with the reason and a priority,
 * and the list of buyers going cold. Pure functions over data the screens already load; no API calls and no money maths.
 *
 * Rules, highest priority first (one row per buyer, the best reason wins):
 *   1 overdue follow-up (the buyer's own next follow-up, or a quote follow-up, is before today)        danger   "Follow-up overdue"
 *   2 sample sent, no feedback (stage 'sample dispatched', no contact for 7+ days)                     danger   "Sample feedback"
 *   3 new enquiry not answered (stage 'new lead', no contact logged yet)                               info     "New enquiry"
 *   4 quotation sent and valid for 3 days or fewer                                                     warning  "Quote ends in Nd"
 *   5 follow-up due today                                                                              neutral  "Follow-up today"
 * Not built yet because the data is missing: "repeat order due" (needs orders) and the exact sample sent date (needs
 * samples); see docs/DOMAIN-SPEC.md. Rows sort by priority, then by days since the last contact (longest first).
 */
import type { Buyer, DueRow, QuoteListRow } from '@/lib/types';

/** Colour family of a reason badge (design system status colours). */
export type ChaseTone = 'danger' | 'warning' | 'info' | 'neutral';
/** The reason a buyer is on the list; the filter chips group them. */
export type ChaseKind = 'overdue' | 'sample' | 'new' | 'quote' | 'today';

/** One row of the chase list. */
export interface ChaseRow {
  buyer: Buyer;
  kind: ChaseKind;
  tone: ChaseTone;
  /** 1 (most urgent) to 5. */
  priority: number;
  /** Text of the badge, e.g. "Quote ends in 2d". */
  label: string;
  /** Whole days since the last contact; null when the buyer was never contacted. */
  daysSinceContact: number | null;
  /** The quote involved, when the reason comes from a quote (open it from the row). */
  quoteId?: string;
}

/** 'YYYY-MM-DD' of an ISO timestamp in India time. */
const ymdIST = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/** Whole days from `a` to `b` (both 'YYYY-MM-DD'). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Days since a buyer's last contact, or null when there was none. */
export function daysSinceContact(b: Buyer, today: string): number | null {
  return b.last_contact_at ? Math.max(0, daysBetween(ymdIST(b.last_contact_at), today)) : null;
}

/** A buyer that is still being worked: not archived, not won, not lost. */
const live = (b: Buyer) => !b.archived && b.stage !== 'won' && b.stage !== 'lost';

/**
 * @param buyers - active buyers.
 * @param quotes - quotes (the list rows); sent quotes that end soon become "Quote ends in Nd".
 * @param dueQuotes - quote follow-ups due today or overdue (GET /dashboard `due`).
 * @param today - today's India date, 'YYYY-MM-DD'.
 * @returns one row per buyer, most urgent first.
 */
export function buildChase(buyers: Buyer[], quotes: QuoteListRow[], dueQuotes: DueRow[], today: string): ChaseRow[] {
  const rows: ChaseRow[] = [];
  for (const b of buyers.filter(live)) {
    const since = daysSinceContact(b, today);
    const mineDue = dueQuotes.filter((d) => d.buyer_id === b.id);
    const expiring = quotes
      .filter((q) => q.buyer_id === b.id && q.status === 'sent' && !!q.valid_until)
      .map((q) => ({ q, left: daysBetween(today, q.valid_until as string) }))
      .filter((x) => x.left >= 0 && x.left <= 3)
      .sort((a, c) => a.left - c.left)[0];
    const base = { buyer: b, daysSinceContact: since };

    if ((b.next_followup && b.next_followup < today) || mineDue.some((d) => d.days_overdue > 0)) {
      rows.push({ ...base, kind: 'overdue', tone: 'danger', priority: 1, label: 'Follow-up overdue', quoteId: mineDue.find((d) => d.days_overdue > 0)?.id });
    } else if (b.stage === 'sample_dispatched' && (since === null || since >= 7)) {
      rows.push({ ...base, kind: 'sample', tone: 'danger', priority: 2, label: 'Sample feedback' });
    } else if (b.stage === 'new_lead' && !b.last_contact_at) {
      rows.push({ ...base, kind: 'new', tone: 'info', priority: 3, label: 'New enquiry' });
    } else if (expiring) {
      rows.push({ ...base, kind: 'quote', tone: 'warning', priority: 4, label: expiring.left === 0 ? 'Quote ends today' : `Quote ends in ${expiring.left}d`, quoteId: expiring.q.id });
    } else if (b.next_followup === today || mineDue.length > 0) {
      rows.push({ ...base, kind: 'today', tone: 'neutral', priority: 5, label: 'Follow-up today', quoteId: mineDue[0]?.id });
    }
  }
  return rows.sort((a, c) => a.priority - c.priority || (c.daysSinceContact ?? 999) - (a.daysSinceContact ?? 999));
}

/** Buyers going cold: still being worked and no contact for `days` days or more (never contacted counts from the first enquiry). Oldest first. */
export function goingCold(buyers: Buyer[], today: string, days = 14): { buyer: Buyer; days: number }[] {
  return buyers.filter(live)
    .map((b) => {
      const d = daysSinceContact(b, today) ?? (b.first_inquiry_date ? Math.max(0, daysBetween(b.first_inquiry_date, today)) : 0);
      return { buyer: b, days: d };
    })
    .filter((x) => x.days >= days)
    .sort((a, c) => c.days - a.days);
}
