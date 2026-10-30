/**
 * The quotation as the API made it: the finished page in the JM Masala letterhead format (shown in a frame exactly as received, scaled to fit)
 * and, on the second tab, the e-mail that Send will deliver (to, subject, message). Pure display: the page, the figures and the e-mail text all
 * come from the API (QuoteDetail.document), nothing is built or calculated here, and cost and margin are never part of it.
 * The frame is sandboxed without scripts; `allow-same-origin` is only there so its height can be measured. Used by pages/QuoteForm.tsx.
 */
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { DocumentPreview } from '@/lib/types';
import { t } from '@/strings';

const s = t.quoteForm;
/** The page is a fixed A4 width of 794 px; it is scaled down to fit narrower spaces. */
const PAGE_WIDTH = 794;

export function ApiQuotePreview({ doc }: { doc: DocumentPreview }) {
  const [tab, setTab] = useState<'doc' | 'email'>('doc');
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(PAGE_WIDTH);
  const [height, setHeight] = useState(1123);

  // fit the page to the width of its container
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const fit = () => setWidth(el.clientWidth || PAGE_WIDTH);
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab]);

  const scale = Math.min(1, width / PAGE_WIDTH);
  const tabCls = (on: boolean) => clsx('tap rounded-md px-4 text-sm font-bold', on ? 'bg-ink text-white' : 'text-ink-secondary hover:bg-surface-hover');

  return (
    <div className="space-y-3">
      <div role="tablist" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
        <button type="button" role="tab" aria-selected={tab === 'doc'} onClick={() => setTab('doc')} className={tabCls(tab === 'doc')}>{s.apiPreviewTabDoc}</button>
        <button type="button" role="tab" aria-selected={tab === 'email'} onClick={() => setTab('email')} className={tabCls(tab === 'email')}>{s.apiPreviewTabEmail}</button>
      </div>

      {tab === 'doc' ? (
        <>
          <div ref={box} className="overflow-hidden rounded-lg border border-line bg-white shadow-card" style={{ height: height * scale }}>
            <iframe
              title={s.apiPreviewFrame}
              srcDoc={doc.html}
              sandbox="allow-same-origin"
              scrolling="no"
              style={{ width: PAGE_WIDTH, height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}
              onLoad={(e) => { const d = e.currentTarget.contentDocument; if (d) setHeight(Math.max(1123, d.documentElement.scrollHeight)); }}
            />
          </div>
          <p className="text-xs text-ink-muted">{s.apiPreviewHint}</p>
        </>
      ) : (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          {doc.email.to ? (
            <dl className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="font-bold text-ink-muted">{s.emailTo}</dt><dd className="break-all text-ink">{doc.email.to}</dd>
              <dt className="font-bold text-ink-muted">{s.emailSubject}</dt><dd className="text-ink">{doc.email.subject}</dd>
            </dl>
          ) : (
            <p role="alert" className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-ink">{s.emailNoAddress}</p>
          )}
          <pre aria-label={s.emailBody} className="whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 font-sans text-sm leading-relaxed text-ink">{doc.email.text}</pre>
        </div>
      )}
    </div>
  );
}
