/**
 * Live preview of the quotation on the right of the quote form (wide screens) and under the form (phones): the
 * real quotation document (letterhead + predefined layout, components/quote/QuoteDocument.tsx) filled from the
 * form and the totals returned by POST /quotes/calculate. "Download PDF" prints the document to PDF through the
 * browser; the issued PDF that goes into the e-mail is made by the API from the saved revision in the same layout
 * (docs/QUOTE-DOCUMENT.md).
 * Pure presentation: no amount is worked out here (only the API does money maths) and nothing staff-only (cost
 * rate, margin) is ever shown.
 */
import { Download } from 'lucide-react';
import { createPortal } from 'react-dom';
import { QuoteDocument, ScaledPage, type QuoteDocData } from '@/components/quote/QuoteDocument';
import { Button } from '@/components/ui';
import { addDays, money, qty, todayIST } from '@/lib/format';
import type { Buyer, CalcResult, Currency, Product, Settings } from '@/lib/types';
import { standardTerms } from '@/lib/quoteTerms';
import type { FormState } from './model';
import { t } from '@/strings';

const s = t.quoteForm;

/** 'YYYY-MM-DD' -> '28.10.2026', the date style of the quotation. */
const dotted = (ymd: string) => ymd.split('-').reverse().join('.');

/**
 * Turns the form, the buyer, the products, the settings and the calculation into the data the document shows.
 * Exported so the same mapping can be checked or reused.
 */
export function buildDocData({ settings, buyer, form, products, calc, lineAmount, currency, number }: {
  settings?: Settings; buyer?: Buyer; form: FormState; products: Map<string, Product>; calc?: CalcResult;
  lineAmount: (uid: string) => string | undefined; currency: Currency; number?: string | null;
}): QuoteDocData {
  const lines = form.lines.filter((l) => l.product_id);
  const units = [...new Set(lines.map((l) => products.get(l.product_id)?.unit).filter(Boolean))];
  const unit = units.length === 1 ? units[0] : null;
  const today = todayIST();
  const days = Number(form.validity);
  const port = form.port_discharge || form.port_loading;
  const details: [string, string][] = [];
  if (form.type === 'export' && form.incoterm) details.push(['Price Basis', [form.incoterm, port].filter(Boolean).join(' ')]);
  if (form.type === 'export' && form.port_loading) details.push(['Port of Loading', form.port_loading]);
  details.push(['Currency', currency]);

  const summary: [string, string][] = [];
  const add = (label: string, v: string | undefined, always = false) => { if (v && (always || Number(v) !== 0)) summary.push([label, money(v, currency, { symbol: false })]); };
  if (calc && (Number(calc.discount) || Number(calc.freight) || Number(calc.insurance) || Number(calc.gst_total))) {
    add(s.previewSubtotal, calc.subtotal, true); add(s.previewDiscount, calc.discount); add(s.previewFreight, calc.freight);
    add(s.previewInsurance, calc.insurance); add(s.previewGst, calc.gst_total);
  }

  const bank = settings?.bank;
  // standard clauses written into the code (lib/quoteTerms.ts); a quote's own edited list, if it has one, wins
  const terms = form.terms
    ? form.terms.map((text) => ({ label: null, text }))
    : standardTerms({ type: form.type, incoterm: form.incoterm, port, paymentTerms: form.payment_terms, deliveryTime: form.delivery_time });
  const co = settings?.company;
  const pairs = (list: [string, string | undefined][]) => list.filter((x): x is [string, string] => !!x[1]);
  const licences = [
    pairs([['GSTIN', co?.gstin], ['IEC', co?.iec], ['FSSAI CENTRAL LIC.', co?.fssai]]),
    pairs([['SPICES BOARD CRES', co?.cres], ['APEDA RCMC', co?.rcmc]]),
  ].filter((row) => row.length > 0);
  return {
    company: {
      name: co?.letterhead_name || co?.name || '', office: co?.address ?? '', phone: co?.phone ?? '', email: co?.email ?? '', web: co?.website ?? '', licences,
      signatory: { name: co?.signatory_name ?? '', title: co?.signatory_title ?? '' },
    },
    number: number ?? null,
    date: dotted(today),
    validUntil: Number.isFinite(days) && days > 0 ? `${dotted(addDays(today, days))} (${days} days)` : null,
    buyer: {
      name: buyer?.company_name ?? '—',
      lines: [buyer?.address, [buyer?.city, buyer?.country || buyer?.state].filter(Boolean).join(', ')].filter((x): x is string => !!x),
      attn: buyer?.contact_name ? `Attn: ${buyer.contact_name}${buyer.phone ? ` | Tel: ${buyer.phone}` : ''}` : null,
      email: buyer?.email ?? null,
    },
    details,
    qtyHead: unit ? `Qty (${unit})` : 'Qty',
    rateHead: unit ? `Rate (${currency}/${unit})` : `Rate (${currency})`,
    amountHead: `Amount (${currency})`,
    lines: lines.map((l) => {
      const p = products.get(l.product_id);
      const spec = p?.specification ?? ([p?.cleaning, p?.purity && `${p.purity} purity`, p?.moisture && `Moisture ${p.moisture}`].filter(Boolean).join(', ') || null);
      return {
        name: `${p?.name ?? '—'}${p?.grade ? ` – ${p.grade}` : ''}`, spec,
        hsn: (form.type === 'domestic' ? p?.hsn_code : p?.hs_code) ?? null, packing: l.packing || null,
        qty: l.quantity ? qty(l.quantity) : '—', rate: l.rate ? money(l.rate, currency, { symbol: false }) : '—',
        amount: lineAmount(l.uid) ? money(lineAmount(l.uid), currency, { symbol: false }) : '—',
      };
    }),
    summary,
    total: calc ? money(calc.grand_total, currency, { symbol: false }) : null,
    amountWords: calc?.amount_words || null,
    terms,
    bank: bank ? ([['Beneficiary', bank.beneficiary || settings?.company.name || ''], ['Bank', bank.bank_name], ['Branch', bank.branch], ['Account No.', bank.account_no], ['IFSC', bank.ifsc], ['SWIFT', bank.swift]] as [string, string][]).filter(([, v]) => !!v) : [],
    notes: form.notes || null,
  };
}

/** @param props - see buildDocData. */
export function QuotePreview(props: Parameters<typeof buildDocData>[0]) {
  const data = buildDocData(props);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button variant="secondary" className="px-3 text-sm" onClick={() => window.print()}><Download className="h-4 w-4" aria-hidden />{s.previewDownload}</Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <ScaledPage><QuoteDocument data={data} /></ScaledPage>
      </div>
      <p className="mt-2 text-xs text-slate-500">{s.previewPrintHint}</p>
      {/* full-size copy directly under <body>, shown only when printing (see index.css), so no parent can shift it */}
      {createPortal(<div className="quote-print-root"><QuoteDocument data={data} /></div>, document.body)}
    </div>
  );
}
