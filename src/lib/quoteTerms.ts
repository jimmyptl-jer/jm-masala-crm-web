/**
 * The standard Terms & Conditions printed on the quotation PDF, written into the code on purpose (decision of
 * 29 Oct 2026) until the API provides terms templates (docs/DOMAIN-SPEC.md: terms_templates / terms_clauses /
 * document_terms with {{placeholders}}). The wording is the sample quotation format supplied by the business
 * (JM_Masala_Quotation_Format.pdf). Parts that depend on the quote (price basis, payment, shipment time, validity)
 * use the quote's own values when they are filled in and fall back to the standard text otherwise.
 * Pure text: no amounts are worked out here.
 */

/** One printed clause: a bold label and its text. */
export interface TermClause { label: string; text: string }

/** What the clauses need to know about the quote. */
export interface TermsContext {
  type: 'export' | 'domestic';
  incoterm: string;
  /** Port the price basis refers to (port of discharge for CIF/CFR, otherwise port of loading). */
  port: string;
  paymentTerms: string;
  deliveryTime: string;
}

const DEFAULT_PAYMENT = '100% TT in USD to our bank account: 20% on packing (video shared), 25% against scan copy of B/L, 55% against original B/L.';
const DEFAULT_SHIPMENT = 'Within 15–20 days from receipt of first advance payment.';

/** The "Price" clause for an incoterm. */
function priceClause(incoterm: string, port: string): string {
  const basis = [incoterm, port].filter(Boolean).join(' ');
  switch (incoterm) {
    case 'CIF': return `Price ${basis}. Includes ocean freight and marine insurance up to port of discharge.`;
    case 'CFR': return `Price ${basis}. Includes ocean freight up to port of discharge; marine insurance is the buyer's account.`;
    case 'FOB': return `Price ${basis}. Ocean freight and marine insurance are the buyer's account.`;
    case 'EXW': return `Price ${basis}. Buyer arranges loading, freight and insurance from our premises.`;
    default: return 'Prices as stated in this quotation.';
  }
}

/**
 * The standard clauses for a quote. Export: Price, Payment, Shipment, Quality, Documents, Validity. Domestic:
 * Payment, Delivery, Quality, Validity (no export documents or incoterm).
 */
export function standardTerms(c: TermsContext): TermClause[] {
  const payment = c.paymentTerms.trim() || (c.type === 'export' ? DEFAULT_PAYMENT : '');
  const quality = { label: 'Quality', text: 'As per specification above. Pre-shipment sample (200–300 g) on request. Quantity tolerance ±2%.' };
  const validity = { label: 'Validity', text: 'Prices valid until the date above; subject to market fluctuation thereafter.' };
  if (c.type === 'domestic') {
    return [
      ...(payment ? [{ label: 'Payment', text: payment }] : []),
      { label: 'Delivery', text: c.deliveryTime.trim() || 'As agreed on order confirmation.' },
      quality, validity,
    ];
  }
  return [
    { label: 'Price', text: priceClause(c.incoterm, c.port) },
    { label: 'Payment', text: payment },
    { label: 'Shipment', text: c.deliveryTime.trim() || DEFAULT_SHIPMENT },
    quality,
    { label: 'Documents', text: 'Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin, Phytosanitary Certificate, Lab Report (if required).' },
    validity,
  ];
}
