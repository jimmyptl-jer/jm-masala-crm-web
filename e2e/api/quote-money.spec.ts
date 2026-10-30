/**
 * QA, API: money rules that must hold for ANY quote. Randomly generated quotes (property-based, fast-check) are sent to the real
 * POST /quotes/calculate and the answers are checked against independent arithmetic (decimal.js) and against rules that must always be true.
 * Quantities have up to 3 decimals, rates 2, GST rates are the real Indian slabs and discounts go up to the whole products total.
 * Nothing is saved by /quotes/calculate. The tests make test buyers and products (archived at the end) and set today's dollar rate to
 * 83.45 for the run (the earlier rate, if there was one, is put back). Domestic tests need the company's GST state code in Settings.
 */
import { expect, test } from '@playwright/test';
import { Decimal } from 'decimal.js';
import fc from 'fast-check';
import { call, cleanUp, makeBuyer, makeProduct, tokenOf } from '../qa';

const D = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP, precision: 30 });
const RUNS = { numRuns: 20 };
const RATE = '83.45';
const SLABS = ['0', '5', '12', '18', '28'] as const;

test.describe.configure({ mode: 'serial' });

let token = '';
const toClean: { buyers: string[]; products: string[] } = { buyers: [], products: [] };
const productBySlab: Record<string, string> = {};
let exportBuyer = '';
let sameStateBuyer = '';
let otherStateBuyer = '';
let companyState = '';
let rateBefore: string | null = null;

test.beforeAll(async ({ request }) => {
  token = await tokenOf('admin');
  for (const slab of SLABS) {
    const p = await makeProduct(request, token, slab);
    productBySlab[slab] = p.id;
    toClean.products.push(p.id);
  }
  const buyer = await makeBuyer(request, token);
  exportBuyer = buyer.id;
  toClean.buyers.push(buyer.id);

  companyState = (await (await call(request, token, 'GET', '/settings')).json()).company?.state_code ?? '';
  if (companyState) {
    const domestic = { type: 'domestic', country: null, default_incoterm: null, default_port: null, default_currency: 'INR', state: 'Test state', city: 'Test city' };
    const same = await makeBuyer(request, token, { ...domestic, state_code: companyState });
    const other = await makeBuyer(request, token, { ...domestic, state_code: companyState === '27' ? '29' : '27' });
    sameStateBuyer = same.id; otherStateBuyer = other.id;
    toClean.buyers.push(same.id, other.id);
  }

  rateBefore = (await (await call(request, token, 'GET', '/fx-rate')).json()).rate;
  const set = await call(request, token, 'PUT', '/fx-rate', { rate: RATE });
  expect(set.status()).toBe(200);
});

test.afterAll(async ({ request }) => {
  if (rateBefore) await call(request, token, 'PUT', '/fx-rate', { rate: rateBefore });
  await cleanUp(request, token, toClean);
});

// ---- generators ----
const qty = fc.integer({ min: 1, max: 5_000_000 }).map((n) => (n / 1000).toFixed(3));
const rate = fc.integer({ min: 1, max: 50_000_000 }).map((n) => (n / 100).toFixed(2));
const line = fc.record({ quantity: qty, rate, slab: fc.constantFrom(...SLABS), cost: fc.option(rate, { nil: null }) });
const lines = fc.array(line, { minLength: 1, maxLength: 5 });
const pct = fc.integer({ min: 0, max: 100 });
const money = fc.integer({ min: 0, max: 5_000_000 }).map((n) => (n / 100).toFixed(2));
type Line = { quantity: string; rate: string; slab: string; cost: string | null };

const amountOf = (l: Line) => D(l.quantity).times(l.rate).toDecimalPlaces(2);
const subtotalOf = (ls: Line[]) => ls.reduce((a, l) => a.plus(amountOf(l)), D(0));
/** The discount that is this percent of the products total, to the cent (never more than the total). */
const discountOf = (ls: Line[], p: number) => subtotalOf(ls).times(p).div(100).toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2);

/** Asks the API for the totals of a generated quote. */
async function calc(request: Parameters<typeof call>[0], buyer: string, ls: Line[], extra: Record<string, unknown> = {}) {
  const res = await call(request, token, 'POST', '/quotes/calculate', {
    buyer_id: buyer, ...extra, lines: ls.map((l) => ({ product_id: productBySlab[l.slab], quantity: l.quantity, rate: l.rate, ...(l.cost ? { cost_rate: l.cost } : {}) })),
  });
  if (res.status() !== 200) throw new Error(`calculate answered ${res.status()}: ${await res.text()}`);
  return (await res.json()) as {
    lines: { amount: string; gst_rate: string; cgst: string; sgst: string; igst: string; margin: string | null }[]; subtotal: string; discount: string; freight: string; insurance: string; gst_total: string; round_off: string;
    grand_total: string; amount_words: string; equivalent: { currency: string; amount: string; rate: string } | null; tax_mode: string; margin: { total: string | null; pct: string | null; complete: boolean }; currency: string; warnings: string[];
  };
}

test.describe('export quotes', () => {
  test('the line amounts add up to the subtotal, to the cent, and match independent arithmetic', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, async (ls) => {
      const out = await calc(request, exportBuyer, ls);
      expect(out.lines.map((l) => l.amount)).toEqual(ls.map((l) => amountOf(l).toFixed(2)));
      expect(out.subtotal).toBe(subtotalOf(ls).toFixed(2));
    }), RUNS);
  });

  test('total = subtotal - discount + freight + insurance, with no GST and no round-off', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, pct, money, money, async (ls, p, freight, insurance) => {
      const out = await calc(request, exportBuyer, ls, { incoterm: 'CIF', discount: discountOf(ls, p), freight, insurance });
      expect(out.gst_total).toBe('0.00');
      expect(out.tax_mode).toBe('none');
      expect(out.round_off).toBe('0.00');
      expect(D(out.grand_total).toFixed(2)).toBe(D(out.subtotal).minus(out.discount).plus(out.freight).plus(out.insurance).toFixed(2));
    }), RUNS);
  });

  test('freight and insurance count only for CFR and CIF', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, money, money, fc.constantFrom('FOB', 'EXW', 'CIF', 'CFR'), async (ls, freight, insurance, incoterm) => {
      const out = await calc(request, exportBuyer, ls, { incoterm, freight, insurance });
      const charged = incoterm === 'CIF' || incoterm === 'CFR';
      expect(out.freight).toBe(charged ? D(freight).toFixed(2) : '0.00');
      expect(out.insurance).toBe(charged ? D(insurance).toFixed(2) : '0.00');
    }), RUNS);
  });

  test('a discount larger than the products total is cut back with a warning; the total is never negative', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, money, async (ls, discount) => {
      const out = await calc(request, exportBuyer, ls, { incoterm: 'FOB', discount });
      expect(D(out.discount).lte(out.subtotal)).toBe(true);
      expect(D(out.grand_total).gte(0)).toBe(true);
      if (D(discount).gt(out.subtotal)) expect(out.warnings.join(' ')).toMatch(/discount/i);
    }), RUNS);
  });

  test('the same quote always gives the same answer; the order of the lines does not change the subtotal', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, async (ls) => {
      const a = await calc(request, exportBuyer, ls);
      expect(await calc(request, exportBuyer, ls)).toEqual(a);
      expect((await calc(request, exportBuyer, [...ls].reverse())).subtotal).toBe(a.subtotal);
    }), RUNS);
  });
});

test.describe('domestic quotes (GST)', () => {
  test.beforeEach(() => { test.skip(!companyState, 'The company GST state code is not set in Settings, so domestic GST cannot be tested.'); });

  test('same state: CGST and SGST (equal to the paisa), no IGST', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, pct, async (ls, p) => {
      const out = await calc(request, sameStateBuyer, ls, { discount: discountOf(ls, p) });
      expect(out.tax_mode).toBe('intra');
      for (const l of out.lines) { expect(l.igst).toBe('0.00'); expect(D(l.cgst).minus(l.sgst).abs().lte('0.01')).toBe(true); }
    }), RUNS);
  });

  test('another state: IGST only', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, async (ls) => {
      const out = await calc(request, otherStateBuyer, ls);
      expect(out.tax_mode).toBe('inter');
      for (const l of out.lines) { expect(l.cgst).toBe('0.00'); expect(l.sgst).toBe('0.00'); }
    }), RUNS);
  });

  test('the GST of the lines adds up to the GST total, and each line uses its product\'s slab', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, pct, async (ls, p) => {
      const out = await calc(request, sameStateBuyer, ls, { discount: discountOf(ls, p) });
      expect(out.lines.reduce((a, l) => a.plus(l.cgst).plus(l.sgst).plus(l.igst), D(0)).toFixed(2)).toBe(out.gst_total);
      out.lines.forEach((l, i) => expect(Number(l.gst_rate)).toBe(Number(ls[i]!.slab)));
    }), RUNS);
  });

  test('the total is a whole rupee, and total - round-off = taxable value + GST exactly', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, pct, async (ls, p) => {
      const out = await calc(request, sameStateBuyer, ls, { discount: discountOf(ls, p) });
      expect(D(out.grand_total).isInteger()).toBe(true);
      expect(D(out.round_off).abs().lte('0.50')).toBe(true);
      expect(D(out.grand_total).minus(out.round_off).toFixed(2)).toBe(D(out.subtotal).minus(out.discount).plus(out.gst_total).toFixed(2));
    }), RUNS);
  });

  test('a domestic quote has no freight or insurance whatever was typed, and is always INR', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, money, money, async (ls, freight, insurance) => {
      const out = await calc(request, sameStateBuyer, ls, { freight, insurance, incoterm: 'CIF', currency: 'USD' });
      expect(out.freight).toBe('0.00');
      expect(out.insurance).toBe('0.00');
      expect(out.currency).toBe('INR');
    }), RUNS);
  });
});

test.describe("today's dollar rate and margin", () => {
  test('a USD total is also shown in rupees at the rate to the paisa, and the amounts do not depend on the rate', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, async (ls) => {
      const out = await calc(request, exportBuyer, ls);
      expect(out.equivalent).toEqual({ currency: 'INR', amount: D(out.grand_total).times(RATE).toDecimalPlaces(2).toFixed(2), rate: `${RATE}00` });
      expect(out.subtotal).toBe(subtotalOf(ls).toFixed(2));
    }), RUNS);
  });

  test('margin on a USD quote converts the rupee cost at the rate; "complete" only when every line has a cost', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, async (ls) => {
      const out = await calc(request, exportBuyer, ls, { incoterm: 'FOB' });
      const costed = ls.filter((l) => l.cost !== null);
      expect(out.margin.complete).toBe(costed.length === ls.length);
      if (costed.length === 0) { expect(out.margin.total).toBeNull(); return; }
      const each = ls.map((l) => (l.cost === null ? null : D(l.rate).minus(D(l.cost).div(RATE)).times(l.quantity).toDecimalPlaces(2)));
      expect(out.lines.map((l) => l.margin)).toEqual(each.map((m) => (m === null ? null : m.toFixed(2))));
      expect(out.margin.total).toBe(each.reduce<Decimal>((a, m) => (m === null ? a : a.plus(m)), D(0)).toDecimalPlaces(2).toFixed(2));
    }), RUNS);
  });

  test('the dollar rate is shared: a change by one call is seen by the next, and a bad rate is refused', async ({ request }) => {
    for (const bad of ['0', '-5', 'abc', '', '83.123456', '5000']) {
      const res = await call(request, token, 'PUT', '/fx-rate', { rate: bad });
      expect(res.status(), bad).toBe(400);
      expect((await res.json()).error.fields.rate, bad).toBeTruthy();
    }
    expect((await call(request, token, 'PUT', '/fx-rate', { rate: '90' })).status()).toBe(200);
    const out = await calc(request, exportBuyer, [{ quantity: '1.000', rate: '100.00', slab: '0', cost: null }]);
    expect(out.equivalent?.amount).toBe('9000.00');
    await call(request, token, 'PUT', '/fx-rate', { rate: RATE });
  });
});

test.describe('amount in words', () => {
  test('is never empty, names the currency and ends with Only', async ({ request }) => {
    await fc.assert(fc.asyncProperty(lines, async (ls) => {
      const out = await calc(request, exportBuyer, ls, { currency: 'USD' });
      expect(out.amount_words).toMatch(/^US Dollars .+ Only$/);
      expect(out.amount_words).not.toMatch(/undefined|NaN|\s{2,}/);
    }), RUNS);
  });

  test('matches the sample quotation: 13 MT at 2630 plus 1 MT at 2735 is US Dollars Thirty-Six Thousand Nine Hundred Twenty-Five Only', async ({ request }) => {
    const out = await calc(request, exportBuyer, [{ quantity: '13.000', rate: '2630.00', slab: '0', cost: null }, { quantity: '1.000', rate: '2735.00', slab: '0', cost: null }], { incoterm: 'FOB' });
    expect(out.grand_total).toBe('36925.00');
    expect(out.amount_words).toBe('US Dollars Thirty-Six Thousand Nine Hundred Twenty-Five Only');
  });
});

test.describe('bad input is refused with a message, never a crash', () => {
  const body = (over: Record<string, unknown>) => ({ buyer_id: exportBuyer, lines: [{ product_id: productBySlab['5'], quantity: '1', rate: '10' }], ...over });

  test('quantities and rates that are zero, negative, text or too precise', async ({ request }) => {
    for (const [field, value] of [['quantity', '0'], ['quantity', '-1'], ['quantity', 'abc'], ['quantity', '1.2345'], ['rate', '0'], ['rate', '-3'], ['rate', '1.234'], ['rate', '']] as const) {
      const res = await call(request, token, 'POST', '/quotes/calculate', body({ lines: [{ product_id: productBySlab['5'], quantity: '1', rate: '10', [field]: value }] }));
      expect(res.status(), `${field}=${value}`).toBe(400);
      expect(Object.keys((await res.json()).error.fields).join()).toContain(field);
    }
  });

  test('an unknown product, an unknown buyer, too many lines and a wrong shape', async ({ request }) => {
    const ghost = '0'.repeat(24);
    expect((await call(request, token, 'POST', '/quotes/calculate', body({ lines: [{ product_id: ghost, quantity: '1', rate: '10' }] }))).status()).toBe(400);
    expect((await call(request, token, 'POST', '/quotes/calculate', body({ buyer_id: ghost }))).status()).toBe(400);
    expect((await call(request, token, 'POST', '/quotes/calculate', body({ lines: Array.from({ length: 51 }, () => ({ product_id: productBySlab['5'], quantity: '1', rate: '1' })) }))).status()).toBe(400);
    for (const bad of [{ lines: 'nope' }, { lines: [null] }, { buyer_id: 12 }, { discount: 'x' }, { validity_days: 0 }]) {
      const res = await call(request, token, 'POST', '/quotes/calculate', body(bad));
      expect(res.status(), JSON.stringify(bad)).toBe(400);
    }
  });
});
