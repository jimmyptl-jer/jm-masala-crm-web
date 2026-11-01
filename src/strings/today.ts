// Strings for the Today (dashboard) screen: the daily sales cockpit (who to chase, product demand, buyers going cold).
export const today = {
  title: 'Dashboard',
  loadFailed: "Could not load today's summary.",
  greeting: (part: 'morning' | 'afternoon' | 'evening', name: string) => `Good ${part}, ${name}`,
  greetingFallbackName: 'there',
  summary: (chase: number, quotes: number) => `${chase} ${chase === 1 ? 'buyer' : 'buyers'} to chase today · ${quotes} ${quotes === 1 ? 'quote' : 'quotes'} waiting for a reply`,
  scopeLabel: 'Whose buyers', scopeMe: 'Me', scopeTeam: 'Team',
  logContact: '+ Log contact',
  dashboardUnavailable: 'Quote follow-ups are not available yet, so the lists below cover buyers only.',

  // KPI cards
  kpiLabel: 'Sales summary',
  kpiChase: 'Chase today', kpiChaseSub: (done: number, left: number) => `${done} done · ${left} left`, kpiProgress: (done: number, total: number) => `${done} of ${total} contacts done`,
  kpiOverdue: 'Overdue', kpiOverdueSub: 'missed follow-ups',
  kpiNew: 'New enquiries', kpiNewSub: (n: number) => `${n} not replied`, kpiNewNone: 'all replied',
  kpiCold: 'Going cold', kpiColdSub: 'no contact 14+ days',

  // the dashboard tabs (the cards above open them)
  tabsLabel: 'Dashboard sections', tabChase: 'Chase list', tabOverdue: 'Overdue', tabNew: 'New enquiries', tabCold: 'Going cold', tabRates: 'Daily rates',
  openCard: (label: string) => `Show ${label}`,
  overdueTitle: 'Overdue follow-ups', overdueHint: 'Follow-ups that should have happened already, oldest first.',
  newTitle: 'New enquiries', newHint: 'Buyers at the new-lead stage. Reply first, then send a quotation.',
  newEmpty: 'No new enquiries', newEmptyHint: 'Every enquiry has moved on.',
  colEnquiry: 'Enquiry date', colReplied: 'Reply', replied: 'Replied', notReplied: 'Not replied',
  coldHint: 'Nobody has spoken to these buyers for 14 days or more.', colSilent: 'No contact for', coldDaysLong: (n: number) => `${n} days`,
  ratesTitle: 'Daily rates',

  // chase list
  chaseTitle: 'Chase list',
  filters: { all: 'All', overdue: 'Overdue', quote: 'Quotes', sample: 'Samples', new: 'New' },
  filtersLabel: 'Filter the chase list',
  colBuyer: 'Buyer', colWants: 'Wants', colLast: 'Last contact', colWhy: 'Why chase', colAction: 'Action',
  noContact: 'Never',
  daysAgo: (n: number) => (n === 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`),
  noWants: 'Not recorded',
  whatsapp: 'WhatsApp', call: 'Call', done: 'Mark done', quote: 'Quote',
  whatsappAria: (name: string) => `WhatsApp ${name}`, callAria: (name: string) => `Call ${name}`, doneAria: (name: string) => `Mark ${name} done`, quoteAria: (name: string) => `Create a quotation for ${name}`,
  noPhone: 'No phone number saved for this buyer',
  chaseEmpty: 'Nobody to chase right now', chaseEmptyHint: 'Every follow-up is done. Nice work.',
  waMessage: (who: string, wants: string | null) => `Hello ${who}, this is JM Masala${wants ? ` following up on your ${wants} requirement` : ' following up'}. Could we speak today?`,

  // product demand
  demandTitle: "Product demand and today's offer", editPrices: 'Edit prices',
  colProduct: 'Product', colDemand: 'Demand', colOffer: 'Ref. price',
  buyers: (n: number) => (n === 1 ? '1 buyer' : `${n} buyers`),
  perUnit: (unit: string) => `per ${unit}`, noPrice: 'No reference price',
  demandEmpty: 'No product interest recorded yet', demandEmptyHint: 'Add the products a buyer wants on their profile and the demand shows here.',
  demandNote: 'Demand counts buyers who want the product. Quantities (MT) and daily offer prices need the API.',

  // going cold
  coldTitle: 'Going cold', coldEmpty: 'Nobody has gone quiet', coldEmptyHint: 'Every active buyer was contacted in the last 14 days.',
  coldDays: (n: number) => `${n}d`,

  // done and log sheets
  doneTitle: 'Mark as done', doneSubtitle: (name: string) => `Record what happened with ${name} and set the next follow-up.`,
  logTitle: 'Log contact', logSubtitle: 'Record a call, message, meeting or note for a buyer.',
  buyer: 'Buyer', chooseBuyer: 'Choose a buyer', kind: 'How you contacted them', outcome: 'What happened', outcomePlaceholder: 'e.g. Spoke to Mr Khan, he will confirm by Friday',
  nextDate: 'Next follow-up', nextAction: 'Next action', nextActionPlaceholder: 'e.g. Send revised price',
  save: 'Save', saving: 'Saving…', cancel: 'Cancel',
  savedToast: 'Contact logged', saveFailed: 'Could not save. Please try again.',
  buyerRequired: 'Choose a buyer.', outcomeRequired: 'Write what happened.',

  // today's dollar rate (top of the dashboard)
  fxTitle: "Today's dollar rate", fxPer: 'per US$1', fxNotSet: 'Not set yet',
  fxNotSetHint: 'Enter it once a day. Every quote uses it for the rupee value and the margin.',
  fxSetBy: (name: string, when: string) => `Set by ${name} on ${when}`,
  fxStale: (when: string) => `Last set on ${when}. Please enter today's rate.`,
  fxLabel: 'Rupees for US$1', fxSave: 'Update rate', fxSaved: 'Dollar rate updated',
  fxInvalid: 'Enter the rupees for one dollar, for example 83.45.', fxFailed: 'Could not save the rate.',
};
