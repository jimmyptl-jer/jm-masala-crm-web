/**
 * Composer step 1 "Message": pick a saved template (or write your own), then edit the campaign name, subject, message and the
 * call-to-action button text. "Save as a template" stores the current wording for reuse.
 * API: GET /marketing/templates (useTemplates); POST /marketing/templates (save as template). The wording keeps {variables}
 * ({buyer_name} etc.) that the server fills in for each buyer. Used by pages/CampaignNew.tsx.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Button, Card, ErrorNote, Input, Spinner, Textarea, errorMessage, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useTemplates } from '@/lib/hooks';
import { VARIABLES } from '@/lib/marketing';
import type { CampaignInput, MarketingTemplate, TemplateKind } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;

/**
 * @param props.form — the campaign being built. @param props.set — change some fields of it.
 * @param props.errors — field -> message to show under inputs (name, subject, body).
 */
export function MessageStep({ form, set, errors }: { form: CampaignInput; set: (p: Partial<CampaignInput>) => void; errors: Record<string, string> }) {
  const templates = useTemplates();
  const qc = useQueryClient();
  const toast = useToast();
  // the small "save as a template" form
  const [saving, setSaving] = useState(false);
  const [tplName, setTplName] = useState('');

  /** Fills subject, message and button from a template; the campaign name starts from it when still empty. */
  const pick = (x: MarketingTemplate | null) => {
    if (!x) { set({ template_id: null }); return; }
    set({ template_id: x.id, subject: x.subject, body: x.body, cta_label: x.cta_label ?? '', name: form.name || `${x.name}, ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` });
  };

  const saveTpl = useMutation({
    mutationFn: () => api.post<MarketingTemplate>('/marketing/templates', {
      name: tplName.trim(), kind: (templates.data?.find((x) => x.id === form.template_id)?.kind ?? 'company_intro') as TemplateKind,
      subject: form.subject, body: form.body, cta_label: form.cta_label ?? '',
    }),
    onSuccess: async (x) => { await qc.invalidateQueries({ queryKey: ['marketing', 'templates'] }); set({ template_id: x.id }); toast(m.templateSaved); setSaving(false); setTplName(''); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-serif text-xl font-semibold text-forest-900 md:text-2xl">{m.chooseTemplate}</h2>
        <p className="mb-3 text-sm text-ink/60">{m.chooseTemplateHint}</p>
        {templates.isPending ? <Spinner /> : templates.isError ? <ErrorNote error={templates.error} onRetry={() => void templates.refetch()} /> : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label={m.chooseTemplate}>
            {(templates.data ?? []).map((x) => (
              <button
                key={x.id} type="button" role="radio" aria-checked={form.template_id === x.id} onClick={() => pick(x)}
                className={clsx('min-h-[64px] rounded-lg border px-3 py-2 text-left', form.template_id === x.id ? 'border-forest-700 bg-forest-50 ring-2 ring-forest-700/30' : 'border-forest-900/20 bg-white hover:bg-forest-50')}
              >
                <span className="block font-semibold text-forest-900">{x.name}</span>
                <span className="block text-xs text-ink/60">{m.kind[x.kind]}</span>
              </button>
            ))}
            <button
              type="button" role="radio" aria-checked={form.template_id === null} onClick={() => pick(null)}
              className={clsx('min-h-[64px] rounded-lg border px-3 py-2 text-left', form.template_id === null ? 'border-forest-700 bg-forest-50 ring-2 ring-forest-700/30' : 'border-forest-900/20 bg-white hover:bg-forest-50')}
            >
              <span className="block font-semibold text-forest-900">{m.blankTemplate}</span>
            </button>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <Input label={m.nameLabel} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={m.namePlaceholder} error={errors.name} />
        <Input label={m.subjectLabel} value={form.subject} onChange={(e) => set({ subject: e.target.value })} error={errors.subject} />
        <Textarea label={m.bodyLabel} rows={10} value={form.body} onChange={(e) => set({ body: e.target.value })} error={errors.body} hint={`${m.bodyHint} ${VARIABLES.join(' ')}`} />
        <Input label={m.ctaLabel} optional value={form.cta_label ?? ''} onChange={(e) => set({ cta_label: e.target.value })} hint={m.ctaHint} />

        {saving ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input wrapperClassName="min-w-[14rem] flex-1" label={m.templateNameLabel} value={tplName} onChange={(e) => setTplName(e.target.value)} />
            <Button loading={saveTpl.isPending} disabled={!tplName.trim() || !form.subject.trim() || !form.body.trim()} onClick={() => saveTpl.mutate()}>{m.save}</Button>
            <Button variant="secondary" onClick={() => setSaving(false)}>{m.cancel}</Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setSaving(true)} disabled={!form.subject.trim() || !form.body.trim()}>{m.saveAsTemplate}</Button>
        )}
      </Card>
    </div>
  );
}
