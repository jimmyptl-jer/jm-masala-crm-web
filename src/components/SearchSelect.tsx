/**
 * Searchable picker used for choosing a buyer or a product from long lists, built on the Field and Sheet
 * components in ui.tsx.
 * Presentation only: the caller passes the options (loaded elsewhere, e.g. useBuyers / useProducts in
 * lib/hooks.ts) and receives the chosen value. Makes no API calls.
 * Supports the quick-add link (onAddNew) so a missing buyer can be created without leaving the quote form
 * (FR-15).
 */

import clsx from 'clsx';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Field, Sheet } from './ui';

/**
 * One choice in a SearchSelect: `value` (what onChange gets, e.g. an id), `label` (main text), optional
 * `sub` (smaller grey second line, also searched) and `disabled` (shown but not selectable).
 */
export interface Option { value: string; label: string; sub?: string; disabled?: boolean }

/**
 * Searchable dropdown (the SRS prefers dropdowns over typing). The closed control looks like a select box;
 * tapping it opens a Sheet (bottom sheet on phone, so the list is thumb-reachable) with a search box and
 * the list. Optional "add new" row for quick-add (FR-15).
 * Used by the quote form (buyer and product pickers) and the duplicate-quote sheet.
 * @param props.label — field label (also the sheet title). @param props.value — the selected option's value
 *   ('' for none).
 * @param props.options — all choices; filtering happens in the browser, nothing is fetched here.
 * @param props.onChange — called with the chosen option's value; the sheet then closes.
 * @param props.placeholder — text when nothing is selected. @param props.searchPlaceholder — hint inside
 *   the search box.
 * @param props.error — red message under the control. @param props.disabled — cannot be opened. @param
 *   props.optional — adds "(optional)" to the label.
 * @param props.onAddNew — if given, a dashed "Add new" row appears at the top; clicking it closes the sheet
 *   and calls this (the caller opens its own form, e.g. BuyerForm).
 * @param props.addNewLabel — text of that row. @param props.emptyText — shown when the search matches
 *   nothing.
 * Local state: open (sheet visible) and q (search text, cleared every time the sheet opens). If `value`
 * matches no option the placeholder is shown.
 */
export function SearchSelect({ label, value, options, onChange, placeholder = 'Choose…', searchPlaceholder = 'Search…', error, disabled, optional, onAddNew, addNewLabel = 'Add new', emptyText = 'Nothing found' }: {
  label: string; value: string; options: Option[]; onChange: (v: string) => void; placeholder?: string; searchPlaceholder?: string;
  error?: string; disabled?: boolean; optional?: boolean; onAddNew?: () => void; addNewLabel?: string; emptyText?: string;
}) {
  // Whether the picker sheet is open.
  const [open, setOpen] = useState(false);
  // Current search text.
  const [q, setQ] = useState('');
  // Used to focus the search box when the sheet opens.
  const inputRef = useRef<HTMLInputElement>(null);
  // The option matching `value`, or undefined (then the placeholder is shown).
  const selected = options.find((o) => o.value === value);

  // On open: clear the previous search and focus the search box. The 50 ms delay lets the sheet mount
  // first.
  useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50); } }, [open]);

  // Options to list: case-insensitive substring match of the search text against label + sub; everything
  // when the search is empty.
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => `${o.label} ${o.sub ?? ''}`.toLowerCase().includes(s)) : options;
  }, [q, options]);

  return (
    <>
      <Field label={label} error={error} optional={optional}>
        {(id) => (
          <button
            id={id} type="button" disabled={disabled} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-invalid={!!error}
            className={clsx('flex min-h-tap w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-left text-base disabled:bg-cream-100',
              error ? 'border-red-600' : 'border-forest-900/25')}
          >
            <span className={clsx('min-w-0 truncate', !selected && 'text-ink/40')}>
              {selected ? <>{selected.label}{selected.sub && <span className="ml-2 text-sm text-ink/55">{selected.sub}</span>}</> : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink/50" aria-hidden />
          </button>
        )}
      </Field>

      {/* The picker. Selecting a row calls onChange and closes; disabled options cannot be clicked. */}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
            className="min-h-tap w-full rounded-lg border border-forest-900/25 bg-white py-2 pl-9 pr-3 text-base focus:border-gold-600 focus:outline-none focus:ring-2 focus:ring-gold-500/40"
          />
        </div>
        {onAddNew && (
          <button type="button" onClick={() => { setOpen(false); onAddNew(); }}
            className="tap mb-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-gold-600 px-3 py-2 text-left font-semibold text-gold-600 hover:bg-gold-100">
            <Plus className="h-4 w-4" aria-hidden /> {addNewLabel}
          </button>
        )}
        <ul role="listbox" className="divide-y divide-cream-200 overflow-hidden rounded-lg border border-cream-200 bg-white">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink/60">{emptyText}</li>}
          {shown.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button type="button" disabled={o.disabled}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={clsx('tap w-full px-3 py-2.5 text-left hover:bg-forest-50 disabled:opacity-40', o.value === value && 'bg-forest-50 font-semibold')}>
                <div className="text-base text-ink">{o.label}</div>
                {o.sub && <div className="text-sm text-ink/55">{o.sub}</div>}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
