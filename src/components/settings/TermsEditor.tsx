/**
 * Settings > Default terms (admin only): editable lists of terms and conditions for export and domestic
 * quotes.
 * Saves through useSectionSave -> PUT /settings (export_terms, domestic_terms); cache key ['settings'] is
 * updated. New quotes copy these lines.
 * Exports TermsEditor (the reusable list editor) and TermsPanel (the section). Rendered by
 * pages/Settings.tsx.
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Textarea } from '@/components/ui';
import type { Settings } from '@/lib/types';
import { t } from '@/strings';
import { SaveBar, useSectionSave } from './shared';

const s = t.settings;

/**
 * Editor for an ordered list of text lines (the default terms and conditions): each line is a text box with
 * move up, move down and remove buttons, plus an "Add term" button.
 * Controlled component: it holds no state; every change calls onChange with the whole new array.
 * @param props.title — heading of the group (also used to build error keys). @param props.items — current
 *   lines.
 * @param props.onChange — receives the new array. @param props.errors — messages keyed `${title}.${index}`
 *   shown under the matching line.
 * Note: the buttons are plain Buttons (type="button"), so they never submit the surrounding form.
 */
export function TermsEditor({ title, items, onChange, errors }:
  { title: string; items: string[]; onChange: (next: string[]) => void; errors: Record<string, string> }) {
  /**
   * Swap line `i` with its neighbour (d = -1 up, +1 down); does nothing at the ends. @param i — line index.
   * @param d — direction.
   */
  const move = (i: number, d: -1 | 1) => {
    const next = [...items];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <fieldset className="space-y-3 rounded-lg border border-forest-900/15 p-3">
      <legend className="px-1 text-lg font-semibold text-forest-900">{title}</legend>
      {items.length === 0 && <p className="text-sm text-ink/60">{s.noTerms}</p>}
      {items.map((line, i) => (
        <div key={i} className="space-y-1">
          <Textarea label={s.term(i + 1)} rows={2} value={line} error={errors[`${title}.${i}`]} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <div className="flex gap-2">
            <Button variant="secondary" className="px-3" aria-label={s.moveUp(i + 1)} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-5 w-5" aria-hidden /></Button>
            <Button variant="secondary" className="px-3" aria-label={s.moveDown(i + 1)} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-5 w-5" aria-hidden /></Button>
            <Button variant="secondary" className="ml-auto px-3 text-red-700" aria-label={s.removeTerm(i + 1)} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 className="h-5 w-5" aria-hidden /></Button>
          </div>
        </div>
      ))}
      <Button variant="secondary" className="w-full" onClick={() => onChange([...items, ''])}><Plus className="h-5 w-5" aria-hidden />{s.addTerm}</Button>
    </fieldset>
  );
}

/** Trim every line and drop empty ones; this is what is actually saved. @param lines — raw lines. */
const clean = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean);

/**
 * "Default terms" section of Settings (admin): two editors, Export terms and Domestic terms; these lines
 * are copied into new quotes and printed on the PDF.
 * @param props.settings — current settings from GET /settings; copied into local state once.
 * Save: run({ export_terms, domestic_terms }) with blank lines removed -> PUT /settings -> toast; on
 * success the editors are refreshed with the cleaned lists. API errors keyed 'export_terms.<i>' /
 * 'domestic_terms.<i>' appear under the matching line; a list-level error (e.g. more than 30 terms) appears
 * below both editors.
 * Local state: exp and dom (arrays of strings).
 */
export function TermsPanel({ settings }: { settings: Settings }) {
  // Save plumbing from shared.tsx (busy, errors from the API, fatal, run).
  const { busy, errors, fatal, run } = useSectionSave();
  // Working copy of the export terms (a copy, so editing never mutates the cached settings).
  const [exp, setExp] = useState<string[]>(() => [...settings.export_terms]);
  // Working copy of the domestic terms.
  const [dom, setDom] = useState<string[]>(() => [...settings.domestic_terms]);

  /**
   * Pick the API errors that belong to one list and re-key them for TermsEditor: 'export_terms.2' becomes
   * `${title}.2`.
   * @param key — which list. @param title — that editor's title (the key prefix TermsEditor looks up).
   */
  const pick = (key: 'export_terms' | 'domestic_terms', title: string) =>
    Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith(`${key}.`)).map(([k, v]) => [`${title}.${k.split('.')[1]}`, v]));

  /**
   * Form submit: save the cleaned lists; if the API accepted them, replace the local lists with the cleaned
   * versions. @param ev — submit event.
   */
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const ok = await run({ export_terms: clean(exp), domestic_terms: clean(dom) });
    if (ok) { setExp(clean(exp)); setDom(clean(dom)); }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-sm text-ink/70">{s.termsHelp}</p>
      <TermsEditor title={s.exportTerms} items={exp} onChange={setExp} errors={pick('export_terms', s.exportTerms)} />
      <TermsEditor title={s.domesticTerms} items={dom} onChange={setDom} errors={pick('domestic_terms', s.domesticTerms)} />
      {(errors.export_terms || errors.domestic_terms) && <p role="alert" className="text-sm text-red-700">{errors.export_terms ?? errors.domestic_terms}</p>}
      <SaveBar busy={busy} fatal={fatal} />
    </form>
  );
}
