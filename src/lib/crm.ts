/**
 * Buyer CRM lists: the pipeline stages (in order, with the group each belongs to), lead channels and business
 * types. Only the KEYS live here; the words shown on screen are in strings/buyers.ts (t.buyers.crm.stages etc.).
 * The keys are the same text the API stores (api/src/schemas.ts STAGES / CHANNELS / BUSINESS_TYPES).
 * Pure data and one small helper; no API calls.
 */
import type { BusinessType, Channel, Stage } from './types';

/** Pipeline stages in the order a buyer normally moves through them; 'lost' is last. */
export const STAGES: Stage[] = [
  'new_lead', 'contacted', 'qualified', 'requirements_received', 'quotation_sent', 'sample_requested',
  'sample_payment_pending', 'sample_dispatched', 'sample_approved', 'negotiation', 'po_received', 'won', 'lost',
];

/** Lead channel categories. */
export const CHANNELS: Channel[] = ['direct', 'marketplace', 'website', 'trade_fair', 'linkedin', 'referral', 'other'];

/** Kinds of business. */
export const BUSINESS_TYPES: BusinessType[] = ['importer', 'distributor', 'wholesaler', 'retailer', 'manufacturer', 'trader'];

/**
 * The buckets the business wants to keep apart (an inquiry is not automatically a buyer): prospect (unverified),
 * qualified (a genuine requirement), opportunity (an active deal) and customer (won); plus lost.
 */
export type StageGroup = 'prospect' | 'qualified' | 'opportunity' | 'customer' | 'lost';

/**
 * Which bucket a stage belongs to.
 * @param stage — a pipeline stage.
 * @returns its group: new_lead / contacted -> prospect; qualified / requirements_received -> qualified;
 *   quotation_sent ... po_received -> opportunity; won -> customer; lost -> lost.
 */
export function stageGroup(stage: Stage): StageGroup {
  if (stage === 'new_lead' || stage === 'contacted') return 'prospect';
  if (stage === 'qualified' || stage === 'requirements_received') return 'qualified';
  if (stage === 'won') return 'customer';
  if (stage === 'lost') return 'lost';
  return 'opportunity';
}

/** Tailwind colour classes of the stage pill per group. */
export const GROUP_STYLE: Record<StageGroup, string> = {
  prospect: 'bg-surface-muted text-fg-secondary',
  qualified: 'bg-info-bg text-info-ink',
  opportunity: 'bg-warning-bg text-warning-ink',
  customer: 'bg-success-bg text-success-ink',
  lost: 'bg-danger-bg text-danger-ink',
};

/** Soft background of a pipeline group's panel (written out in full so Tailwind generates every class). */
export const GROUP_TINT: Record<StageGroup, string> = {
  prospect: 'bg-surface-muted',
  qualified: 'bg-info-bg',
  opportunity: 'bg-warning-bg',
  customer: 'bg-success-bg',
  lost: 'bg-danger-bg',
};
