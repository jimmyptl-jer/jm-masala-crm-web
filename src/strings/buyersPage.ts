// Strings for the Buyers directory screen and the buyer details drawer (pages/Buyers.tsx).
export const buyersPage = {
  title: 'Buyers',
  subtitle: 'Manage international buyers, contacts, requirements and sales activity.',
  addBuyer: 'Add Buyer', addBuyerTitle: 'Add buyer', editBuyerTitle: 'Edit buyer',
  searchLabel: 'Search buyers by company, country or product', searchPlaceholder: 'Search buyers, countries, products…',
  countryFilter: 'Country filter', allCountries: 'All countries',

  // metric tiles
  metricsLabel: 'Buyer metrics',
  totalBuyers: 'Total Buyers', totalBuyersDetail: 'Active buyer records', totalBuyersOpens: 'Show every active buyer',
  activeCountries: 'Active Countries', activeCountriesDetail: 'Countries with active buyers', activeCountriesOpens: 'Choose a country',
  quotesSent: 'Quotations Sent', quotesSentAwaiting: 'Awaiting a buyer response', quotesSentOpen: 'Open quotations', quotesSentOpens: 'Open the sent quotations',
  wonDeals: 'Won Deals', wonDealsDetail: 'Won quotations', wonDealsOpens: 'Open the won quotations',

  // directory
  directory: 'Buyer directory', loadingRecords: 'Loading buyer records',
  matchCount: (n: number) => `${n} buyer${n === 1 ? '' : 's'} match your view`,
  dueFollowups: 'Due follow-ups', statusActive: 'Active', statusAll: 'All statuses', statusArchived: 'Archived',
  filtersButton: 'Filters', filtersCount: (n: number) => `Filters (${n})`, hideFilters: 'Hide filters', lastContact: 'Last contact', nextStep: 'Next', quotesShort: (n: number) => `${n} quote${n === 1 ? '' : 's'}`, selectBuyer: 'Select',
  fStage: 'Stage', fAllStages: 'All stages', fProduct: 'Product interest', fAllProducts: 'All products', fOwner: 'Owner', fAllOwners: 'All owners',
  fStatus: 'Status', fMarket: 'Market', fAllTypes: 'All types', fCountry: 'Country',
  typeExport: 'Export', typeDomestic: 'Domestic',
  selectedCount: (n: number) => `${n} selected`, viewSelected: 'View selected', clearSelection: 'Clear selection',
  loadingBuyers: 'Loading buyers', noMatch: 'No buyers match these filters', noBuyers: 'No buyers yet', clearFilters: 'Clear filters', addFirst: 'Add your first buyer',
  selectPage: 'Select buyers on this page', selectOne: (n: string) => `Select ${n}`,
  colId: 'Buyer ID', colCompany: 'Company', colCountry: 'Country / city', colContact: 'Contact person', colPhone: 'Phone / WhatsApp', colType: 'Buyer type',
  colProducts: 'Interested products', colSource: 'Lead source', colStatus: 'Status', colOwner: 'Assigned to', colLast: 'Last contacted', colNext: 'Next follow-up', colQuotes: 'Quotations', colActions: 'Actions',
  india: 'India', notSet: 'Not set', whatsappShort: (n: string) => `WA ${n}`, noContactYet: 'No contact yet', unassigned: 'Unassigned',
  openAria: (n: string) => `Open ${n}`, editAria: (n: string) => `Edit ${n}`, quoteAria: (n: string) => `Create quotation for ${n}`, moreAria: (n: string) => `More actions for ${n}`,
  previous: 'Previous', next: 'Next', page: (p: number, n: number) => `Page ${p} of ${n}`,
  countriesTitle: 'Active countries', noCountries: 'No buyer has a country yet.', buyerCount: (n: number) => `${n} ${n === 1 ? 'buyer' : 'buyers'}`,

  // follow-up pill
  noFollowup: 'No follow-up', overduePrefix: 'Overdue · ', todayPrefix: 'Today · ',

  // drawer
  drawerTitle: 'Buyer details', closeDrawer: 'Close buyer details', close: 'Close', loadingBuyer: 'Loading buyer', edit: 'Edit',
  sectionsLabel: 'Buyer details sections',
  tabs: { Overview: 'Overview', Contacts: 'Contacts', Requirements: 'Requirements', Quotations: 'Quotations', Activity: 'Activity' },
  active: 'Active', archived: 'Archived', locationNotSet: 'Location not set', exportBuyer: 'Export buyer', domesticBuyer: 'Domestic buyer',
  quotationsSent: 'Quotations sent', wonDealsLabel: 'Won deals',
  info: 'Buyer information', contactPerson: 'Contact person', designation: 'Designation', email: 'Email', phone: 'Phone', address: 'Address', buyerType: 'Buyer type',
  firstInquiry: 'First inquiry', owner: 'Owner', whatsapp: 'WhatsApp', name: 'Name', notProvided: 'Not provided',
  interests: 'Product interests', nextFollowup: 'Next follow-up', noNextAction: 'No next action recorded', markDone: 'Mark as done', notes: 'Notes',
  followupDone: 'Follow-up marked as done', followupFailed: 'Could not update follow-up',
  primaryContact: 'Primary contact', primaryContactHint: 'The current buyer record supports one primary contact.',
  interestedProducts: 'Interested products', requirements: 'Buying requirements', noRequirements: 'No requirements recorded yet.',
  noInterests: 'No product interests recorded.', draft: 'Draft', noProductsListed: 'No products listed', noQuotes: 'No quotations yet', noActivity: 'No activity recorded',
  quotation: (no: string) => `Quotation ${no}`,
  createQuote: 'Create quotation', emailAction: 'Email', callAction: 'Call',
};
