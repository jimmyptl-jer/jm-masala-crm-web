/**
 * Small pill showing a buyer's pipeline stage (e.g. "Quotation sent"): a white pill with a coloured dot, the colour taken
 * from the stage's group (prospect, qualified, active opportunity, customer, lost) in the design system's stage colours.
 * Used by pages/Buyers.tsx, pages/Pipeline.tsx and pages/BuyerDetail.tsx. No API calls.
 */
import { stageColors } from '@/lib/design-tokens';
import { stageGroup, type StageGroup } from '@/lib/crm';
import type { Stage } from '@/lib/types';
import { t } from '@/strings';

const DOT: Record<StageGroup, string> = {
  prospect: stageColors.enquiry,
  qualified: stageColors.quotation,
  opportunity: stageColors.negotiation,
  customer: stageColors.fully_paid,
  lost: stageColors.lost,
};

/** @param props.stage — the buyer's stage. */
export function StagePill({ stage }: { stage: Stage }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs font-bold text-ink-secondary">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DOT[stageGroup(stage)] }} aria-hidden />
      {t.crm.stages[stage]}
    </span>
  );
}
