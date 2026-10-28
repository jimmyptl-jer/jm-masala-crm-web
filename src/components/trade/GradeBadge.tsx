/**
 * The coloured grade badge of a discovered company: A green, B amber, C grey, "-" (no shipment evidence) pale. Shows the score under
 * the letter. Used by the Buyer finder list and the company detail sheet. No API calls.
 */
import clsx from 'clsx';
import type { TradeBuyerRow } from '@/lib/types';
import { t } from '@/strings';

/** @param props.grade — A / B / C / '-'. @param props.score — 0-100. */
export function GradeBadge({ grade, score }: { grade: TradeBuyerRow['grade']; score: number }) {
  const style = grade === 'A' ? 'bg-emerald-100 text-emerald-900' : grade === 'B' ? 'bg-amber-100 text-amber-900' : grade === 'C' ? 'bg-zinc-200 text-zinc-800' : 'bg-cream-100 text-fg-muted';
  return (
    <span className={clsx('inline-flex min-w-[3.25rem] flex-col items-center rounded-lg px-2 py-1 leading-tight', style)} title={`${score} / 100`}>
      <span className="text-lg font-bold">{t.ti.gradeLabel[grade]}</span>
      <span className="text-xs tabular-nums">{grade === '-' ? '' : score}</span>
    </span>
  );
}
