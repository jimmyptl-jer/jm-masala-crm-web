/**
 * Composer step 4 "Preview & send": the exact e-mail as one buyer will see it (in a locked frame), who it goes to, what is
 * attached, a test-e-mail box, a price warning when the message mentions prices, a confirmation tick and the Send button.
 * API (all on the saved draft, key ['marketing', 'preview', id, buyer, version]): POST /marketing/campaigns/:id/preview;
 * POST /marketing/campaigns/:id/test ({ to }); POST /marketing/campaigns/:id/send (admin only). Sending needs the server to
 * have SMTP set up; otherwise the buttons are disabled with a note. Used by pages/CampaignNew.tsx.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { EmailOffNote } from '@/components/marketing/shared';
import { Button, Card, ErrorNote, Input, Spinner, errorMessage, useToast } from '@/components/ui';
import { useAuth } from '@/auth/AuthProvider';
import { api } from '@/lib/api';
import { useSendChannels } from '@/lib/hooks';
import { fileSize } from '@/lib/marketing';
import type { CampaignInput, CampaignPreview } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;

/** True when the message looks like it carries prices (words like price / rate, a currency code, or a symbol with a number). */
const mentionsPrice = (s: string) => /\b(price|prices|pricing|rate|rates|quotation|usd|inr|eur|gbp|aed)\b|[$₹€£]\s?\d/i.test(s);

/**
 * @param props.form — the campaign (used for the price check). @param props.id — the saved draft's id.
 * @param props.version — bumps each time the draft is saved, so the preview reloads. @param props.onSent — called with the
 *   campaign id once the send has started (the page opens the report).
 */
export function ReviewStep({ form, id, version, onSent }: { form: CampaignInput; id: string; version: number; onSent: (id: string) => void }) {
  const { me, isAdmin } = useAuth();
  const channels = useSendChannels();
  const toast = useToast();
  // preview as this buyer ('' = the first recipient)
  const [as, setAs] = useState('');
  const [testTo, setTestTo] = useState(me?.email ?? '');
  const [confirmed, setConfirmed] = useState(false);

  const preview = useQuery({
    queryKey: ['marketing', 'preview', id, as, version],
    queryFn: () => api.post<CampaignPreview>(`/marketing/campaigns/${id}/preview`, as ? { buyer_id: as } : {}),
  });
  const test = useMutation({
    mutationFn: () => api.post<{ to: string }>(`/marketing/campaigns/${id}/test`, { to: testTo.trim() }),
    onSuccess: (r) => toast(m.testSent(r.to)),
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const send = useMutation({
    mutationFn: () => api.post<{ id: string; recipients: number }>(`/marketing/campaigns/${id}/send`),
    onSuccess: () => { toast(m.sendStarted); onSent(id); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const p = preview.data;
  const pricey = mentionsPrice(`${form.subject} ${form.body}`) || (p?.files ?? []).some((f) => /price|rate/i.test(f.name));
  const count = p?.recipients.count ?? 0;
  const canSend = channels.email && isAdmin && confirmed && count > 0 && !send.isPending;

  return (
    <div className="space-y-4">
      <EmailOffNote />
      {preview.isPending && <Spinner />}
      {preview.isError && <ErrorNote error={preview.error} onRetry={() => void preview.refetch()} />}

      {p && (
        <>
          <Card className="p-4">
            <h2 className="mb-2 text-[17px] font-bold leading-6 text-ink">{m.reviewSummary}</h2>
            <dl className="grid gap-x-6 gap-y-2 text-base sm:grid-cols-[8rem_1fr]">
              <dt className="text-fg-muted">{m.from}</dt><dd>{me?.full_name} · JM Masala Trading LLP</dd>
              <dt className="text-fg-muted">{m.subject}</dt><dd className="font-semibold text-forest-900">{p.subject}</dd>
              <dt className="text-fg-muted">{m.to}</dt><dd className="font-semibold text-forest-900">{m.willReceive(count)}</dd>
              <dt className="text-fg-muted">{m.attachments}</dt>
              <dd>{p.files.length === 0 ? m.none : p.files.map((f) => `${f.name} (${fileSize(f.size)})`).join(', ')}</dd>
            </dl>
            {count > 0 && p.recipients.matched > count && (
              <p className="mt-2 text-sm text-fg-secondary">
                {[p.recipients.excluded.opted_out && m.excludedOptedOut(p.recipients.excluded.opted_out), p.recipients.excluded.no_email && m.excludedNoEmail(p.recipients.excluded.no_email),
                  p.recipients.excluded.invalid_email && m.excludedInvalid(p.recipients.excluded.invalid_email), p.recipients.excluded.duplicate_email && m.excludedDuplicate(p.recipients.excluded.duplicate_email)]
                  .filter(Boolean).join(' · ')}
              </p>
            )}
            {count === 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{m.noRecipients}</p>}
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-forest-900">{m.previewAs}</span>
              {p.recipients.sample.map((s) => (
                <button key={s.id} type="button" aria-pressed={p.sample_buyer.id === s.id} onClick={() => setAs(s.id)}
                  className={clsx('min-h-[36px] rounded-full border px-3 text-sm', p.sample_buyer.id === s.id ? 'border-forest-700 bg-forest-700 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}>{s.company_name}</button>
              ))}
            </div>
            {/* the e-mail exactly as built; sandbox="" blocks scripts and links leaving the frame */}
            <iframe title={m.previewFrame} srcDoc={p.html} sandbox="" className="h-[34rem] w-full rounded-lg border border-cream-200 bg-white" />
          </Card>

          <Card className="space-y-2 p-4">
            <h2 className="text-[17px] font-bold leading-6 text-ink">{m.testHeading}</h2>
            <p className="text-sm text-fg-muted">{m.testHint}</p>
            <div className="flex flex-wrap items-end gap-2">
              <Input wrapperClassName="min-w-[14rem] flex-1" label={m.testLabel} type="email" inputMode="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <Button variant="secondary" loading={test.isPending} disabled={!channels.email || !testTo.trim()} onClick={() => test.mutate()}>{m.testSend}</Button>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            {pricey && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{m.priceWarning}</p>}
            <label className="tap flex items-start gap-3 text-base text-forest-900">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-forest-700" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {m.confirmCheck}
            </label>
            {!isAdmin && <p className="text-sm text-fg-muted">{m.adminOnly}</p>}
            <Button className="w-full md:w-auto" disabled={!canSend} loading={send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? m.sending : m.sendButton(count)}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
