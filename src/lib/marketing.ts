/**
 * Marketing helpers shared by the Marketing screens: the template and file kinds, an empty audience, the variables a
 * message may use, and small formatting helpers. No API calls and no sending: audiences are resolved by the API
 * (POST /marketing/audience/preview), which is the single source of truth for who is eligible.
 */
import type { Audience, AssetKind, CampaignInput, TemplateKind } from './types';

/** Template kinds in the order they are offered. */
export const TEMPLATE_KINDS: TemplateKind[] = ['company_intro', 'catalogue', 'product_promo', 'new_crop', 'price_update', 'followup'];

/** File kinds in the order they are offered. */
export const ASSET_KINDS: AssetKind[] = ['catalogue', 'profile', 'image', 'other'];

/** Variables a message may contain; replaced per buyer when the e-mail is made. */
export const VARIABLES = ['{buyer_name}', '{company}', '{product}', '{salesperson}', '{our_company}'] as const;

/** An audience that includes every eligible buyer. */
export const ALL_BUYERS: Audience = {
  mode: 'all',
  filters: { type: 'all', countries: [], business_types: [], products: [], groups: [], qualified_only: false, open_quotes_only: false, inactive_days: null },
  buyer_ids: [],
};

/** A new, empty campaign (everything the composer starts from). */
export const emptyCampaign = (): CampaignInput => ({
  name: '', template_id: null, subject: '', body: '', cta_label: 'Request a Quotation',
  product_ids: [], asset_ids: [], include_product_images: true, audience: ALL_BUYERS,
});

/**
 * File size for people: 1.4 MB, 230 KB.
 * @param bytes — size in bytes.
 */
export const fileSize = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * True when the audience has any restriction (so the screen can say "filtered" rather than "all").
 * @param a — the audience.
 */
export function isFiltered(a: Audience): boolean {
  const f = a.filters;
  return a.mode !== 'all' && (a.mode === 'selected' || f.type !== 'all' || f.countries.length > 0 || f.business_types.length > 0 || f.products.length > 0
    || f.groups.length > 0 || f.qualified_only || f.open_quotes_only || f.inactive_days !== null);
}

/** The product name without its grade: "Cumin Seeds (Singapore 99 Sortex Clean)" -> "Cumin Seeds". */
export const baseName = (label: string) => label.replace(/\s*\(.*\)\s*$/, '').trim();

/**
 * A subject or message as it reads in lists: the sender's company name is filled in, the other {variables} are shown as
 * [buyer_name] etc. because they differ per buyer.
 * @param s — template wording.
 */
export const readable = (s: string) => s.replace(/\{our_company\}/g, 'JM Masala Trading LLP').replace(/\{(\w+)\}/g, '[$1]');
