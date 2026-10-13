/**
 * Marketing > Files: the library of files used in campaigns (catalogue PDF, company profile, pictures). Upload once, attach to
 * any campaign. Product pictures are not here: they are the packaging pictures on the Products tab and are added to a
 * campaign by ticking the product.
 * API: GET /marketing/assets (useAssets, key ['marketing', 'assets']); POST /marketing/assets (multipart: file, name, kind);
 * DELETE /marketing/assets/:id (archives it). Files must be PDF, PNG, JPEG or WebP up to 10 MB (the server checks the content).
 * Exports FileUploadSheet, which the campaign composer also uses. Used by pages/Marketing.tsx.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Image as ImageIcon, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Card, EmptyState, ErrorNote, Input, Select, Sheet, Spinner, errorMessage, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { useAssets } from '@/lib/hooks';
import { ASSET_KINDS, fileSize } from '@/lib/marketing';
import type { AssetKind, MarketingAsset } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;
const MAX = 10 * 1024 * 1024;

/**
 * Sheet to upload one file: choose it, name it, say what kind it is.
 * @param props.open / onClose — visibility. @param props.onUploaded — called with the saved asset (the composer ticks it).
 */
export function FileUploadSheet({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded?: (a: MarketingAsset) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('catalogue');
  const [error, setError] = useState('');

  const up = useMutation({
    mutationFn: () => api.upload<MarketingAsset>('/marketing/assets', file!, { name: name.trim(), kind }),
    onSuccess: async (a) => {
      await qc.invalidateQueries({ queryKey: ['marketing', 'assets'] });
      toast(m.fileUploaded);
      onUploaded?.(a);
      setFile(null); setName(''); setError('');
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  /** Checks the chosen file in the browser (size); the server checks the real content. */
  const choose = (f: File | undefined) => {
    setError('');
    if (!f) return;
    if (f.size > MAX) { setError(m.fileTooBig); return; }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
  };

  return (
    <Sheet open={open} onClose={onClose} title={m.uploadFile}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (!file) { setError(m.chooseFile); return; } if (!name.trim()) { setError(m.fileNameLabel); return; } up.mutate(); }}
        className="space-y-3" noValidate
      >
        <div>
          <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          <Button type="button" variant="secondary" className="w-full" onClick={() => input.current?.click()}>{file ? file.name : m.chooseFile}</Button>
          {file && <p className="mt-1 text-sm text-ink/60">{fileSize(file.size)}</p>}
        </div>
        <Input label={m.fileNameLabel} value={name} onChange={(e) => setName(e.target.value)} />
        <Select label={m.fileKindLabel} value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
          {ASSET_KINDS.map((k) => <option key={k} value={k}>{m.fileKinds[k]}</option>)}
        </Select>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>{m.cancel}</Button>
          <Button type="submit" className="flex-1" loading={up.isPending}>{m.uploadFile}</Button>
        </div>
      </form>
    </Sheet>
  );
}

/** The Files tab; see the file comment. */
export function LibraryTab() {
  const q = useAssets();
  const qc = useQueryClient();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/marketing/assets/${id}`),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['marketing', 'assets'] }); toast(m.fileRemoved); },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const rows = q.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-semibold text-forest-900 md:text-2xl">{m.filesTabHeading}</h2>
          <p className="max-w-2xl text-sm text-ink/60">{m.filesTabHint}</p>
        </div>
        <Button onClick={() => setUploading(true)}><Plus className="h-5 w-5" aria-hidden />{m.uploadFile}</Button>
      </div>

      {q.isPending ? <Spinner /> : q.isError ? <ErrorNote error={q.error} onRetry={() => void q.refetch()} /> : rows.length === 0 ? (
        <Card><EmptyState title={m.filesNone} /></Card>
      ) : (
        <ul className="grid gap-2 xl:grid-cols-2">
          {rows.map((a) => (
            <li key={a.id} className="card flex items-center gap-3 px-4 py-3">
              {a.content_type === 'application/pdf' ? <FileText className="h-6 w-6 shrink-0 text-forest-800" aria-hidden /> : <ImageIcon className="h-6 w-6 shrink-0 text-forest-800" aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className="break-words font-semibold text-forest-900">{a.name}</div>
                <div className="text-sm text-ink/60">{[m.fileKinds[a.kind], fileSize(a.size_bytes), date(a.created_at)].join(' · ')}</div>
              </div>
              {a.url && <a href={a.url} target="_blank" rel="noopener noreferrer" className="tap flex items-center rounded-lg px-2 text-sm font-semibold text-forest-800 underline">{m.openFile}</a>}
              <Button variant="secondary" loading={remove.isPending && remove.variables === a.id} onClick={() => remove.mutate(a.id)}>{m.removeFile}</Button>
            </li>
          ))}
        </ul>
      )}
      <FileUploadSheet open={uploading} onClose={() => setUploading(false)} />
    </div>
  );
}
