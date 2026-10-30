/** Sample partners for the screens that run without the API (illustrative records only, not real JM Masala contacts). */
import type { PartnerDetail } from '../partners';

const base = { legal_name: null, whatsapp: null, website: null, address: null, postal_code: null, gstin: null, pan: null, registration_details: null, notes: null, assigned_to: null, archived: false, activities: [] };
const contact = (id: string, name: string, designation: string, phone: string) => ({ id, name, designation, department: null, email: null, phone, whatsapp: null, is_primary: true, notes: null });
const service = (id: string, role: PartnerDetail['roles'][number], service_name: string, products: string[], areas: string[], lead: number | null) =>
  ({ id, role, service_name, products_supplied: products, service_areas: areas, lead_time_days: lead, capacity_notes: null, documents: [], notes: null });

export const PARTNERS: PartnerDetail[] = [
  { ...base, id: 'pt1', partner_code: 'PTY-0001', company_name: 'Unjha Spice Supplier', roles: ['supplier'], status: 'active', email: null, phone: '+91 98 7654 3210', city: 'Unjha', state: 'Gujarat', country: 'India',
    contacts: [contact('pc1', 'Ravi Patel', 'Owner', '+91 98 7654 3210')], services: [service('ps1', 'supplier', 'Cumin sourcing', ['Cumin Seeds'], ['Unjha'], 10)], last_interaction: null, activity_count: 0 },
  { ...base, id: 'pt2', partner_code: 'PTY-0002', company_name: 'Regional Transport Services', roles: ['transporter'], status: 'active', email: null, phone: null, city: 'Gujarat', state: 'Gujarat', country: 'India',
    contacts: [contact('pc2', 'Meena Shah', 'Dispatch coordinator', '+91 90 1234 5678')], services: [service('ps2', 'transporter', 'Factory to Mundra port', [], ['Mundra'], 2)], last_interaction: null, activity_count: 0 },
  { ...base, id: 'pt3', partner_code: 'PTY-0003', company_name: 'Export Clearance Agency', roles: ['cha', 'freight_forwarder'], status: 'under_review', email: null, phone: null, city: 'Mundra', state: 'Gujarat', country: 'India',
    contacts: [], services: [], last_interaction: null, activity_count: 0 },
  { ...base, id: 'pt4', partner_code: 'PTY-0004', company_name: 'Flexible Packaging Vendor', roles: ['packager'], status: 'active', email: null, phone: null, city: 'Gujarat', state: 'Gujarat', country: 'India',
    contacts: [], services: [service('ps4', 'packager', 'PP woven bags', [], [], null)], last_interaction: null, activity_count: 0 },
];
