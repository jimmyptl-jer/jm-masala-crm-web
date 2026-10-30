/**
 * Realistic test data made with Faker: buyers that look like spice importers (a family name, a trade word, the legal ending used in
 * their country), a contact person with a job title, phone numbers, cities and short buyer messages. Every record keeps a small
 * "(E2E ABC1)" marker in its company name so a test record is easy to spot, unique, and found again for archiving.
 *
 * The random numbers are seeded: a run prints its seed once (`E2E seed 123456`), and `E2E_SEED=123456` repeats the very same names.
 * E-mail addresses always end in example.com, which can never reach a real person.
 */
import { faker } from '@faker-js/faker';

const SEED = Number(process.env.E2E_SEED ?? Date.now() % 1_000_000);
faker.seed(SEED);
const g = globalThis as { __e2eSeedShown?: boolean };
if (!g.__e2eSeedShown) { g.__e2eSeedShown = true; process.stdout.write(`E2E seed ${SEED} (repeat these names with E2E_SEED=${SEED})\n`); }

const MARKETS = [
  { country: 'UAE', cities: ['Dubai', 'Sharjah', 'Abu Dhabi'], ending: 'Trading LLC', dial: '+971' },
  { country: 'Oman', cities: ['Muscat', 'Salalah', 'Sohar'], ending: 'Trading LLC', dial: '+968' },
  { country: 'Saudi Arabia', cities: ['Jeddah', 'Riyadh', 'Dammam'], ending: 'Trading Co.', dial: '+966' },
  { country: 'Germany', cities: ['Hamburg', 'Bremen', 'Frankfurt'], ending: 'GmbH', dial: '+49' },
  { country: 'Netherlands', cities: ['Rotterdam', 'Amsterdam', 'Utrecht'], ending: 'B.V.', dial: '+31' },
  { country: 'United Kingdom', cities: ['London', 'Birmingham', 'Leicester'], ending: 'Ltd', dial: '+44' },
  { country: 'Singapore', cities: ['Singapore'], ending: 'Pte Ltd', dial: '+65' },
  { country: 'United States', cities: ['New York', 'Houston', 'Edison'], ending: 'Inc.', dial: '+1' },
] as const;
const TRADE_WORDS = ['Spice Imports', 'Foods', 'Global Foods', 'Spice House', 'Provisions', 'Food Ingredients', 'Spice Traders', 'Harvest Foods'] as const;
const TITLES = ['Purchasing Manager', 'Procurement Head', 'Import Manager', 'Managing Director', 'Category Buyer', 'Sourcing Lead'] as const;

/** A short unique mark such as "4F2K". */
const mark = () => Date.now().toString(36).slice(-3).toUpperCase() + faker.string.alphanumeric({ length: 2, casing: 'upper' });

export interface FakeBuyer {
  company_name: string;
  contact_name: string;
  designation: string;
  email: string;
  phone: string;
  whatsapp: string;
  city: string;
  country: string;
}

/** A realistic export buyer. `over` replaces any field. */
export function fakeBuyer(over: Partial<FakeBuyer> = {}): FakeBuyer {
  const market = faker.helpers.arrayElement(MARKETS);
  const family = faker.person.lastName().replace(/[^A-Za-z]/g, '');
  const person = { first: faker.person.firstName(), last: faker.person.lastName() };
  const phone = `${market.dial} ${faker.string.numeric({ length: 2 })} ${faker.string.numeric({ length: 3 })} ${faker.string.numeric({ length: 4 })}`;
  return {
    company_name: `${family} ${faker.helpers.arrayElement(TRADE_WORDS)} ${market.ending} (E2E ${mark()})`,
    contact_name: `${person.first} ${person.last}`,
    designation: faker.helpers.arrayElement(TITLES),
    email: `${person.first}.${person.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com',
    phone,
    whatsapp: phone,
    city: faker.helpers.arrayElement(market.cities),
    country: market.country,
    ...over,
  };
}

const PARTNER_KINDS = [
  { word: 'Agro Traders', role: 'supplier', product: 'Cumin Seeds', unit: 'per_ton' },
  { word: 'Spice Processors', role: 'processor', product: 'Coriander Seeds', unit: 'per_kg' },
  { word: 'Packaging Industries', role: 'packager', product: 'PP woven bags', unit: 'per_job' },
  { word: 'Roadlines', role: 'transporter', product: 'Mundra port run', unit: 'per_trip' },
  { word: 'Clearing Agency', role: 'cha', product: 'Customs clearance', unit: 'per_document' },
] as const;

export interface FakePartner { company_name: string; city: string; state: string; contact_name: string; designation: string; phone: string; role: (typeof PARTNER_KINDS)[number]['role']; offering: string; unit: string }

/** A realistic Indian supplier / service company (a family name, what it does, a town in Gujarat, Maharashtra or Rajasthan) with one contact person. */
export function fakePartner(): FakePartner {
  const kind = faker.helpers.arrayElement(PARTNER_KINDS);
  const place = faker.helpers.arrayElement([['Unjha', 'Gujarat'], ['Rajkot', 'Gujarat'], ['Mundra', 'Gujarat'], ['Mumbai', 'Maharashtra'], ['Jodhpur', 'Rajasthan']] as const);
  return {
    company_name: `${faker.person.lastName().replace(/[^A-Za-z]/g, '')} ${kind.word} (E2E ${mark()})`, city: place[0], state: place[1],
    contact_name: `${faker.person.firstName()} ${faker.person.lastName()}`, designation: faker.helpers.arrayElement(['Owner', 'Sales Manager', 'Operations Head', 'Dispatch Coordinator']),
    phone: `+91 ${faker.string.numeric({ length: 2 })} ${faker.string.numeric({ length: 4 })} ${faker.string.numeric({ length: 4 })}`, role: kind.role, offering: kind.product, unit: kind.unit,
  };
}

/** A different person (for "the contact changed" edits). */
export function fakePerson(): { name: string; email: string } {
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  return { name: `${first} ${last}`, email: `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com' };
}

/** A believable first message from a buyer who wants the given products to a port. */
export function fakeBuyerMessage(products: { name: string; qty: string }[], port: string): string {
  const wants = products.map((p) => `${p.qty} of ${p.name}`).join(' and ');
  return `${faker.helpers.arrayElement(['Hello,', 'Dear team,', 'Good day,'])} we are looking for ${wants}, delivered to ${port}. ${faker.helpers.arrayElement(['Please send your best price and the available grades.', 'Kindly share your price with packing and payment terms.', 'Could you quote CIF and tell us the earliest shipment date?'])} ${faker.helpers.arrayElement(['Thanks and regards', 'Best regards', 'Kind regards'])}.`;
}

/** A believable internal follow-up note. */
export const fakeNote = (): string => faker.helpers.arrayElement([
  'Sent the price list and a sample offer; waiting for the buyer to confirm the grade.',
  'Buyer asked for a lower rate on 25 kg bags; checking the packing cost.',
  'Called the purchasing manager; they decide after the trade fair next month.',
  'Samples dispatched by courier; follow up when they arrive.',
  'Buyer is comparing two offers; offer a small discount if the order is confirmed this week.',
]);
