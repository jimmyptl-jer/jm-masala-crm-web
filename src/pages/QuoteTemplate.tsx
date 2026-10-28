/**
 * Quotation template preview, route `/quotes/template`: edit the template's data as JSON and see the document render
 * straight away, then Download PDF (browser print). It shows that the template is data driven: QuoteDocument takes a
 * QuoteDocData object and nothing else, so the quote form today, and the API when it renders the issued PDF, push their data
 * into the same template. Starts from the sample quotation (lib/sampleQuote.ts). No API calls; nothing is saved.
 * The JSON is checked for the required keys; a problem is shown above the preview and the last valid data stays on screen.
 */
import { Download, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { QuoteDocument, ScaledPage, type QuoteDocData } from '@/components/quote/QuoteDocument';
import { Button, PageHeader } from '@/components/ui';
import { SAMPLE_QUOTE } from '@/lib/sampleQuote';
import { t } from '@/strings';

const s = t.quotes;
const SAMPLE_JSON = JSON.stringify(SAMPLE_QUOTE, null, 2);
/** Keys the template needs; each is checked to exist and have the right basic type. */
const REQUIRED: [keyof QuoteDocData, 'object' | 'string' | 'array'][] = [
  ['company', 'object'], ['date', 'string'], ['buyer', 'object'], ['details', 'array'], ['qtyHead', 'string'], ['rateHead', 'string'],
  ['amountHead', 'string'], ['lines', 'array'], ['summary', 'array'], ['terms', 'array'], ['bank', 'array'],
];

/** Parses the JSON and checks the shape. @returns the data, or a message saying what is wrong. */
function parse(text: string): { data: QuoteDocData } | { error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { error: `${s.tplBadJson}: ${(e as Error).message}` }; }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { error: s.tplNotObject };
  const o = raw as Record<string, unknown>;
  for (const [key, kind] of REQUIRED) {
    const v = o[key];
    const ok = kind === 'array' ? Array.isArray(v) : kind === 'object' ? typeof v === 'object' && v !== null && !Array.isArray(v) : typeof v === 'string';
    if (!ok) return { error: s.tplMissing(key, kind) };
  }
  return { data: o as unknown as QuoteDocData };
}

/** Template preview page. Local state: the JSON text and the last data that parsed. */
export default function QuoteTemplate() {
  const [text, setText] = useState(SAMPLE_JSON);
  const result = useMemo(() => parse(text), [text]);
  // keep showing the last valid data while the JSON is being edited
  const [lastGood, setLastGood] = useState<QuoteDocData>(SAMPLE_QUOTE);
  const data = 'data' in result ? result.data : lastGood;
  if ('data' in result && result.data !== lastGood) setLastGood(result.data);

  return (
    <div className="space-y-4">
      <PageHeader
        title={s.tplTitle}
        subtitle={s.tplSubtitle}
        actions={(
          <>
            <Button variant="secondary" onClick={() => setText(SAMPLE_JSON)}><RotateCcw className="h-4 w-4" aria-hidden />{s.tplReset}</Button>
            <Button onClick={() => window.print()}><Download className="h-4 w-4" aria-hidden />{s.previewDownload ?? 'Download PDF'}</Button>
          </>
        )}
      />
      <p className="text-sm text-ink-muted">{s.tplHelp} <Link to="/quotes" className="font-bold text-paprika hover:underline">{s.tplBack}</Link></p>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-line bg-surface p-3 shadow-card" aria-label={s.tplDataLabel}>
          <label htmlFor="tpl-json" className="mb-1.5 block text-xs font-bold text-ink-secondary">{s.tplDataLabel}</label>
          <textarea id="tpl-json" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
            className="h-[70vh] w-full resize-y rounded-lg border border-line-strong bg-surface p-3 font-mono text-xs leading-5 text-ink focus:border-paprika focus:outline-none focus:ring-2 focus:ring-paprika/20" />
          {'error' in result && <p role="alert" className="mt-2 text-sm text-danger-ink">{result.error}</p>}
        </section>
        <section className="min-w-0" aria-label={s.tplPreviewLabel}>
          <div className="overflow-hidden rounded-lg border border-line bg-white shadow-card"><ScaledPage><QuoteDocument data={data} /></ScaledPage></div>
        </section>
      </div>
      {createPortal(<div className="quote-print-root"><QuoteDocument data={data} /></div>, document.body)}
    </div>
  );
}
