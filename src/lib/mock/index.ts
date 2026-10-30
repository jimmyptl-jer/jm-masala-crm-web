/**
 * Mock API used while the real API is paused (see docs/ARCHITECTURE.md). `mockRequest` answers the same
 * paths lib/api.ts used to send over HTTP, from sample data held in memory (reload the page to reset it).
 * Covers what the routed screens need: Quotes (list, detail, status, follow-up, notes, delete) and Buyers
 * (list, summary, detail, create, edit), plus products, settings and the user. Everything else answers
 * 501 'needs_api', which the screens show as an error message. No money maths happens here: totals in the
 * sample data are fixed, and POST /quotes/calculate returns zeros with a warning.
 */
import { ApiError } from '../api';
import type {
  Buyer, BuyerDetail, BuyerSummary, CalcResult, Currency, Dashboard, FxRate, Inquiry, InquiryDetail, Product, QuoteDetail, QuoteListRow, Stage,
} from '../types';
import { PARTNERS } from './partners';
import { BUYERS, INQUIRIES, ME, PRODUCTS, QUOTES, SETTINGS, TEAM, USERS } from './data';

/** Today's dollar rate in the sample data; nobody has set it until the first PUT /fx-rate. */
const MOCK_FX: FxRate = { rate: null, rate_date: null, updated_by_name: null, updated_at: null, is_today: false };

/** Contacts logged on buyers during this session (the mock keeps them in memory only). */
const BUYER_ACTIVITIES = new Map<string, BuyerDetail['activities']>();

const STAGES: Stage[] = ['new_lead', 'contacted', 'qualified', 'requirements_received', 'quotation_sent', 'sample_requested',
  'sample_payment_pending', 'sample_dispatched', 'sample_approved', 'negotiation', 'po_received', 'won', 'lost'];

type PartnerDetailActivity = (typeof PARTNERS)[number]['activities'][number];
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const notFound = () => new ApiError(404, 'not_found', 'Not found (sample data)');
const needsApi = (m: string, p: string) => new ApiError(501, 'needs_api', `Not available yet: ${m} ${p.split('?')[0]} needs the API, which is paused.`);

let nextId = 100;
const newId = (prefix: string) => `${prefix}${nextId++}`;

function listRow(q: QuoteDetail): QuoteListRow {
  const rev = q.revisions[q.revisions.length - 1]!;
  return {
    id: q.id, quote_no: q.quote_no, number: q.number, type: q.type, status: q.status, next_followup: q.next_followup,
    valid_until: q.valid_until, current_revision: q.current_revision, latest_revision: rev.revision, latest_state: rev.state,
    grand_total: q.grand_total, currency: q.currency, buyer_id: q.buyer_id, buyer_name: q.buyer.company_name,
    products: rev.lines.map((l) => l.product.name).join(', ') || null, activity_at: q.activities[0]?.happened_at ?? rev.issued_at ?? new Date().toISOString(),
    created_at: rev.issued_at ?? new Date().toISOString(),
  };
}

function summary(): BuyerSummary {
  const live = BUYERS.filter((b) => !b.archived);
  const stages = Object.fromEntries(STAGES.map((s) => [s, live.filter((b) => b.stage === s).length])) as Record<Stage, number>;
  return {
    totals: {
      leads: live.length, qualified: live.filter((b) => b.qualified).length, customers: live.filter((b) => b.stage === 'won').length,
      lost: live.filter((b) => b.stage === 'lost').length, open_quotations: QUOTES.filter((q) => q.status === 'sent' || q.status === 'negotiating').length,
      conversion_rate: null, followups_due: live.filter((b) => b.next_followup && b.next_followup <= today()).length,
      no_next_action: live.filter((b) => !b.next_followup).length,
    },
    stages, channels: [],
  };
}

function dashboard(): Dashboard {
  const day = today();
  const dayOffset = (date: string) => Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  const open = QUOTES.filter((q): q is QuoteDetail & { grand_total: string; currency: Currency } =>
    (q.status === 'sent' || q.status === 'negotiating') && q.grand_total !== null && q.currency !== null,
  );
  const due = open.filter((q) => q.next_followup && q.next_followup <= day).map((q) => ({
    id: q.id, number: q.number ?? 'Draft', status: q.status, next_followup: q.next_followup!, grand_total: q.grand_total,
    currency: q.currency, buyer_id: q.buyer_id, buyer_name: q.buyer.company_name, buyer_phone: q.buyer.phone,
    buyer_whatsapp: q.buyer.whatsapp, days_since_sent: Math.max(0, dayOffset(q.revisions[q.revisions.length - 1]?.issued_at?.slice(0, 10) ?? day)),
    days_overdue: Math.max(0, dayOffset(q.next_followup!)), last_kind: q.activities[0]?.kind ?? null,
    last_body: q.activities[0]?.body ?? null, last_at: q.activities[0]?.happened_at ?? null,
  }));
  const expiring = open.filter((q) => q.valid_until && q.valid_until >= day && q.valid_until <= new Date(Date.parse(`${day}T00:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10)).map((q) => ({
    id: q.id, number: q.number ?? 'Draft', status: q.status, valid_until: q.valid_until!, grand_total: q.grand_total,
    currency: q.currency, buyer_id: q.buyer_id, buyer_name: q.buyer.company_name, days_left: Math.max(0, -dayOffset(q.valid_until!)),
  }));
  const month = day.slice(0, 7);
  const inMonth = (q: QuoteDetail) => (q.revisions[q.revisions.length - 1]?.issued_at ?? '').slice(0, 7) === month;
  return {
    today: day, due, expiring,
    counts: {
      drafts: QUOTES.filter((q) => q.status === 'draft').length,
      awaiting_reply: QUOTES.filter((q) => q.status === 'sent').length,
      negotiating: QUOTES.filter((q) => q.status === 'negotiating').length,
      won_this_month: QUOTES.filter((q) => q.status === 'won' && inMonth(q)).length,
      lost_this_month: QUOTES.filter((q) => q.status === 'lost' && inMonth(q)).length,
    },
  };
}

function calc(): CalcResult {
  return {
    lines: [], subtotal: '0.00', discount: '0.00', freight: '0.00', insurance: '0.00', gst_total: '0.00', round_off: '0.00',
    grand_total: '0.00', amount_words: '', equivalent: null, tax_mode: 'none', margin: { total: null, pct: null, complete: false }, type: 'export',
    currency: 'USD', warnings: ['Totals are not calculated while the API is paused.'],
  };
}

/** Answers one request. Same signature idea as the old fetch wrapper: method, path with query string, body. */
export async function mockRequest<T>(method: string, fullPath: string, body?: unknown): Promise<T> {
  const [path = '', query = ''] = fullPath.split('?');
  const params = new URLSearchParams(query);
  const b = (body ?? {}) as Record<string, unknown>;
  const seg = path.split('/').filter(Boolean);
  const out = (v: unknown) => clone(v) as T;

  // ---- who am I / settings / lookups ----
  if (method === 'GET' && path === '/me') return out(ME);
  if (method === 'GET' && path === '/users') return out({ data: USERS });
  if (method === 'GET' && path === '/team') return out({ data: TEAM });
  if (method === 'GET' && path === '/settings') return out(SETTINGS);
  if (method === 'GET' && path === '/send-channels') return out({ email: false, whatsapp: false });
  // today's dollar rate: kept in memory like the rest of the sample data (the real API stores it)
  if (path === '/fx-rate') {
    if (method === 'PUT') {
      const rate = Number(b.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new ApiError(400, 'validation_error', 'Please check the highlighted fields.', { rate: 'Enter the rupees for one dollar, for example 83.45.' });
      MOCK_FX.rate = rate.toFixed(4); MOCK_FX.rate_date = today(); MOCK_FX.updated_by_name = ME.full_name; MOCK_FX.updated_at = new Date().toISOString(); MOCK_FX.is_today = true;
    }
    return out(MOCK_FX);
  }
  if (method === 'GET' && path === '/dashboard') return out(dashboard());

  // ---- daily rates: new per-kg rates for several grades (the real API also writes the history) ----
  if (seg[0] === 'daily-rates' && method === 'PUT') {
    const changed: Product[] = [];
    for (const r of ((b as { rates?: { id: string; ref_rate_usd: string | null; ref_rate_inr: string | null }[] }).rates ?? [])) {
      const x = PRODUCTS.find((y) => y.id === r.id);
      if (!x || x.archived) continue;
      const fix = (v: string | null) => (v ? Number(v).toFixed(2) : null);
      Object.assign(x, { ref_rate_usd: fix(r.ref_rate_usd), ref_rate_inr: fix(r.ref_rate_inr), rate_date: today(), updated_at: new Date().toISOString() });
      changed.push(x);
    }
    return out({ data: changed, skipped: [] });
  }

  // ---- products ----
  if (seg[0] === 'products') {
    if (method === 'GET' && seg.length === 1) {
      const q = (params.get('q') ?? '').toLowerCase();
      const archived = params.get('archived') ?? 'false';
      return out({ data: PRODUCTS.filter((p) => (archived === 'all' || p.archived === (archived === 'true')) && (!q || p.name.toLowerCase().includes(q) || (p.grade ?? '').toLowerCase().includes(q))) });
    }
    if (method === 'GET' && seg[2] === 'rate-history') {
      const x = PRODUCTS.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      return out({ data: x.rate_date ? [{ date: x.rate_date, ref_rate_usd: x.ref_rate_usd, ref_rate_inr: x.ref_rate_inr, set_by_name: ME.full_name, set_at: new Date().toISOString() }] : [] });
    }
    if (method === 'DELETE' && seg.length === 2) {
      const i = PRODUCTS.findIndex((x) => x.id === seg[1]);
      if (i < 0) throw notFound();
      if (params.get('permanent') === '1') { PRODUCTS.splice(i, 1); return out({ deleted: true, product: null }); }
      PRODUCTS[i]!.archived = true;
      return out(PRODUCTS[i]);
    }
    if (method === 'GET' && seg[2] === 'price-hints') return out({ currency: params.get('currency') ?? 'USD', last_to_buyer: null, last_to_anyone: null, reference: null });
    if (method === 'POST' && seg.length === 1) {
      const p = { ...(b as unknown as Product), id: newId('p'), archived: false, updated_at: new Date().toISOString() } as Product;
      PRODUCTS.push(p);
      return out(p);
    }
    if (method === 'PATCH' && seg.length === 2) {
      const p = PRODUCTS.find((x) => x.id === seg[1]);
      if (!p) throw notFound();
      Object.assign(p, b, { updated_at: new Date().toISOString() });
      return out(p);
    }
  }

  // ---- partners (sample data; the real API also hides rates from sales users, the sample has none) ----
  if (seg[0] === 'partners') {
    const find = () => { const x = PARTNERS.find((y) => y.id === seg[1]); if (!x) throw notFound(); return x; };
    if (method === 'GET' && seg.length === 1) {
      const q = (params.get('q') ?? '').toLowerCase();
      const archived = params.get('archived') ?? 'false';
      return out({ data: PARTNERS.filter((x) => (archived === 'all' || x.archived === (archived === 'true')) && (!params.get('role') || x.roles.includes(params.get('role') as never)) && (!params.get('status') || x.status === params.get('status')) && (!q || [x.company_name, x.partner_code, x.city].some((f) => f?.toLowerCase().includes(q)))) });
    }
    if (method === 'GET' && seg.length === 2) return out(find());
    if (method === 'POST' && seg.length === 1) {
      const created = { ...PARTNERS[0]!, legal_name: null, email: null, phone: null, city: null, state: null, contacts: [], services: [], activities: [], last_interaction: null, activity_count: 0, status: 'active', ...(b as object), id: newId('pt'), partner_code: `PTY-${String(PARTNERS.length + 1).padStart(4, '0')}`, archived: false } as unknown as typeof PARTNERS[number];
      PARTNERS.unshift(created);
      return out(created);
    }
    if (method === 'PATCH' && seg.length === 2) { Object.assign(find(), b); return out(find()); }
    if (method === 'POST' && seg[2] === 'activities') {
      const x = find();
      const a = { id: newId('pa'), user_id: ME.id, user_name: ME.full_name, happened_at: new Date().toISOString(), ...(b as object) } as PartnerDetailActivity;
      x.activities.unshift(a); x.activity_count = x.activities.length; x.last_interaction = a.happened_at;
      return out(a);
    }
  }

  // ---- inquiries ----
  if (seg[0] === 'inquiries') {
    const nameOf = (id: string) => BUYERS.find((x) => x.id === id)?.company_name ?? '';
    if (method === 'GET' && seg.length === 1) {
      const q = (params.get('q') ?? '').toLowerCase();
      const archived = params.get('archived') ?? 'false';
      const rows = INQUIRIES.filter((x) =>
        (archived === 'all' || x.archived === (archived === 'true')) && (!params.get('status') || x.status === params.get('status')) && (!params.get('buyer_id') || x.buyer_id === params.get('buyer_id')) &&
        (!params.get('product') || x.products.some((p) => p.product_name === params.get('product'))) && (!params.get('assigned_to') || x.assigned_to === params.get('assigned_to')) &&
        (!params.get('due') || (!!x.next_followup && x.next_followup <= today() && ['new', 'reviewing', 'quoted'].includes(x.status))) &&
        (!q || [x.inquiry_code, x.buyer_name, x.destination_country, x.destination_port, ...x.products.map((p) => p.product_name)].some((f) => f?.toLowerCase().includes(q))));
      return out({ data: [...rows].sort((a, b) => b.inquiry_date.localeCompare(a.inquiry_date)) });
    }
    if (method === 'GET' && seg.length === 2) {
      const x = INQUIRIES.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      const detail: InquiryDetail = { ...x, quotes: x.id === 'i1' ? QUOTES.filter((qq) => qq.id === 'q2').map(listRow) : [], assigned_name: x.assigned_to ? 'Demo User' : null };
      return out(detail);
    }
    if (method === 'POST' && seg.length === 1) {
      const created = { inquiry_date: today(), destination_country: null, destination_port: null, currency: null, incoterm: null, source: null, original_message: null, status: 'new', assigned_to: null, next_followup: null, notes: null,
        ...(b as object), id: newId('i'), inquiry_code: `INQ-${String(INQUIRIES.length + 1).padStart(4, '0')}`, buyer_name: nameOf((b as { buyer_id: string }).buyer_id), archived: false, quote_count: 0 } as Inquiry;
      INQUIRIES.unshift(created);
      return out(created);
    }
    if ((method === 'PATCH' || method === 'DELETE') && seg.length === 2) {
      const x = INQUIRIES.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      Object.assign(x, method === 'DELETE' ? { archived: true } : b);
      x.buyer_name = nameOf(x.buyer_id);
      return out(x);
    }
  }

  // ---- buyers ----
  if (seg[0] === 'buyers') {
    if (method === 'GET' && seg.length === 1) {
      const q = (params.get('q') ?? '').toLowerCase();
      const archived = params.get('archived') ?? 'false';
      const rows = BUYERS.filter((x) =>
        (archived === 'all' || x.archived === (archived === 'true')) &&
        (!params.get('type') || x.type === params.get('type')) &&
        (!params.get('stage') || x.stage === params.get('stage')) &&
        (!q || [x.company_name, x.city, x.country, x.email].some((f) => f?.toLowerCase().includes(q))));
      return out({ data: rows });
    }
    if (method === 'GET' && seg[1] === 'summary') return out(summary());
    if (method === 'GET' && seg.length === 2) {
      const x = BUYERS.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      const mine = QUOTES.filter((q) => q.buyer_id === x.id);
      const detail: BuyerDetail = {
        ...x, quotes: mine.map(listRow), activities: BUYER_ACTIVITIES.get(x.id) ?? [], assigned_name: 'Demo User',
        performance: { quotes_issued: mine.filter((q) => q.status !== 'draft').length, won: mine.filter((q) => q.status === 'won').length, lost: mine.filter((q) => q.status === 'lost').length, by_currency: [] },
      };
      return out(detail);
    }
    if (method === 'POST' && seg.length === 1) {
      const created = { ...BUYERS[0]!, ...(b as object), id: newId('b'), buyer_code: `BUY-${String(BUYERS.length + 1).padStart(4, '0')}`, archived: false, quote_count: 0, open_quotes: 0, last_contact_at: null } as Buyer;
      BUYERS.unshift(created);
      return out(created);
    }
    if (method === 'PATCH' && seg.length === 2) {
      const x = BUYERS.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      Object.assign(x, b);
      return out(x);
    }
  }

  // POST /buyers/:id/activities: a logged contact (call, WhatsApp, e-mail, meeting, note). Updates the buyer's last contact,
  // like the real API will (docs/DOMAIN-SPEC.md: activities with a buyer_id, buyers.last_contacted_at).
  if (seg[0] === 'buyers' && seg.length === 3 && seg[2] === 'activities' && method === 'POST') {
    const x = BUYERS.find((y) => y.id === seg[1]);
    if (!x) throw notFound();
    const entry = { id: newId('a'), kind: (b.kind as 'note') ?? 'note', body: String(b.body ?? ''), happened_at: new Date().toISOString(), quote_id: null, quote_no: null, user_name: ME.full_name };
    BUYER_ACTIVITIES.set(x.id, [entry, ...(BUYER_ACTIVITIES.get(x.id) ?? [])]);
    x.last_contact_at = entry.happened_at;
    return out(x);
  }

  // ---- quotes ----
  if (seg[0] === 'quotes') {
    if (method === 'GET' && seg.length === 1) {
      const q = (params.get('q') ?? '').toLowerCase();
      const rows = QUOTES.map(listRow).filter((r) =>
        (!params.get('status') || r.status === params.get('status')) &&
        (!params.get('type') || r.type === params.get('type')) &&
        (!params.get('buyer_id') || r.buyer_id === params.get('buyer_id')) &&
        (!q || (r.number ?? '').toLowerCase().includes(q) || r.buyer_name.toLowerCase().includes(q)));
      const limit = Number(params.get('limit') ?? 50);
      const offset = Number(params.get('offset') ?? 0);
      return out({ data: rows.slice(offset, offset + limit), total: rows.length, limit, offset });
    }
    if (method === 'POST' && seg[1] === 'calculate') return out(calc());
    if (method === 'GET' && seg.length === 2) {
      const x = QUOTES.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      return out(x);
    }
    if (method === 'PATCH' && seg[2] === 'status') {
      const x = QUOTES.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      x.status = b.status as QuoteDetail['status'];
      if (typeof b.lost_reason === 'string') x.lost_reason = b.lost_reason;
      return out(x);
    }
    if (method === 'PATCH' && seg[2] === 'followup') {
      const x = QUOTES.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      x.next_followup = (b.next_followup as string | null) ?? null;
      return out(x);
    }
    if (method === 'POST' && seg[2] === 'activities') {
      const x = QUOTES.find((y) => y.id === seg[1]);
      if (!x) throw notFound();
      x.activities.unshift({ id: newId('a'), kind: (b.kind as 'note') ?? 'note', body: String(b.body ?? ''), happened_at: new Date().toISOString(), user_id: ME.id, user_name: ME.full_name });
      return out(x);
    }
    if (method === 'DELETE' && seg.length === 2) {
      const i = QUOTES.findIndex((y) => y.id === seg[1]);
      if (i < 0) throw notFound();
      QUOTES.splice(i, 1);
      return undefined as T;
    }
  }

  throw needsApi(method, path);
}
