/**
 * Small coloured pill showing a buyer's pipeline stage (e.g. "Quotation sent"). The colour comes from the stage's
 * group (prospect grey, qualified blue, active opportunity amber, customer green, lost red) so the four kinds of
 * buyer can be told apart at a glance. Used by pages/Buyers.tsx and pages/BuyerDetail.tsx. No API calls.
 */
import clsx from 'clsx';
import { GROUP_STYLE, stageGroup } from '@/lib/crm';
import type { Stage } from '@/lib/types';
import { t } from '@/strings';

/** @param props.stage — the buyer's stage. */
export function StagePill({ stage }: { stage: Stage }) {
  return (
    <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', GROUP_STYLE[stageGroup(stage)])}>
      {t.crm.stages[stage]}
    </span>
  );
}
