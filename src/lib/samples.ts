/**
 * Samples: the types the API's sample endpoints return and accept (they mirror api/src/views/sample.view.ts and
 * api/src/validators/sample.validator.ts) and the fixed lists of statuses and results. The cost of a sample is only sent to
 * administrators, so `cost_inr` is optional here.
 */
export const SAMPLE_STATUSES = ['requested', 'dispatched', 'feedback_received'] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];
export const SAMPLE_RESULTS = ['pending', 'approved', 'rejected'] as const;
export type SampleResult = (typeof SAMPLE_RESULTS)[number];

/** A sample as GET /samples returns it. */
export interface Sample {
  id: string;
  /** Readable sequential id, e.g. 'SMP-0001'; given by the API. */
  sample_code: string;
  buyer_id: string;
  buyer_name: string;
  product_id: string | null;
  product_name: string;
  grade: string | null;
  /** Weight of the sample in grams. */
  weight_g: number;
  /** 'YYYY-MM-DD' */
  requested_at: string;
  /** 'YYYY-MM-DD'; set once the sample is dispatched. */
  sent_at: string | null;
  courier: string | null;
  tracking_no: string | null;
  status: SampleStatus;
  result: SampleResult;
  feedback: string | null;
  /** Rupees as a decimal string; only administrators receive it. */
  cost_inr?: string | null;
  assigned_to: string | null;
  notes: string | null;
  archived: boolean;
}

/** A sample from GET /samples/:id, with the name of the person looking after it. */
export interface SampleDetail extends Sample { assigned_name: string | null }

/** Body of POST /samples and PATCH /samples/:id (PATCH sends only what changed); `cost_inr` is for administrators only. */
export type SampleInput = Partial<Omit<Sample, 'id' | 'sample_code' | 'buyer_name'>> & { buyer_id: string; product_name: string; weight_g: number };
