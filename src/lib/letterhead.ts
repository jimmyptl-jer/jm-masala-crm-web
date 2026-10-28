/**
 * Brand text of the JM Masala letterhead that is not company data: the tagline and the closing note of a quotation.
 * Company data (name, address, contact, licences, signatory, bank) is never hard-coded: documents read it from
 * company settings (GET /settings, `Settings.company` / `Settings.bank`).
 */
export const LETTERHEAD = {
  tagline: 'Premium Indian Spices · Manufacturer, Processor & Exporter',
  footerNote: 'This is a commercial quotation and not a tax invoice. A Proforma Invoice will be issued on confirmation of order.',
} as const;

/** Images of the letterhead, served from web/public/letterhead (taken from the supplied letterhead PDF). */
export const LETTERHEAD_ASSETS = { logo: '/letterhead/logo.png', watercolour: '/letterhead/watercolour.jpg' } as const;
