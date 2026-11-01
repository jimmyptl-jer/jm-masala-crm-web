/** Coloured pills for a sample's status and result (colour tokens from the design system; labels in strings/samples.ts). */
import clsx from 'clsx';
import type { SampleResult, SampleStatus } from '@/lib/samples';
import { t } from '@/strings';

const BASE = 'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold';
const STATUS_STYLE: Record<SampleStatus, string> = {
  requested: 'bg-info-bg text-info-ink',
  dispatched: 'bg-warning-bg text-warning-ink',
  feedback_received: 'bg-surface-muted text-fg-secondary',
};
const RESULT_STYLE: Record<SampleResult, string> = {
  pending: 'bg-surface-muted text-fg-secondary',
  approved: 'bg-success-bg text-success-ink',
  rejected: 'bg-danger-bg text-danger-ink',
};

export const SampleStatusPill = ({ status }: { status: SampleStatus }) => <span className={clsx(BASE, STATUS_STYLE[status])}>{t.samples.status[status]}</span>;
export const SampleResultPill = ({ result }: { result: SampleResult }) => <span className={clsx(BASE, RESULT_STYLE[result])}>{t.samples.result[result]}</span>;
