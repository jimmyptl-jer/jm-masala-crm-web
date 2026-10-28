/**
 * Search palette opened from the sidebar "Search" button or Ctrl/Cmd + K: type to jump to a page, a buyer or a quotation.
 * API: GET /buyers (useBuyers, already cached by other screens) filtered in the browser; GET /quotes?q=&limit=5 (debounced,
 * only for 2 or more characters, key ['quotes', 'palette', q]). No data is changed. Arrow keys move, Enter opens, Escape closes.
 * Local state: the text, the highlighted row.
 */
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '@/lib/api';
import { useBuyers, useDebounced } from '@/lib/hooks';
import type { QuoteList } from '@/lib/types';
import { t } from '@/strings';

const n = t.nav;

/** One result row. */
interface Hit { key: string; group: string; label: string; sub?: string; to: string }

/**
 * @param props.open - whether the palette is shown.
 * @param props.onClose - called on Escape, a click outside, or after choosing a result.
 * @param props.pages - the pages offered (label and route), taken from the sidebar so the two never disagree.
 */
export function CommandPalette({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: { label: string; to: string }[] }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const q = useDebounced(text.trim(), 250);
  const buyers = useBuyers({ archived: 'false' });
  const quotes = useQuery({
    queryKey: ['quotes', 'palette', q],
    queryFn: () => api.get<QuoteList>(`/quotes${qs({ q, limit: 5 })}`),
    enabled: open && q.length >= 2,
  });

  useEffect(() => { if (open) { setText(''); setIndex(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const needle = text.trim().toLowerCase();
    const out: Hit[] = [];
    pages.filter((p) => !needle || p.label.toLowerCase().includes(needle)).slice(0, 6).forEach((p) => out.push({ key: `p-${p.to}`, group: n.palettePages, label: p.label, to: p.to }));
    if (needle.length >= 1) {
      (buyers.data ?? []).filter((b) => [b.company_name, b.contact_name, b.country, b.city].filter(Boolean).join(' ').toLowerCase().includes(needle)).slice(0, 5)
        .forEach((b) => out.push({ key: `b-${b.id}`, group: n.paletteBuyers, label: b.company_name, sub: [b.city, b.country].filter(Boolean).join(', ') || undefined, to: `/buyers/${b.id}` }));
    }
    (q.length >= 2 ? quotes.data?.data ?? [] : []).forEach((x) => out.push({ key: `q-${x.id}`, group: n.paletteQuotes, label: x.number ?? t.quotes.draftNumber, sub: x.buyer_name, to: x.latest_state === 'draft' && x.quote_no === null ? `/quotes/${x.id}/edit` : `/quotes/${x.id}` }));
    return out;
  }, [text, q, pages, buyers.data, quotes.data]);

  useEffect(() => { setIndex(0); }, [text]);

  if (!open) return null;
  const go = (h: Hit) => { onClose(); navigate(h.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && hits[index]) { e.preventDefault(); go(hits[index]!); }
    else if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label={n.paletteTitle}>
      <button type="button" aria-label={n.close} onClick={onClose} className="absolute inset-0 cursor-default bg-ink/30" />
      <div className="glass-panel-strong relative w-full max-w-lg overflow-hidden shadow-pop">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="h-4 w-4 text-ink-muted" aria-hidden />
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder={n.palettePlaceholder} aria-label={n.paletteTitle}
            className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-ink-placeholder focus:outline-none" />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-ink-muted">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1" role="listbox">
          {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-muted">{n.paletteNone}</li>}
          {hits.map((h, i) => (
            <li key={h.key} role="option" aria-selected={i === index}>
              {(i === 0 || hits[i - 1]!.group !== h.group) && <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted">{h.group}</p>}
              <button type="button" onMouseEnter={() => setIndex(i)} onClick={() => go(h)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${i === index ? 'bg-paprika-50 text-paprika-700' : 'text-ink-secondary'}`}>
                <span className="truncate font-bold">{h.label}</span>{h.sub && <span className="truncate text-xs text-ink-muted">{h.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
