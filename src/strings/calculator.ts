/** Text of the Price calculator tab (the sheet, its assumptions and the export expenses). Pure data; the keys are the API's. */
import type { ExportPoint, HeadKey, PercentKey } from '@/lib/priceCalculator';

export const calculator = {
  title: 'Price calculator',
  subtitle: 'The export price sheet: from the spot rate per ton to the offer rate in dollars. Change any white cell and every figure updates.',
  adminOnly: 'Only an administrator can use the price calculator.',
  loading: 'Loading the calculator',
  calculating: 'Calculating…',
  addColumn: 'Add column',
  copyColumn: 'Copy column',
  removeColumn: 'Remove column',
  reset: 'Reset to the sheet',
  breakdown: 'Show expense breakdown',
  fxFromDollarRate: (rate: string) => `The dollar rate is today's rate (${rate}) from the dashboard.`,
  fxFromOldDollarRate: (rate: string) => `The dollar rate (${rate}) was set on an earlier day: check it.`,
  fxFromSheet: (rate: string) => `Nobody has set today's dollar rate, so the sheet's rate (${rate}) is used.`,
  noteSheet: 'Starting figures are the sheet dated 10.3.26. Insurance and ECGC are worked out on each column\'s own spot rate, so some columns differ slightly from the Excel sheet. To get the Excel sheet\'s own figure for a column, type its export expenses total in the override row.',
  quality: 'Quality',
  exportPoint: 'Export point',
  qualityPlaceholder: 'e.g. Cumin',
  columnN: (n: number) => `Column ${n}`,
  sheet: {
    label: 'Saved sheet', newSheet: 'New sheet (not saved)', date: 'Sheet date', name: 'Name (optional)', namePlaceholder: 'e.g. Weekly offer',
    save: 'Save sheet', saving: 'Saving…', savedToast: 'Sheet saved', restoredToast: 'Sheet restored', archivedToast: 'Sheet archived',
    notSaved: 'Not saved yet', unsaved: 'Unsaved changes', savedBy: (who: string, when: string) => `Saved by ${who} on ${when}`,
    newFromThis: 'New sheet from this one', archive: 'Archive sheet', restore: 'Restore sheet', showArchived: 'Show archived sheets',
    archivedNote: 'This sheet is archived.', confirmLeave: 'You have unsaved changes. Continue without saving?', confirmArchive: 'Archive this sheet? It stays in the list under "Show archived sheets".',
    fixColumns: 'Fill in the spot rate and dollar rate of every column, or remove the empty ones, before saving.', option: (date: string, name: string | null, n: number) => `${date}${name ? ` · ${name}` : ''} · ${n} column${n === 1 ? '' : 's'}`,
    loadFailed: 'The sheet could not be opened.',
  },
  rows: {
    override: 'Export expenses override', expensesUsed: 'Export expenses used', spot: 'Spot rate per ton', commission: 'Purchase commission', net: 'Net per ton', expenses: 'Export expenses', cost: 'Cost per ton', fx: 'INR/USD exchange rate', costUsd: 'Cost per ton in USD',
    overseas: (p: string) => `Overseas commission @ ${p}%`, basic: 'Basic cost per ton in USD', drawback: (p: string) => `Duty drawback @ ${p}%`, rodtep: (p: string) => `RODTEP @ ${p}%`,
    netCost: 'Net cost per ton in USD', margin: (p: string) => `Margin @ ${p}%`, offer: 'Offer rate per ton in USD',
  },
  units: { inr: '₹', usd: '$' },
  expenseRows: {
    rail_road: 'Rail-cum-road freight', sea_freight: 'Sea freight', thc: 'THC / lorry detention', cfs: 'CFS and other expenses + fumigation', c_and_f: 'C&F agent charges',
    insurance: 'Transit insurance', lc_bank: 'L/C expenses / bank charges', weighment_spot: 'Spot weighment', weighment_landing: 'Weighment landing', ecgc: 'ECGC premium', service_tax: 'Service tax',
    misc: 'Miscellaneous', total: 'Total per ton',
  },
  assumptions: {
    title: 'Rates and percentages',
    hint: 'Used by every column. Percentages are written as 1 for 1%.',
    fxAll: 'INR/USD rate for all columns',
    freight: 'Sea freight: rupees per dollar', tons: 'Tons in a container',
    pct: {
      overseas_commission_pct: 'Overseas commission (%)', drawback_pct: 'Duty drawback (%)', rodtep_pct: 'RODTEP (%)', margin_pct: 'Margin (%)',
      insurance_pct: 'Transit insurance (% of spot)', ecgc_pct: 'ECGC premium (% of spot)',
    } satisfies Record<PercentKey, string>,
  },
  heads: {
    title: 'Export expenses per export point',
    hint: 'Rupees per ton, except the sea freight in dollars per container. Insurance and ECGC follow the spot rate and are not listed here.',
    rows: {
      rail_road: 'Rail-cum-road freight', sea_freight_usd: 'Sea freight in USD per container', thc: 'THC / lorry detention', cfs: 'CFS and other expenses + fumigation', c_and_f: 'C&F agent charges',
      lc_bank: 'L/C expenses / bank charges', weighment_spot: 'Spot weighment', weighment_landing: 'Weighment landing', service_tax: 'Service tax', misc: 'Miscellaneous',
    } satisfies Record<HeadKey, string>,
  },
  points: { BNP: 'BNP', CTG: 'CTG', DUB: 'DUB', HILI: 'Hili' } satisfies Record<ExportPoint, string>,
  needSpot: 'Enter a spot rate to calculate this column.',
  needFx: 'Enter the INR/USD rate to calculate this column.',
} as const;
