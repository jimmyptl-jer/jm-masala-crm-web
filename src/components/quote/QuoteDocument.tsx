/**
 * The quotation as a document: the JM Masala letterhead (logo, company line, licence strip, faded watercolour)
 * followed by the predefined quotation layout: "Quotation to" and quotation details, the product table, amount in
 * words, terms & conditions, bank details with the signature block, and the closing note.
 *
 * Pure presentation of a ready-made QuoteDocData: no API calls, and no amount is worked out here. The same layout
 * is what the API must render into the PDF that is attached to the e-mail (see docs/QUOTE-DOCUMENT.md); for now
 * the browser prints this component to PDF ("Download PDF" in QuotePreview). Cost and margin never appear.
 * The page is a fixed A4 size (794 x 1123 px); wrap it in ScaledPage to fit a smaller space.
 */
import clsx from 'clsx';
import { Fragment, useEffect, useRef, useState } from 'react';
import { pdfBrand } from '@/lib/design-tokens';
import { LETTERHEAD, LETTERHEAD_ASSETS } from '@/lib/letterhead';

/** One row of the product table; every value is already formatted text. */
export interface DocLine { name: string; spec: string | null; hsn: string | null; packing: string | null; qty: string; rate: string; amount: string }

/** Everything the document shows. */
export interface QuoteDocData {
  /** Letterhead and signature facts, from company settings. */
  company: { name: string; office: string; phone: string; email: string; web: string; licences: [string, string][][]; signatory: { name: string; title: string } };
  /** Printed quote number, or null for a draft. */
  number: string | null;
  date: string;
  validUntil: string | null;
  buyer: { name: string; lines: string[]; attn: string | null; email: string | null };
  /** Right-hand detail rows after number, date and validity (price basis, port of loading, currency ...). */
  details: [string, string][];
  /** Column captions that depend on currency and unit, e.g. 'Qty (MT)'. */
  qtyHead: string;
  rateHead: string;
  amountHead: string;
  lines: DocLine[];
  /** Rows above the total (subtotal, discount, freight, GST ...), already formatted. */
  summary: [string, string][];
  total: string | null;
  amountWords: string | null;
  /** Numbered clauses; `label` is printed in bold before the text (null for a free-text clause). */
  terms: { label: string | null; text: string }[];
  bank: [string, string][];
  notes: string | null;
}

// the PDF keeps the letterhead look (brown + gold), see pdfBrand in lib/design-tokens.ts; small gold text uses goldInk for contrast
const BROWN = pdfBrand.brown;
const GOLD = pdfBrand.gold;
const GOLD_INK = pdfBrand.goldInk;
const INK = pdfBrand.ink;
const th = 'px-2 py-2 text-center text-[11px] font-semibold text-white';

/** The document itself (A4). `className` is added to the page element. */
export function QuoteDocument({ data: d, className }: { data: QuoteDocData; className?: string }) {
  const rows: [string, string][] = [
    ['Quotation No.', d.number ?? 'Draft'], ['Date', d.date], ['Valid Until', d.validUntil ?? '—'], ...d.details,
  ];
  return (
    <div className={clsx('quote-doc relative overflow-hidden bg-white', className)} style={{ width: 794, minHeight: 1123, color: INK, fontFamily: 'Lato, system-ui, sans-serif', fontSize: 12 }}>
      {/* faded watercolour behind the lower part of the page */}
      <div aria-hidden className="absolute inset-x-0 bottom-0" style={{ height: '58%', backgroundImage: `url(${LETTERHEAD_ASSETS.watercolour})`, backgroundSize: '100% auto', backgroundPosition: 'bottom', backgroundRepeat: 'no-repeat', opacity: 0.13, WebkitMaskImage: 'linear-gradient(to top, black 55%, transparent)', maskImage: 'linear-gradient(to top, black 55%, transparent)' }} />

      <div className="relative px-16 pt-10">
        <header className="flex items-start gap-6">
          <img src={LETTERHEAD_ASSETS.logo} alt="" width={104} height={104} className="shrink-0" />
          <div className="min-w-0">
            <div style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', color: BROWN, fontSize: 44, fontWeight: 700, lineHeight: 1.05, letterSpacing: '0.01em' }}>{d.company.name}</div>
            <div className="mt-1.5" style={{ color: GOLD_INK, fontSize: 13, fontWeight: 700 }}>{LETTERHEAD.tagline}</div>
            <div className="mt-1.5 text-[11px] leading-relaxed">{d.company.office && <><span style={{ color: GOLD_INK }}>Corporate Office:</span> {d.company.office}</>}</div>
            <div className="text-[11px] leading-relaxed">{d.company.phone && <><span style={{ color: GOLD_INK }}>Phone:</span> {d.company.phone}</>}{d.company.email && <> <span className="ml-3" style={{ color: GOLD_INK }}>Email:</span> {d.company.email}</>}{d.company.web && <> <span className="ml-3" style={{ color: GOLD_INK }}>Web:</span> {d.company.web}</>}</div>
          </div>
        </header>
      </div>

      {d.company.licences.length > 0 && <div className="relative mx-16 mt-3 py-2 text-center" style={{ background: pdfBrand.strip, borderTop: `2px solid ${GOLD}`, borderBottom: `2px solid ${GOLD}` }}>
        {d.company.licences.map((row, i) => (
          <div key={i} className="text-[11px] leading-6">
            {row.map(([k, v], j) => <Fragment key={k}>{j > 0 && <span className="mx-3" style={{ color: GOLD_INK }}>{'◆'}</span>}<span className="font-semibold" style={{ color: GOLD_INK }}>{k}</span> {v}</Fragment>)}
          </div>
        ))}
      </div>}

      <div className="relative px-16">
        <div className="my-5 flex items-center justify-center gap-5">
          <span className="h-px w-24" style={{ background: GOLD }} />
          <span style={{ fontFamily: '"Cormorant Garamond", Georgia, serif', color: BROWN, fontSize: 30, letterSpacing: '0.35em', fontWeight: 600 }}>QUOTATION</span>
          <span className="h-px w-24" style={{ background: GOLD }} />
        </div>

        <div className="grid grid-cols-2" style={{ border: `1px solid ${GOLD}` }}>
          <div className="p-3 leading-relaxed">
            <div className="text-[11px] font-bold" style={{ color: GOLD_INK }}>QUOTATION TO</div>
            <div className="mt-1 text-[14px] font-bold">{d.buyer.name}</div>
            {d.buyer.lines.map((l) => <div key={l}>{l}</div>)}
            {d.buyer.attn && <div>{d.buyer.attn}</div>}
            {d.buyer.email && <div>Email: {d.buyer.email}</div>}
          </div>
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-3 gap-y-1 p-3" style={{ borderLeft: `1px solid ${GOLD}` }}>
            {rows.map(([k, v]) => <Fragment key={k}><dt className="font-bold" style={{ color: GOLD_INK }}>{k}</dt><dd>{v}</dd></Fragment>)}
          </dl>
        </div>

        <table className="mt-5 w-full border-collapse text-[12px]" style={{ border: `1px solid ${GOLD}` }}>
          <thead>
            <tr style={{ background: BROWN }}>
              <th className={th} style={{ width: 34 }}>Sr.</th><th className={clsx(th, 'text-left')}>Product &amp; Specification</th>
              <th className={th} style={{ width: 72 }}>HSN</th><th className={th} style={{ width: 84 }}>Packing</th>
              <th className={th} style={{ width: 70 }}>{d.qtyHead}</th><th className={th} style={{ width: 88 }}>{d.rateHead}</th><th className={th} style={{ width: 92 }}>{d.amountHead}</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${GOLD}55` }} className="align-middle">
                <td className="px-2 py-2 text-center" style={{ color: BROWN, fontWeight: 600 }}>{i + 1}</td>
                <td className="px-2 py-2"><div className="font-bold">{l.name}</div>{l.spec && <div className="whitespace-pre-line">{l.spec}</div>}</td>
                <td className="px-2 py-2 text-center">{l.hsn ?? '—'}</td>
                <td className="px-2 py-2 text-center">{l.packing ?? '—'}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.qty}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.rate}</td>
                <td className="px-2 py-2 text-right tabular-nums">{l.amount}</td>
              </tr>
            ))}
            {d.summary.map(([k, v]) => (
              <tr key={k} style={{ borderTop: `1px solid ${GOLD}55` }}><td colSpan={5} /><td className="px-2 py-1 text-right font-semibold">{k}</td><td className="px-2 py-1 text-right tabular-nums">{v}</td></tr>
            ))}
            <tr style={{ borderTop: `1px solid ${GOLD}`, background: pdfBrand.strip }}>
              <td colSpan={5} /><td className="px-2 py-2 text-right font-bold" style={{ color: BROWN }}>TOTAL</td><td className="px-2 py-2 text-right font-bold tabular-nums" style={{ color: BROWN }}>{d.total ?? '—'}</td>
            </tr>
          </tbody>
        </table>

        {d.amountWords && <p className="mt-3 text-[12px]"><span className="font-bold" style={{ color: GOLD_INK }}>AMOUNT IN WORDS:</span> {d.amountWords}</p>}

        {d.terms.length > 0 && (
          <div className="mt-4 p-3" style={{ border: `1px solid ${GOLD}` }}>
            <div className="mb-1 text-[11px] font-bold" style={{ color: GOLD_INK }}>TERMS &amp; CONDITIONS</div>
            <ol className="space-y-1 leading-snug">{d.terms.map((x, i) => <li key={i} className="grid grid-cols-[1.4rem_5.5rem_1fr]"><span>{i + 1}.</span>{x.label ? <><b>{x.label}</b><span>{x.text}</span></> : <span className="col-span-2">{x.text}</span>}</li>)}</ol>
          </div>
        )}
        {d.notes && <p className="mt-3 whitespace-pre-line text-[11px]"><span className="font-bold" style={{ color: GOLD_INK }}>NOTES:</span> {d.notes}</p>}

        <div className="mt-4 grid grid-cols-2" style={{ border: `1px solid ${GOLD}` }}>
          <div className="p-3">
            <div className="mb-1 text-[11px] font-bold" style={{ color: GOLD_INK }}>BANK DETAILS</div>
            <dl className="grid grid-cols-[6rem_1fr] gap-y-0.5">{d.bank.map(([k, v]) => <Fragment key={k}><dt className="font-bold" style={{ color: GOLD_INK }}>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
          </div>
          <div className="flex flex-col justify-between p-3 text-center" style={{ borderLeft: `1px solid ${GOLD}` }}>
            <div>For, <b>{d.company.name}</b></div>
            <div className="mt-10"><div className="mx-auto mb-1 w-48 border-t border-dashed" style={{ borderColor: GOLD }} /><div className="font-bold">{d.company.signatory.name}</div><div style={{ color: GOLD_INK }}>{d.company.signatory.title}</div></div>
          </div>
        </div>

        <p className="mt-3 text-center text-[10.5px]" style={{ color: pdfBrand.muted }}>{LETTERHEAD.footerNote}</p>
        <div className="mt-6 pb-8"><div className="h-[2px]" style={{ background: GOLD }} /><div className="mt-[2px] h-px" style={{ background: BROWN }} /></div>
      </div>
    </div>
  );
}

/**
 * Fits the A4 page into the width of its container (the page keeps its real size and is scaled down with a CSS
 * transform) so a preview beside the form is readable. Printing resets the scale (index.css, .scaled-page).
 */
export function ScaledPage({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 1, height: 1123 });
  useEffect(() => {
    const fit = () => {
      const w = outer.current?.clientWidth ?? 794;
      const scale = Math.min(1, w / 794);
      setBox({ scale, height: (inner.current?.offsetHeight ?? 1123) * scale });
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(fit);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="scaled-page w-full overflow-hidden" style={{ height: box.height }}>
      <div ref={inner} className="scaled-page-inner origin-top-left" style={{ width: 794, transform: `scale(${box.scale})` }}>{children}</div>
    </div>
  );
}
