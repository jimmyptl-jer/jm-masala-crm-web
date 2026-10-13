/**
 * Composer step 2 "Products & files": tick the products to feature (each is added to the e-mail with its packaging picture,
 * grade, specification and packing) and the files to attach (catalogue PDF, company profile...) from the Files library.
 * Shows the total size of the attached files against the 10 MB limit.
 * API: GET /products (useProducts, with image_url) and GET /marketing/assets (useAssets); uploading a file from here uses
 * FileUploadSheet (POST /marketing/assets). Used by pages/CampaignNew.tsx.
 */
import { Package } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FileUploadSheet } from '@/components/marketing/LibraryTab';
import { Button, Card, Input, Spinner } from '@/components/ui';
import { useAssets, useProducts } from '@/lib/hooks';
import { fileSize } from '@/lib/marketing';
import type { CampaignInput } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;
const MAX = 10 * 1024 * 1024;

/** @param props.form — the campaign being built. @param props.set — change some fields of it. */
export function ProductsStep({ form, set }: { form: CampaignInput; set: (p: Partial<CampaignInput>) => void }) {
  const products = useProducts();
  const assets = useAssets();
  const [find, setFind] = useState('');
  const [uploading, setUploading] = useState(false);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return (products.data ?? []).filter((p) => !q || `${p.name} ${p.grade ?? ''}`.toLowerCase().includes(q));
  }, [products.data, find]);

  /** Adds or removes an id from a list field of the campaign. */
  const toggle = (key: 'product_ids' | 'asset_ids', id: string) => {
    const cur = form[key];
    set({ [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } as Partial<CampaignInput>);
  };

  const chosenFiles = (assets.data ?? []).filter((a) => form.asset_ids.includes(a.id));
  const total = chosenFiles.reduce((n, a) => n + a.size_bytes, 0);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="font-serif text-xl font-semibold text-forest-900 md:text-2xl">{m.productsHeading}</h2>
          <span className="text-sm text-ink/60">{m.productsSelected(form.product_ids.length)}</span>
        </div>
        <p className="mb-3 text-sm text-ink/60">{m.productsHint}</p>
        <Input label={m.productsFind} type="search" value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} autoComplete="off" />
        <label className="tap mt-2 flex items-start gap-3 text-base text-forest-900">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-forest-700" checked={form.include_product_images} onChange={(e) => set({ include_product_images: e.target.checked })} />
          {m.includePictures}
        </label>
        <div className="mt-2 max-h-[28rem] overflow-y-auto rounded-lg border border-forest-900/20 bg-white p-1">
          {products.isPending ? <Spinner /> : shown.length === 0 ? <p className="p-3 text-sm text-ink/60">{m.productsNone}</p> : (
            <ul className="grid sm:grid-cols-2">
              {shown.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-forest-50">
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-forest-700" checked={form.product_ids.includes(p.id)} onChange={() => toggle('product_ids', p.id)} />
                    {p.image_url
                      ? <img src={p.image_url} alt="" loading="lazy" className="h-10 w-14 shrink-0 rounded border border-cream-200 object-cover" />
                      : <span className="grid h-10 w-14 shrink-0 place-items-center rounded border border-dashed border-cream-200 bg-cream-50" title={m.noPicture}><Package className="h-4 w-4 text-ink/30" aria-hidden /></span>}
                    <span className="min-w-0 break-words text-base text-forest-900">{p.name}{p.grade && <span className="text-ink/60"> ({p.grade})</span>}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-xl font-semibold text-forest-900 md:text-2xl">{m.filesHeading}</h2>
            <p className="max-w-2xl text-sm text-ink/60">{m.filesHint}</p>
          </div>
          <Button variant="secondary" onClick={() => setUploading(true)}>{m.uploadFile}</Button>
        </div>
        {assets.isPending ? <Spinner /> : (assets.data ?? []).length === 0 ? <p className="mt-3 text-base text-ink/60">{m.filesNone}</p> : (
          <ul className="mt-3 space-y-1">
            {(assets.data ?? []).map((a) => (
              <li key={a.id}>
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md px-2 py-1 hover:bg-forest-50">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-forest-700" checked={form.asset_ids.includes(a.id)} onChange={() => toggle('asset_ids', a.id)} />
                  <span className="min-w-0 flex-1 break-words text-base text-forest-900">{a.name}</span>
                  <span className="shrink-0 text-sm text-ink/60">{m.fileKinds[a.kind]} · {fileSize(a.size_bytes)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {chosenFiles.length > 0 && (
          <p className={total > MAX ? 'mt-2 text-sm font-semibold text-red-700' : 'mt-2 text-sm text-ink/70'}>
            {total > MAX ? m.filesTooBig : m.filesTotal(fileSize(total))}
          </p>
        )}
      </Card>

      <FileUploadSheet open={uploading} onClose={() => setUploading(false)} onUploaded={(a) => set({ asset_ids: [...form.asset_ids, a.id] })} />
    </div>
  );
}
