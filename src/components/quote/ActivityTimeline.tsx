/**
 * Activity timeline (calls, messages, notes and automatic status-change entries) for one quote.
 * Used by pages/QuoteDetail.tsx; the data comes from GET /quotes/:id (`activities`, key ['quote', id]) and
 * entries are added through LogActivitySheet (POST /quotes/:id/activities). Read-only display; the audit
 * trail of issues and status changes is written by the API, not by the browser.
 */
import { dateTime } from '@/lib/format';
import type { Activity } from '@/lib/types';
import { Button, Card } from '@/components/ui';
import { t } from '@/strings';
import { ACTIVITY_ICON } from './shared';

/**
 * The "Activity" section of the Quote detail screen: a list of everything logged on the quote.
 *
 * What the user sees: a heading with a "Log activity" button, then each entry as icon + kind (Call, WhatsApp,
 * Email, Meeting, Note or Status change) + the text + date/time (India time) + "by <user>". "Nothing logged
 * yet" when empty. Status changes and issues appear here because the API writes them as `status_change`
 * activities (audit trail).
 * @param props.activities - `quote.activities` from GET /quotes/:id, newest first (the API orders them; this
 *   component does not re-sort).
 * @param props.onLog - called when the button is tapped; the parent opens LogActivitySheet.
 * No API calls and no local state here.
 */
export function ActivityTimeline({ activities, onLog }: { activities: Activity[]; onLog: () => void }) {
  const d = t.quoteDetail;
  return (
    <section aria-labelledby="activity-h">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="activity-h" className="text-[17px] font-bold leading-6 text-ink">{d.activityTitle}</h2>
        <Button variant="secondary" onClick={onLog}>{d.logButton}</Button>
      </div>
      <Card>
        {activities.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">{d.activityEmpty}</p>
        ) : (
          <ol className="divide-y divide-cream-200">
            {activities.map((a) => (
              <li key={a.id} className="flex gap-3 p-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-forest-50 text-forest-800">{ACTIVITY_ICON[a.kind]}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-forest-900">{t.common.activityKind[a.kind]}</div>
                  <p className="whitespace-pre-line break-words text-base text-ink">{a.body}</p>
                  <div className="mt-0.5 text-xs text-fg-muted">
                    {dateTime(a.happened_at)}{a.user_name ? ` · ${d.by(a.user_name)}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
