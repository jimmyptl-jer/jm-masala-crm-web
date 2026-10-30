/** Coloured pill for an inquiry status (colour tokens from the design system; labels in strings/inquiries.ts). */
import clsx from 'clsx';
import type { InquiryStatus } from '@/lib/types';
import { t } from '@/strings';

const STYLE: Record<InquiryStatus, string> = {
  new: 'bg-info-bg text-info-ink',
  reviewing: 'bg-warning-bg text-warning-ink',
  quoted: 'bg-surface-muted text-fg-secondary',
  won: 'bg-success-bg text-success-ink',
  lost: 'bg-danger-bg text-danger-ink',
};

export function InquiryStatusPill({ status }: { status: InquiryStatus }) {
  return <span className={clsx('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', STYLE[status])}>{t.inquiries.status[status]}</span>;
}
