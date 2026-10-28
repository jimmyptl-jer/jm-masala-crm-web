/**
 * Colour values for anything outside Tailwind: charts, the pipeline stage dots, the quotation document / PDF. The same
 * values are CSS variables in src/index.css and colour names in tailwind.config.js; keep the three identical
 * (DESIGN_SYSTEM.md, v2 Clean White + Paprika).
 */
export const colors = {
  paprika: '#C2410C', paprikaHover: '#A1350B', paprikaBg: '#FFF4ED',
  bg: '#FAFAF9', surface: '#FFFFFF', surfaceMuted: '#F5F5F4',
  border: '#E7E5E4', ink: '#1C1917', inkSecondary: '#44403C', inkMuted: '#78716C',
  success: '#15803D', warning: '#D97706', danger: '#BE123C', info: '#2563EB',
} as const;

/** Chart series colours, in this order. */
export const chartPalette = ['#C2410C', '#1C1917', '#0D9488', '#2563EB', '#D97706', '#7C3AED', '#15803D', '#A8A29E'];

/** Pipeline stage colours (dot in the column header, funnel segments). */
export const stageColors = {
  enquiry: '#78716C', sample_sent: '#2563EB', quotation: '#7C3AED', negotiation: '#D97706',
  pi_issued: '#C2410C', advance_received: '#0D9488', shipped: '#0369A1', fully_paid: '#15803D', lost: '#BE123C',
} as const;
export type StageColorKey = keyof typeof stageColors;

/**
 * PDFs (Quotation, PI) keep the letterhead look and may differ from the app: brown + gold, Cormorant titles, Lato body.
 * goldInk is the darker gold for small text, strip the pale band behind the licence numbers, ink and muted the PDF text colours.
 */
export const pdfBrand = {
  brown: '#583310', gold: '#B8862B', goldInk: '#9A6E20', strip: '#FDF8EC', ink: '#2B2118', muted: '#7A6A58',
  display: 'Cormorant Garamond', body: 'Lato',
} as const;
