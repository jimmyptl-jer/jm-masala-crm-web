/**
 * Price calculator: the types the API's /price-calculator endpoints return and accept (they mirror api/src/services/price-calc.ts and
 * api/src/validators/price-calculator.validator.ts) and the fixed lists. Every amount is a decimal string; the web app never adds,
 * multiplies or divides them: it only sends what was typed and shows what the API answers.
 */
export const EXPORT_POINTS = ['BNP', 'CTG', 'DUB', 'HILI'] as const;
export type ExportPoint = (typeof EXPORT_POINTS)[number];

/** The expense heads of an export point, in the order of the sheet. Rupees per ton, except the sea freight (dollars per container). */
export const HEAD_KEYS = ['rail_road', 'sea_freight_usd', 'thc', 'cfs', 'c_and_f', 'insurance', 'lc_bank', 'weighment_spot', 'weighment_landing', 'ecgc', 'service_tax', 'misc'] as const;
export type HeadKey = (typeof HEAD_KEYS)[number];
export type ExpenseHeads = Record<HeadKey, string>;

/** The percentages and rates every column shares (a percentage is written as 1 for 1%). */
export const PERCENT_KEYS = ['overseas_commission_pct', 'drawback_pct', 'rodtep_pct', 'margin_pct'] as const;
export type PercentKey = (typeof PERCENT_KEYS)[number];
export interface Assumptions extends Record<PercentKey, string> { freight_inr_per_usd: string; container_tons: string }

/** One column of the sheet as it is sent. `expenses_override` replaces the export expenses (rupees per ton) when set. */
export interface CalcLineInput { label: string | null; export_point: ExportPoint; spot_rate: string; purchase_commission: string; fx_rate: string; expenses_override: string | null }

/** GET /price-calculator/defaults. */
export interface CalcDefaults {
  assumptions: Assumptions;
  export_points: Record<ExportPoint, ExpenseHeads>;
  export_point_codes: ExportPoint[];
  /** Today's dollar rate when somebody has set one, otherwise the sheet's. */
  fx_rate: string;
  fx_source: 'dollar_rate' | 'sheet';
  fx_is_today?: boolean;
  /** The columns of the sheet with its spot rates (rupees per ton). */
  lines: { label: string; export_point: ExportPoint; spot_rate: string }[];
}

/** The expense heads of one column in rupees per ton (the sea freight already turned into rupees per ton). */
export interface CalcExpenses {
  rail_road: string; sea_freight: string; thc: string; cfs: string; c_and_f: string; insurance: string; lc_bank: string;
  weighment_spot: string; weighment_landing: string; ecgc: string; service_tax: string; misc: string; total: string;
}

/** One column of the sheet, calculated by the API. */
export interface CalcLineOut {
  label: string | null;
  export_point: ExportPoint;
  spot_rate: string;
  purchase_commission: string;
  net_per_ton: string;
  /** What the export point's heads add up to (informational when an override is used). */
  expenses: CalcExpenses;
  /** The export expenses the cost is built on: the override when there is one. */
  export_expenses: string;
  expenses_override_used: boolean;
  cost_per_ton: string;
  fx_rate: string;
  cost_per_ton_usd: string;
  overseas_commission: string;
  basic_cost_usd: string;
  duty_drawback: string;
  rodtep: string;
  net_cost_usd: string;
  margin: string;
  offer_rate: string;
}

/** A saved sheet as a row of GET /price-calculator/sheets. */
export interface PriceSheetSummary { id: string; sheet_date: string; name: string | null; line_count: number; saved_by_name: string; archived: boolean; updated_at: string }

/** A saved dated sheet from GET /price-calculator/sheets/:id: the inputs and the figures it was saved with. */
export interface PriceSheet {
  id: string;
  /** 'YYYY-MM-DD' */
  sheet_date: string;
  name: string | null;
  assumptions: Assumptions;
  export_points: Record<ExportPoint, ExpenseHeads>;
  lines: CalcLineInput[];
  results: CalcLineOut[];
  saved_by_name: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
