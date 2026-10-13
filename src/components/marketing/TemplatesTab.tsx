/**
 * Marketing > Templates: the saved e-mail wording. Shows every template (kind, subject, the first lines of the message), lets
 * you add, edit and archive them. Starter templates are installed by the database; none of them contains a price.
 * API: GET /marketing/templates (useTemplates, key ['marketing', 'templates']); POST /marketing/templates;
 * PATCH /marketing/templates/:id (edit, or { archived: true }); each change invalidates ['marketing', 'templates'].
 * Used by pages/Marketing.tsx.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, EmptyState, ErrorNote, Input, Select, Sheet, Spinner, Textarea, errorMessage, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useTemplates } from '@/lib/hooks';
import { TEMPLATE_KINDS, VARIABLES } from '@/lib/marketing';
import type { MarketingTemplate, TemplateKind } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;

/** What the form edits. */
interface Draft { name: string; kind: TemplateKind; subject: string; body: string; cta_label: string }
const blank = (): Draft => ({ name: '', kind: 'company_intro', subject: '', body: '', cta_label: 'Request a Quotation' });

/** The Templates tab; see the file comment. */
export function TemplatesTab() {
  const q = useTemplates();
  const qc = useQueryClient();
  const toast = useToast();
  // which template is open in the sheet: a template, 'new', or null (closed)
  const [editing, setEditing] = useState<MarketingTemplate | 'new' | null>(null);
  const [f, setF] = useState<Draft>(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Opens the sheet with a template's values (or a blank form for 'new'). */
  const open = (x: MarketingTemplate | 'new') => {
    setErrors({});
    setF(x === 'new' ? blank() : { name: x.name, kind: x.kind, subject: x.subject, body: x.body, cta_label: x.cta_label ?? '' });
    setEditing(x);
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, cta_label: f.cta_label.trim() };
      return editing === 'new' || editing === null
        ? api.post<MarketingTemplate>('/marketing/templates', body)
        : api.patch<MarketingTemplate>(`/marketing/templates/${editing.id}`, body);
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['marketing', 'templates'] }); toast(m.templateSaved); setEditing(null); },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); else toast(errorMessage(e), 'error'); },
  });
  const archive = useMutation({
    mutationFn: (id: string) => api.patch<MarketingTemplate>(`/marketing/templates/${id}`, { archived: true }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['marketing', 'templates'] }); toast(m.templateArchived); setEditing(null); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const rows = q.data ?? [];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-semibold text-forest-900 md:text-2xl">{m.templatesHeading}</h2>
          <p className="text-sm text-ink/60">{m.templatesHint}</p>
        </div>
        <Button onClick={() => open('new')}><Plus className="h-5 w-5" aria-hidden />{m.newTemplate}</Button>
      </div>

      {q.isPending ? <Spinner /> : q.isError ? <ErrorNote error={q.error} onRetry={() => void q.refetch()} /> : rows.length === 0 ? (
        <Card><EmptyState title={m.templatesEmpty} /></Card>
      ) : (
        <ul className="grid gap-2 xl:grid-cols-2">
          {rows.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => open(x)} className="card block w-full px-4 py-3 text-left hover:bg-forest-50">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <span className="text-lg font-semibold text-forest-900">{x.name}</span>
                  <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-xs font-semibold text-forest-900">{m.kind[x.kind]}</span>
                </div>
                <div className="truncate text-sm font-medium text-ink/80">{x.subject}</div>
                <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-ink/60">{x.body}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet wide open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? m.newTemplate : m.editTemplate}>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={m.templateNameLabel} value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
            <Select label={m.kindLabel} value={f.kind} onChange={(e) => set('kind', e.target.value as TemplateKind)} error={errors.kind}>
              {TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{m.kind[k]}</option>)}
            </Select>
          </div>
          <Input label={m.subjectLabel} value={f.subject} onChange={(e) => set('subject', e.target.value)} error={errors.subject} />
          <Textarea label={m.bodyLabel} rows={9} value={f.body} onChange={(e) => set('body', e.target.value)} hint={`${m.bodyHint} (${VARIABLES.join(' ')})`} error={errors.body} />
          <Input label={m.ctaLabel} optional value={f.cta_label} onChange={(e) => set('cta_label', e.target.value)} hint={m.ctaHint} />
          <div className="flex flex-wrap gap-2 pt-1">
            {editing !== 'new' && editing !== null && (
              <Button type="button" variant="danger" loading={archive.isPending} onClick={() => archive.mutate(editing.id)}>{m.archive}</Button>
            )}
            <Button type="button" variant="secondary" className="ml-auto" onClick={() => setEditing(null)}>{m.cancel}</Button>
            <Button type="submit" loading={save.isPending}>{m.save}</Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
