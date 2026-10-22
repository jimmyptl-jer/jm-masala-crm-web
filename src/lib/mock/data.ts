/**
 * Sample data for the mock API (lib/mock/index.ts). EVERYTHING HERE IS INVENTED for UI work: the buyers,
 * quotes, rates and totals are not real, and the totals are typed in by hand because the web app never does
 * money maths (only the future API will). Replace this file's reader with real API calls step by step.
 */
import type { Buyer, Product, QuoteDetail, QuoteLine, Revision, Settings, Me, TeamMember, UserRow, Currency, QuoteStatus, QuoteType } from '../types';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();

export const ME: Me = { id: 'u1', email: 'demo@example.com', role: 'admin', full_name: 'Demo User', phone: null };
export const USERS: UserRow[] = [{ id: 'u1', full_name: 'Demo User', role: 'admin', phone: null, email: 'demo@example.com' }];
export const TEAM: TeamMember[] = [{ id: 'u1', full_name: 'Demo User' }];

export const SETTINGS: Settings = {
  company: { name: 'JM Masala Trading LLP', address: '', phone: '', email: '', iec: '', gstin: '', state: '', state_code: '' },
  bank: { bank_name: '', branch: '', account_no: '', ifsc: '', swift: '', ad_code: '' },
  export_terms: ['Sample term: prices are indicative.'],
  domestic_terms: ['Sample term: prices are indicative.'],
  validity_days: 15,
  followup_days: 3,
  logo_url: null,
};

const product = (id: string, name: string, hs: string, rateUsd: string): Product => ({
  id, name, grade: null, specification: null, cleaning: null, purity: null, moisture: null,
  hs_code: hs, hsn_code: null, gst_rate: '5.00', unit: 'MT', packing_options: [],
  ref_rate_usd: rateUsd, ref_rate_inr: null, archived: false, updated_at: iso(-10), image_path: null, image_url: null,
});

export const PRODUCTS: Product[] = [
  product('p1', 'Cumin Seeds', '090931', '2850.00'),
  product('p2', 'Coriander Seeds', '090921', '1150.00'),
  product('p3', 'Fennel Seeds', '090961', '1900.00'),
  product('p4', 'Turmeric Fingers', '091030', '1650.00'),
  product('p5', 'Sesame Seeds', '120740', '1700.00'),
  product('p6', 'Red Chilli', '090421', '1500.00'),
];

const buyer = (id: string, type: QuoteType, company: string, city: string, place: Partial<Buyer>): Buyer => ({
  id, type, company_name: company, contact_name: null, email: null, phone: null, whatsapp: null, address: null,
  city, country: null, state: null, state_code: null, gstin: null,
  default_currency: type === 'domestic' ? 'INR' : 'USD', default_incoterm: type === 'domestic' ? null : 'FOB', default_port: null,
  notes: null, archived: false, quote_count: 0, last_contact_at: null, open_quotes: 0,
  business_type: 'importer', designation: null, website: null, linkedin: null, registration_details: null,
  channel: 'direct', lead_source: null, source_detail: null, first_inquiry_date: day(-30), lead_cost: null,
  stage: 'new_lead', qualified: false, lost_reason: null, interested_products: [], requirements: null,
  next_action: null, next_followup: null, assigned_to: 'u1', marketing_opt_out: false, opted_out_at: null,
  ...place,
});

export const BUYERS: Buyer[] = [
  buyer('b1', 'export', 'Sample Foods GmbH', 'Hamburg', { country: 'Germany', stage: 'quotation_sent', qualified: true }),
  buyer('b2', 'export', 'Demo Spice Importers LLC', 'Dubai', { country: 'UAE', stage: 'negotiation', qualified: true, next_followup: day(0) }),
  buyer('b3', 'export', 'Example Trading Co', 'Rotterdam', { country: 'Netherlands', stage: 'won', qualified: true }),
  buyer('b4', 'export', 'Sample Wholesale Ltd', 'London', { country: 'United Kingdom', stage: 'lost', lost_reason: 'price' }),
  buyer('b5', 'domestic', 'Demo Masala Traders', 'Mumbai', { state: 'Maharashtra', state_code: '27', business_type: 'distributor', stage: 'quotation_sent', qualified: true }),
  buyer('b6', 'domestic', 'Sample Kirana Mart', 'Ahmedabad', { state: 'Gujarat', state_code: '24', business_type: 'retailer' }),
];

interface Seed { id: string; no: string | null; buyer: string; type: QuoteType; status: QuoteStatus; currency: Currency; ageDays: number;
  lines: { product: string; qty: string; rate: string; amount: string }[]; subtotal: string; gst: string; grand: string; words: string }

// Totals are typed in, not calculated (see the note at the top of this file).
const SEEDS: Seed[] = [
  { id: 'q1', no: 'Q-0001', buyer: 'b1', type: 'export', status: 'sent', currency: 'USD', ageDays: 4,
    lines: [{ product: 'p1', qty: '20.000', rate: '2850.00', amount: '57000.00' }], subtotal: '57000.00', gst: '0.00', grand: '57000.00', words: 'Sample amount in words' },
  { id: 'q2', no: 'Q-0002', buyer: 'b2', type: 'export', status: 'negotiating', currency: 'USD', ageDays: 9,
    lines: [{ product: 'p2', qty: '25.000', rate: '1150.00', amount: '28750.00' }, { product: 'p4', qty: '10.000', rate: '1650.00', amount: '16500.00' }],
    subtotal: '45250.00', gst: '0.00', grand: '45250.00', words: 'Sample amount in words' },
  { id: 'q3', no: 'Q-0003', buyer: 'b3', type: 'export', status: 'won', currency: 'USD', ageDays: 20,
    lines: [{ product: 'p3', qty: '18.000', rate: '1900.00', amount: '34200.00' }], subtotal: '34200.00', gst: '0.00', grand: '34200.00', words: 'Sample amount in words' },
  { id: 'q4', no: 'Q-0004', buyer: 'b4', type: 'export', status: 'lost', currency: 'USD', ageDays: 25,
    lines: [{ product: 'p5', qty: '15.000', rate: '1700.00', amount: '25500.00' }], subtotal: '25500.00', gst: '0.00', grand: '25500.00', words: 'Sample amount in words' },
  { id: 'q5', no: null, buyer: 'b1', type: 'export', status: 'draft', currency: 'USD', ageDays: 1,
    lines: [{ product: 'p6', qty: '12.000', rate: '1500.00', amount: '18000.00' }], subtotal: '18000.00', gst: '0.00', grand: '18000.00', words: '' },
  { id: 'q6', no: 'Q-0005', buyer: 'b5', type: 'domestic', status: 'sent', currency: 'INR', ageDays: 3,
    lines: [{ product: 'p1', qty: '2.000', rate: '265000.00', amount: '530000.00' }], subtotal: '530000.00', gst: '26500.00', grand: '556500.00', words: 'Sample amount in words' },
  { id: 'q7', no: 'Q-0006', buyer: 'b3', type: 'export', status: 'expired', currency: 'USD', ageDays: 40,
    lines: [{ product: 'p4', qty: '8.000', rate: '1650.00', amount: '13200.00' }], subtotal: '13200.00', gst: '0.00', grand: '13200.00', words: 'Sample amount in words' },
];

function build(s: Seed): QuoteDetail {
  const b = BUYERS.find((x) => x.id === s.buyer)!;
  const issued = s.status !== 'draft';
  const lines: QuoteLine[] = s.lines.map((l, i) => {
    const p = PRODUCTS.find((x) => x.id === l.product)!;
    return {
      id: `${s.id}-l${i}`, position: i, product_id: p.id, packing: null, quantity: l.qty, rate: l.rate, amount: l.amount,
      gst_rate: s.type === 'domestic' ? '5.00' : '0.00', cgst: '0.00', sgst: '0.00', igst: s.type === 'domestic' ? s.gst : '0.00', cost_rate: null,
      product: { id: p.id, name: p.name, grade: p.grade, specification: p.specification, hs_code: p.hs_code, hsn_code: p.hsn_code, unit: p.unit, gst_rate: p.gst_rate },
    };
  });
  const rev: Revision = {
    id: `${s.id}-r0`, quote_id: s.id, revision: 0, number: s.no, state: issued ? 'issued' : 'draft', currency: s.currency,
    incoterm: s.type === 'export' ? 'FOB' : null, port_loading: null, port_discharge: null, payment_terms: null, delivery_time: null,
    validity_days: 15, freight: '0.00', insurance: '0.00', discount: '0.00', subtotal: s.subtotal, gst_total: s.gst, round_off: '0.00',
    grand_total: s.grand, amount_words: issued ? s.words : null, notes: null, terms: SETTINGS.export_terms, pdf_ready: false,
    issued_at: issued ? iso(-s.ageDays) : null, issued_by_name: issued ? 'Demo User' : null, snapshot: null, lines, margin: null,
  };
  return {
    id: s.id, quote_no: s.no, number: s.no, type: s.type, status: s.status, lost_reason: s.status === 'lost' ? 'price' : null,
    current_revision: issued ? 0 : null, next_followup: s.status === 'sent' || s.status === 'negotiating' ? day(s.id === 'q2' ? 0 : 3) : null,
    valid_until: issued ? day(15 - s.ageDays) : null, grand_total: s.grand, currency: s.currency, buyer_id: b.id, buyer: b,
    created_by_name: 'Demo User', open_draft_revision: issued ? null : 0, revisions: [rev], activities: [],
  };
}

export const QUOTES: QuoteDetail[] = SEEDS.map(build);

// keep the per-buyer counters on the list rows in step with the sample quotes
for (const b of BUYERS) {
  const mine = QUOTES.filter((q) => q.buyer_id === b.id);
  b.quote_count = mine.length;
  b.open_quotes = mine.filter((q) => q.status === 'sent' || q.status === 'negotiating').length;
}
