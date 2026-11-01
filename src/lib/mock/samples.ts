/** Sample samples for the screens that run without the API (illustrative records only). The buyer ids are the ones in mock/data.ts. */
import type { Sample } from '../samples';

const day = (offset: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86_400_000));
const base = { product_id: null, grade: null, courier: null, tracking_no: null, feedback: null, cost_inr: '450.00', assigned_to: null, notes: null, archived: false };

export const SAMPLES: Sample[] = [
  { ...base, id: 's1', sample_code: 'SMP-0001', buyer_id: 'b1', buyer_name: 'Sample Foods GmbH', product_name: 'Cumin Seeds', grade: 'Europe', weight_g: 250, requested_at: day(-12), sent_at: day(-10), courier: 'DHL', tracking_no: '1234567890', status: 'dispatched', result: 'pending' },
  { ...base, id: 's2', sample_code: 'SMP-0002', buyer_id: 'b2', buyer_name: 'Demo Spice Importers LLC', product_name: 'Fennel Seeds', weight_g: 200, requested_at: day(-20), sent_at: day(-18), courier: 'FedEx', tracking_no: 'FX-99120', status: 'feedback_received', result: 'approved', feedback: 'Colour and aroma match the specification.' },
  { ...base, id: 's3', sample_code: 'SMP-0003', buyer_id: 'b5', buyer_name: 'Demo Masala Traders', product_name: 'Coriander Seeds', weight_g: 500, requested_at: day(-1), sent_at: null, status: 'requested', result: 'pending' },
];
