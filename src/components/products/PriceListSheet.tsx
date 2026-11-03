/**
 * The price list for buyers, built by the API from the Daily rates (GET /price-list): every grade that has a rupee rate, per product, with the
 * rate per kg in rupees and the dollar rate per MT at today's dollar rate. Opened from the Daily rates screen. Buttons: copy the text, copy it
 * formatted for an e-mail, open an e-mail with it, send it on WhatsApp. Warns when the dollar rate is not from today and that draft grades
 * with a rate are included. Nothing is saved here.
 * Local state: none beyond the query; the sheet closes with onClose.
 */
import { useQuery } from '@tanstack/react-query';
import { Copy, Mail, MessageCircle } from 'lucide-react';
import { Button, ErrorNote, Sheet, Spinner, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { date, waLink } from '@/lib/format';
import { t } from '@/strings';

const s = t.products.priceList;

interface PriceListData { date: string; fx_rate: string | null; fx_is_today: boolean; lines: number; groups: { product: string; rows: { id: string; status: 'draft' | 'active' }[] }[]; text: string; html: string }

/** @param props.open whether the sheet is shown. @param props.onClose called to close it. */
export function PriceListSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const query = useQuery({ queryKey: ['price-list'], queryFn: () => api.get<PriceListData>('/price-list'), enabled: open, staleTime: 0 });
  const list = query.data;
  const hasDraft = !!list?.groups.some((g) => g.rows.some((r) => r.status === 'draft'));

  const copyText = async () => { try { await navigator.clipboard.writeText(list?.text ?? ''); toast(s.copied); } catch { toast(s.copyFailed, 'error'); } };
  const copyHtml = async () => {
    if (!list) return;
    try {
      // formatted tables when the browser allows it, plain text otherwise
      if (typeof ClipboardItem !== 'undefined') await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([list.html], { type: 'text/html' }), 'text/plain': new Blob([list.text], { type: 'text/plain' }) })]);
      else await navigator.clipboard.writeText(list.text);
      toast(s.copied);
    } catch { toast(s.copyFailed, 'error'); }
  };
  const mailto = list ? `mailto:?subject=${encodeURIComponent(`${s.subject} - ${date(list.date)}`)}&body=${encodeURIComponent(list.text)}` : undefined;

  return (
    <Sheet open={open} onClose={onClose} wide title={s.title}
      footer={list && list.lines > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void copyText()}><Copy className="h-4 w-4" aria-hidden />{s.copyText}</Button>
          <Button variant="secondary" onClick={() => void copyHtml()}><Copy className="h-4 w-4" aria-hidden />{s.copyHtml}</Button>
          <a href={mailto} className="tap inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-bold text-ink hover:bg-surface-hover"><Mail className="h-4 w-4" aria-hidden />{s.email}</a>
          <a href={waLink(null, list.text)} target="_blank" rel="noreferrer" className="tap inline-flex items-center gap-2 rounded-lg bg-paprika px-3 text-sm font-bold text-white hover:bg-paprika-700"><MessageCircle className="h-4 w-4" aria-hidden />{s.whatsapp}</a>
        </div>
      ) : undefined}>
      {query.isPending ? <Spinner /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : !list || list.lines === 0 ? (
        <p className="text-sm text-ink-muted">{s.empty}</p>
      ) : (
        <div className="space-y-3">
          {!list.fx_rate && <p role="status" className="rounded-lg border border-warning-bg bg-warning-bg px-3 py-2 text-sm text-warning-ink">{s.noFx}</p>}
          {list.fx_rate && !list.fx_is_today && <p role="status" className="rounded-lg border border-warning-bg bg-warning-bg px-3 py-2 text-sm text-warning-ink">{s.staleFx}</p>}
          {hasDraft && <p className="text-xs text-ink-muted">{s.draftNote}</p>}
          <pre className="max-h-[55dvh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-muted p-3 text-[13px] leading-5 text-ink">{list.text}</pre>
        </div>
      )}
    </Sheet>
  );
}
