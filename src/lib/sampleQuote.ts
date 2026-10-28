/**
 * Sample data for the quotation template (the data contract is QuoteDocData in components/quote/QuoteDocument.tsx). It is
 * the example quotation from the business's format file (Oman cumin order). The bank block uses placeholders on purpose:
 * real bank details come from company settings, never from the code. Used by the template preview page (/quotes/template).
 */
import type { QuoteDocData } from '@/components/quote/QuoteDocument';

export const SAMPLE_QUOTE: QuoteDocData = {
  company: {
    name: 'JM MASALA TRADING LLP',
    office: 'A-18, APMC Market Yard, Unjha, Mehsana District, Gujarat – 384170, India',
    phone: '+91 91067 66041 / +91 98245 10478',
    email: 'jmmasalaexports@gmail.com',
    web: 'jmmasalaexports.com',
    licences: [
      [['GSTIN', '24ATVPP8901F1ZA'], ['IEC', 'ATVPP8901F'], ['FSSAI CENTRAL LIC.', '10724998000373']],
      [['SPICES BOARD CRES', 'CRES/SBCB/22721/2024-2025'], ['APEDA RCMC', 'RCMC/APEDA/12788/2024-2025']],
    ],
    signatory: { name: 'ManojKumar K Patel', title: 'Authorised Signatory' },
  },
  number: 'JM/Q/001/2026-27',
  date: '28.10.2026',
  validUntil: '12.11.2026 (15 days)',
  buyer: {
    name: 'New Victory Mark LLC',
    lines: ['[Full address, P.O. Box]', 'Sultanate of Oman'],
    attn: 'Attn: [Contact person] | Tel: [+968 ...]',
    email: '[buyer@email.com]',
  },
  details: [
    ['Enquiry Ref.', 'Telephonic / Email'],
    ['Price Basis', 'CIF Sohar Port, Oman'],
    ['Port of Loading', 'Mundra, India'],
    ['Currency', 'USD'],
  ],
  qtyHead: 'Qty (MT)',
  rateHead: 'Rate (USD/MT)',
  amountHead: 'Amount (USD)',
  lines: [
    { name: 'Cumin Seeds (Whole)', spec: 'Premium Sortex Cleaned, 99.5% purity,\nEurope/Singapore grade', hsn: '09093100', packing: '25/50 kg PP bags', qty: '13.000', rate: '2,630.00', amount: '34,190.00' },
    { name: 'Cumin Seeds (Whole) – Pesticide Free', spec: 'Premium Sortex, 99.5% purity, lab tested', hsn: '09093100', packing: '25/50 kg PP bags', qty: '1.000', rate: '2,735.00', amount: '2,735.00' },
  ],
  summary: [],
  total: '36,925.00',
  amountWords: 'US Dollars Thirty-Six Thousand Nine Hundred Twenty-Five Only',
  terms: [
    { label: 'Price', text: 'CIF Sohar Port, Oman. Includes ocean freight and marine insurance up to port of discharge.' },
    { label: 'Payment', text: '100% TT in USD to our bank account: 20% on packing (video shared), 25% against scan copy of B/L, 55% against original B/L.' },
    { label: 'Shipment', text: 'Within 15–20 days from receipt of first advance payment.' },
    { label: 'Quality', text: 'As per specification above. Pre-shipment sample (200–300 g) on request. Quantity tolerance ±2%.' },
    { label: 'Documents', text: 'Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin, Phytosanitary Certificate, Lab Report (if required).' },
    { label: 'Validity', text: 'Prices valid until the date above; subject to market fluctuation thereafter.' },
  ],
  bank: [['Beneficiary', 'JM MASALA TRADING LLP'], ['Bank', '[Bank name, branch]'], ['Account No.', 'XXXXXXXXXXXXXX'], ['IFSC', 'XXXXXXXXXXX'], ['SWIFT', 'XXXXXXXX']],
  notes: null,
};
