/**
 * Revision tabs (R0, R1 ...) for the Quote detail screen (pages/QuoteDetail.tsx). Display only.
 * Related rule: BR-02 (every change after issuing is a new revision; older revisions stay viewable).
 */
import clsx from 'clsx';
import type { Revision } from '@/lib/types';
import { t } from '@/strings';

/**
 * Tab strip to switch between the revisions of a quote (R0, R1, R2 ...).
 * What the user sees: one tab per revision; the selected one is dark; a draft revision has a small "Draft"
 * tag. The strip scrolls sideways on phones. Each tab is a real `role="tab"` button for screen readers.
 * @param props.revisions - `quote.revisions` (all revisions, oldest first).
 * @param props.selected - revision NUMBER currently shown.
 * @param props.onSelect - called with the revision number when a tab is tapped (QuoteDetail stores it).
 * No local state, no API calls. QuoteDetail renders it only when there is more than one revision.
 */
export function RevisionTabs({ revisions, selected, onSelect }: { revisions: Revision[]; selected: number; onSelect: (rev: number) => void }) {
  return (
    <div role="tablist" aria-label={t.quoteDetail.revisionsLabel} className="flex flex-wrap gap-2 pb-1 md:-mx-4 md:flex-nowrap md:overflow-x-auto md:px-4">
      {revisions.map((r) => {
        const on = r.revision === selected;
        return (
          <button
            key={r.id} type="button" role="tab" aria-selected={on} onClick={() => onSelect(r.revision)}
            className={clsx('tap flex shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-base font-semibold',
              on ? 'border-forest-900 bg-forest-900 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}
          >
            {t.quoteDetail.revisionTab(r.revision)}
            {r.state === 'draft' && (
              <span className={clsx('rounded-full px-2 py-0.5 text-xs', on ? 'bg-gold-500 text-forest-950' : 'bg-gold-100 text-forest-900')}>{t.quoteDetail.draftTag}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
