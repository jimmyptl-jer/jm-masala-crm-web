/**
 * Partners & Suppliers: the types the API's partner endpoints return and accept (they mirror api/src/views/partner.view.ts and
 * api/src/validators/partner.validator.ts), the fixed lists (roles, statuses, activity kinds, rate units per role) and the small
 * helpers the screens share. The rate, currency, rate unit, minimum order quantity and payment terms of a service are only sent to
 * administrators, so they are optional here.
 */
import { todayIST } from './format';

export const PARTNER_ROLES = ['supplier', 'processor', 'packager', 'transporter', 'cha', 'freight_forwarder', 'shipping_line', 'laboratory', 'fumigation', 'warehouse', 'insurance', 'commission_agent', 'other'] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];
export const PARTNER_STATUSES = ['active', 'under_review', 'inactive'] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];
export const ACTIVITY_KINDS = ['call', 'whatsapp', 'email', 'meeting', 'note'] as const;
export type PartnerActivityKind = (typeof ACTIVITY_KINDS)[number];
export const RATE_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const;

const GENERIC_UNITS = ['per_job', 'per_kg', 'per_ton', 'per_container', 'per_trip', 'per_document', 'per_month'];
const UNITS: Partial<Record<PartnerRole, string[]>> = {
  supplier: ['per_kg', 'per_ton'], processor: ['per_kg', 'per_ton', 'per_job'], packager: ['per_kg', 'per_ton', 'per_job'], transporter: ['per_trip', 'per_container', 'per_ton'],
  cha: ['per_document', 'per_job', 'per_container'], freight_forwarder: ['per_container', 'per_job', 'per_ton'], laboratory: ['per_job', 'per_document'],
};
/** The rate units the API accepts for a role (mirrors the API; the API has the last word). */
export const unitsFor = (role: string): string[] => UNITS[role as PartnerRole] ?? GENERIC_UNITS;

export interface PartnerContact {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  is_primary: boolean;
  notes: string | null;
}
export interface PartnerDocument { name: string; document_number: string | null; expires_at: string | null }
export interface PartnerService {
  id: string;
  role: PartnerRole;
  service_name: string | null;
  products_supplied: string[];
  service_areas: string[];
  lead_time_days: number | null;
  capacity_notes: string | null;
  documents: PartnerDocument[];
  notes: string | null;
  /** Administrators only. */
  rate_amount?: string | null;
  rate_currency?: string | null;
  rate_unit?: string | null;
  minimum_order_quantity?: string | null;
  payment_terms?: string | null;
}
export interface PartnerActivity { id: string; kind: PartnerActivityKind; body: string; happened_at: string; user_id: string; user_name: string }

export interface Partner {
  id: string;
  partner_code: string;
  company_name: string;
  legal_name: string | null;
  roles: PartnerRole[];
  status: PartnerStatus;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  gstin: string | null;
  pan: string | null;
  registration_details: string | null;
  notes: string | null;
  assigned_to: string | null;
  contacts: PartnerContact[];
  services: PartnerService[];
  archived: boolean;
  last_interaction: string | null;
  activity_count: number;
}
export interface PartnerDetail extends Partner { activities: PartnerActivity[] }

/** What the form sends for the company itself (contacts and services are saved on the profile page). */
export type PartnerInput = Partial<Pick<Partner, 'company_name' | 'legal_name' | 'roles' | 'status' | 'email' | 'phone' | 'whatsapp' | 'website' | 'address' | 'city' | 'state' | 'country' | 'postal_code' | 'gstin' | 'pan' | 'registration_details' | 'notes'>>;

export const primaryContact = (p: Partner): PartnerContact | undefined => p.contacts.find((c) => c.is_primary) ?? p.contacts[0];

/** What the partner offers, in a few words for the list: service names, else products, else nothing. */
export function offering(p: Partner): string {
  const names = p.services.map((s) => s.service_name).filter((x): x is string => !!x);
  const products = p.services.flatMap((s) => s.products_supplied);
  return [...new Set(names.length ? names : products)].join(', ');
}

/** How near a document's expiry date is: 'expired' (past), 'soon' (within 30 days), 'ok', or 'none' (no date). */
export function expiryTone(expiresAt: string | null): 'none' | 'ok' | 'soon' | 'expired' {
  if (!expiresAt) return 'none';
  const today = todayIST();
  if (expiresAt < today) return 'expired';
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 30);
  return expiresAt <= limit.toISOString().slice(0, 10) ? 'soon' : 'ok';
}
