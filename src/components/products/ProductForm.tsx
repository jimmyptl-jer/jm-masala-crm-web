/**
 * Admin-only create / edit form for a product, with a packaging-image picker and archive / restore.
 * API, three independent actions (the API allows admins only; others would get 403):
 *  - Save button: POST /products (create) or PATCH /products/:id (edit) with the text fields.
 *  - Packaging image: POST /products/:id/image (multipart, field `file`) when a file is picked and
 *    DELETE /products/:id/image on "Remove image". These happen immediately, NOT on Save, because they use
 *    their own routes. A new product has no id yet, so the picker is replaced by a "save first" note.
 *  - Archive / restore: PATCH /products/:id { archived } after a confirm step (BR-12: never deleted).
 * Every successful call invalidates the react-query key ['products'], which refreshes the Products list.
 * Validation: the form only checks the name and GST rate are filled in; everything else is validated by the
 * API, whose errors come back as ApiError.fields and are shown under the same inputs (packing_options.N
 * errors are shown together under the packing list).
 * Used by pages/Products.tsx (inside a Sheet). Composes Input, Textarea, NumberInput, Select, Button and
 * ErrorNote from ui.tsx. Money and rates are decimal strings and are sent as strings, never numbers.
 */

import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpToLine, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Button, ErrorNote, Input, NumberInput, Select, Textarea, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Product } from '@/lib/types';
import { t } from '@/strings';

// Shorthand for the products strings.
const s = t.products;
/** Units of measure offered in the Unit dropdown; the labels come from t.common.unit. */
const UNITS: Product['unit'][] = ['MT', 'KG', 'QTL'];
/** Largest packaging image the API accepts (8 MB); checked here first to give a friendly message. */
const MAX_IMAGE = 8 * 1024 * 1024;

/**
 * What the text inputs hold while editing. Everything is a string because inputs work with text and the API
 * wants decimal strings; optional fields use '' for "empty" (turned into null when saving).
 * The packaging image is not part of this state; it has its own state and routes.
 */
interface FormState {
  // Required.
  name: string;
  // Optional grade / variety.
  grade: string;
  // Optional free-text specification shown on quotes.
  specification: string;
  cleaning: string;
  purity: string;
  moisture: string;
  // Optional HS code (export) and HSN code (domestic).
  hs_code: string;
  hsn_code: string;
  // GST percent as a decimal string, e.g. '5' or '18'. Required; defaults to '0' for a new product.
  gst_rate: string;
  // Unit of measure.
  unit: Product['unit'];
  // Packing descriptions in order; the first one is the default for a new quote line.
  packing: string[];
  // Optional indicative selling rates (decimal strings) used for price hints.
  ref_rate_usd: string;
  ref_rate_inr: string;
}

/**
 * Builds the starting form state.
 * @param p — the product being edited, or undefined for a new one.
 * @returns the form values: the product's fields with null shown as '', or blanks (GST '0', unit MT) for a
 * new product. packing_options is copied so edits never change the object held by the list cache.
 */
const fromProduct = (p?: Product): FormState => ({
  name: p?.name ?? '',
  grade: p?.grade ?? '',
  specification: p?.specification ?? '',
  cleaning: p?.cleaning ?? '',
  purity: p?.purity ?? '',
  moisture: p?.moisture ?? '',
  hs_code: p?.hs_code ?? '',
  hsn_code: p?.hsn_code ?? '',
  gst_rate: p?.gst_rate ?? '0',
  unit: p?.unit ?? 'MT',
  packing: p?.packing_options?.length ? [...p.packing_options] : [],
  ref_rate_usd: p?.ref_rate_usd ?? '',
  ref_rate_inr: p?.ref_rate_inr ?? '',
});

/**
 * Admin-only create / edit form for a product, with archive and restore when editing.
 * @param initial — the product to edit; omit to create a new one. The component reads it once at mount, so
 *   the parent keys it by product id (a different product needs a fresh form).
 * @param onSaved — called after a successful save, archive or restore (the parent closes the sheet).
 * @param onCancel — called by the Cancel button.
 * Side effects: POST/PATCH /products, POST/DELETE /products/:id/image, invalidates ['products'], toasts.
 * Local state: f (text fields), errors (field -> message), busy (Save or archive request running), fatal
 * (an unexpected error for ErrorNote), confirming (the archive / restore confirm box is open), and the
 * image state: imageUrl, imageBusy, imageError (client-side rejection text), imageFatal (API error).
 */
export function ProductForm({ initial, onSaved, onCancel }: { initial?: Product; onSaved: () => void; onCancel: () => void }) {
  // Used to refresh the products list after any change.
  const qc = useQueryClient();
  // Shows the small confirmation toast.
  const toast = useToast();
  // Current text-field values.
  const [f, setF] = useState<FormState>(() => fromProduct(initial));
  // Field name -> message, from the client check in submit() or from the API's ApiError.fields.
  const [errors, setErrors] = useState<Record<string, string>>({});
  // True while Save or archive / restore is in flight; disables the buttons so nothing is sent twice.
  const [busy, setBusy] = useState(false);
  // An error that is not tied to one field (network, 403, 500); shown in an ErrorNote above the buttons.
  const [fatal, setFatal] = useState<unknown>(null);
  // Whether the "archive this product?" confirm box is showing.
  const [confirming, setConfirming] = useState(false);
  // Packaging image: saved straight away on pick/remove (its own routes), separate from the Save button.
  // Handle to the hidden file input: the visible button opens its file dialog and it is reset after use.
  const fileRef = useRef<HTMLInputElement>(null);
  // Signed link of the current image for the preview; null when there is none. Starts from the product.
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.image_url ?? null);
  // True while an image upload or removal is running.
  const [imageBusy, setImageBusy] = useState(false);
  // Friendly message when the chosen file is rejected before upload (wrong type or too large).
  const [imageError, setImageError] = useState<string | null>(null);
  // An error from the image routes themselves (e.g. the API said the file is not a real image).
  const [imageFatal, setImageFatal] = useState<unknown>(null);

  /**
   * Handler for the hidden file input: checks the file, uploads it at once and shows the new preview.
   * @param file — the chosen file, or undefined when the dialog was cancelled.
   * Does nothing for a new product (no id yet), while another image request runs, or with no file.
   * Client checks (the API repeats them using the file's real bytes): PNG / JPEG / WebP only, at most 8 MB;
   * a rejected file sets imageError and sends nothing.
   * Side effects: POST /products/:id/image (replaces any previous image), sets imageUrl from the response,
   * invalidates ['products'], toast. A failure sets imageFatal. Always clears the input so choosing the same
   * file again still fires onChange.
   */
  const pickImage = async (file: File | undefined) => {
    if (!file || !initial || imageBusy) return;
    setImageError(null);
    setImageFatal(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setImageError(s.imageBadType); return; }
    if (file.size > MAX_IMAGE) { setImageError(s.imageTooBig); return; }
    setImageBusy(true);
    try {
      const saved = await api.upload<Product>(`/products/${initial.id}/image`, file);
      setImageUrl(saved.image_url ?? null);
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast(s.imageUploaded);
    } catch (e) {
      setImageFatal(e);
    } finally {
      setImageBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /**
   * Handler for "Remove image": clears the product's packaging image at once (no Save needed).
   * Does nothing for a new product or while another image request runs.
   * Side effects: DELETE /products/:id/image (the API clears the link but leaves the stored file in place),
   * sets imageUrl to null, invalidates ['products'], toast. A failure sets imageFatal.
   */
  const removeImage = async () => {
    if (!initial || imageBusy) return;
    setImageBusy(true);
    setImageError(null);
    setImageFatal(null);
    try {
      await api.del(`/products/${initial.id}/image`);
      setImageUrl(null);
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast(s.imageRemoved);
    } catch (e) {
      setImageFatal(e);
    } finally {
      setImageBusy(false);
    }
  };

  /** Sets one text field. @param k — field name. @param v — the new value (its type follows the field). */
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));
  /** Replaces the text of packing row `i`. @param i — row index. @param v — the new text. */
  const setPacking = (i: number, v: string) => setF((x) => ({ ...x, packing: x.packing.map((p, j) => (j === i ? v : p)) }));
  /** Deletes packing row `i`. @param i — row index. */
  const removePacking = (i: number) => setF((x) => ({ ...x, packing: x.packing.filter((_, j) => j !== i) }));
  /** Moves packing row `i` to the top, which makes it the default. @param i — row index (not 0). */
  const makeDefault = (i: number) => setF((x) => ({ ...x, packing: [x.packing[i]!, ...x.packing.filter((_, j) => j !== i)] }));
  // First API error for any packing_options.N field, shown once under the packing list (undefined if none).
  const packingError = Object.entries(errors).find(([k]) => k.startsWith('packing_options'))?.[1];

  /**
   * Form submit handler (the Save button): validates, then creates or updates the product.
   * @param ev — the submit event (its default page reload is cancelled).
   * Client check: name and GST rate must not be blank; a failure fills `errors` and sends nothing.
   * Body: text fields trimmed, blank optional fields sent as null, packing rows trimmed with empty ones
   * dropped, rates as decimal strings. Sends PATCH /products/:id when editing, otherwise POST /products. The
   * packaging image is not part of this request.
   * Side effects: invalidates ['products'], toast (updated / created), calls onSaved(). An ApiError with
   * `fields` is shown under the inputs; any other error goes to `fatal`. Ignored while `busy`.
   */
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const v: Record<string, string> = {};
    if (!f.name.trim()) v.name = s.nameRequired;
    if (!f.gst_rate.trim()) v.gst_rate = s.gstRequired;
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    setFatal(null);
    try {
      const body = {
        name: f.name.trim(),
        grade: f.grade.trim() || null,
        specification: f.specification.trim() || null,
        cleaning: f.cleaning.trim() || null,
        purity: f.purity.trim() || null,
        moisture: f.moisture.trim() || null,
        hs_code: f.hs_code.trim() || null,
        hsn_code: f.hsn_code.trim() || null,
        gst_rate: f.gst_rate,
        unit: f.unit,
        packing_options: f.packing.map((p) => p.trim()).filter(Boolean),
        ref_rate_usd: f.ref_rate_usd || null,
        ref_rate_inr: f.ref_rate_inr || null,
      };
      if (initial) await api.patch<Product>(`/products/${initial.id}`, body);
      else await api.post<Product>('/products', body);
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast(initial ? s.updated : s.created);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      else setFatal(e);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Archives or restores the product being edited (after the user confirmed in the confirm box).
   * @param archived — true to archive, false to restore.
   * Side effects: PATCH /products/:id { archived }, invalidates ['products'], toast, onSaved(). On failure
   * sets `fatal` and closes the confirm box. Archived products stay in old quotes and can be restored.
   * Does nothing for a new product or while busy.
   */
  const setArchived = async (archived: boolean) => {
    if (!initial || busy) return;
    setBusy(true);
    setFatal(null);
    try {
      await api.patch<Product>(`/products/${initial.id}`, { archived });
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast(archived ? s.archived : s.restored);
      onSaved();
    } catch (e) {
      setFatal(e);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Input label={s.name} value={f.name} onChange={(e) => set('name', e.target.value)} error={errors.name} autoComplete="off" />
      <Input label={s.grade} optional value={f.grade} onChange={(e) => set('grade', e.target.value)} error={errors.grade} autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label={s.cleaning} optional hint={s.cleaningHint} value={f.cleaning} onChange={(e) => set('cleaning', e.target.value)} error={errors.cleaning} autoComplete="off" />
        <Input label={s.purity} optional hint={s.purityHint} value={f.purity} onChange={(e) => set('purity', e.target.value)} error={errors.purity} autoComplete="off" />
        <Input label={s.moisture} optional hint={s.moistureHint} value={f.moisture} onChange={(e) => set('moisture', e.target.value)} error={errors.moisture} autoComplete="off" />
      </div>
      <Textarea rows={5} placeholder={['Cleaning: Sortex Clean', 'Purity: 99% min', 'Moisture: 8% max', 'Foreign matter: 0.5% max', 'Test reports: COA on request'].join('\n')} label={s.specification} optional hint={s.specificationHint} value={f.specification} onChange={(e) => set('specification', e.target.value)} error={errors.specification} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={s.hsCode} optional inputMode="numeric" value={f.hs_code} onChange={(e) => set('hs_code', e.target.value)} error={errors.hs_code} autoComplete="off" />
        <Input label={s.hsnCode} optional inputMode="numeric" value={f.hsn_code} onChange={(e) => set('hsn_code', e.target.value)} error={errors.hsn_code} autoComplete="off" />
        <NumberInput label={s.gstRate} value={f.gst_rate} onChange={(v) => set('gst_rate', v)} error={errors.gst_rate} />
        <Select label={s.unit} value={f.unit} onChange={(e) => set('unit', e.target.value as Product['unit'])} error={errors.unit}>
          {UNITS.map((u) => <option key={u} value={u}>{t.common.unit[u]}</option>)}
        </Select>
      </div>

      {/* Packing options: a free list; the first row is the default offered on a quote line. */}
      <fieldset className="space-y-2 rounded-lg border border-forest-900/15 p-3">
        <legend className="px-1 text-base font-semibold text-forest-900">{s.packingTitle}</legend>
        <p className="text-sm text-ink/60">{s.packingHelp}</p>
        {f.packing.map((p, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input label={s.packingLabel(i + 1)} placeholder={s.packingPlaceholder} value={p} onChange={(e) => setPacking(i, e.target.value)} autoComplete="off"
                hint={i === 0 && f.packing.length > 1 ? s.packingDefault : undefined} />
            </div>
            {i > 0 && (
              <Button variant="secondary" className="px-2" aria-label={s.makeDefaultAria(i + 1)} title={s.makeDefault} onClick={() => makeDefault(i)}>
                <ArrowUpToLine className="h-5 w-5" aria-hidden />
              </Button>
            )}
            <Button variant="secondary" className="px-2 text-red-700" aria-label={s.removePacking(i + 1)} onClick={() => removePacking(i)}>
              <Trash2 className="h-5 w-5" aria-hidden />
            </Button>
          </div>
        ))}
        {packingError && <p role="alert" className="text-sm text-red-700">{packingError}</p>}
        <Button variant="secondary" className="w-full" onClick={() => setF((x) => ({ ...x, packing: [...x.packing, ''] }))}>
          <Plus className="h-5 w-5" aria-hidden />{s.addPacking}
        </Button>
      </fieldset>

      {/* Packaging image: uploads / removes immediately via its own routes; only for an existing product. */}
      <fieldset className="space-y-2 rounded-lg border border-forest-900/15 p-3">
        <legend className="px-1 text-base font-semibold text-forest-900">{s.imageTitle}</legend>
        {!initial ? <p className="text-sm text-ink/60">{s.imageSaveFirst}</p> : (
          <>
            <div className="flex items-start gap-3">
              <div className="grid h-28 w-40 shrink-0 place-items-center overflow-hidden rounded-lg border border-cream-200 bg-cream-50">
                {imageUrl ? <img src={imageUrl} alt={s.imageAlt(initial.name)} className="h-full w-full object-cover" /> : <ImagePlus className="h-7 w-7 text-ink/30" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {!imageUrl && <p className="text-sm text-ink/60">{s.imageNone}</p>}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pickImage(e.target.files?.[0])} />
                <Button variant="secondary" loading={imageBusy} onClick={() => fileRef.current?.click()}>{imageUrl ? s.imageChange : s.imageChoose}</Button>
                {imageUrl && <Button variant="secondary" className="text-red-700" disabled={imageBusy} onClick={() => void removeImage()}>{s.imageRemove}</Button>}
              </div>
            </div>
            <p className="text-xs text-ink/60">{s.imageHint}</p>
            {imageError && <p role="alert" className="text-sm text-red-700">{imageError}</p>}
            {imageFatal !== null && <ErrorNote error={imageFatal} />}
          </>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberInput label={s.refUsdLabel} optional value={f.ref_rate_usd} onChange={(v) => set('ref_rate_usd', v)} error={errors.ref_rate_usd} />
        <NumberInput label={s.refInrLabel} optional value={f.ref_rate_inr} onChange={(v) => set('ref_rate_inr', v)} error={errors.ref_rate_inr} />
      </div>
      <p className="-mt-2 text-sm text-ink/60">{s.refHint}</p>

      {fatal !== null && <ErrorNote error={fatal} />}
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>{t.common.cancel}</Button>
        <Button type="submit" className="flex-1" loading={busy}>{busy ? t.common.saving : s.save}</Button>
      </div>

      {/* Archive / restore (edit only): a button, then a confirm box before anything is sent. */}
      {initial && (
        <div className="border-t border-cream-200 pt-4">
          {!confirming ? (
            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => setConfirming(true)}>{initial.archived ? s.restore : s.archive}</Button>
          ) : (
            <div role="alertdialog" aria-label={initial.archived ? s.restoreQuestion : s.archiveQuestion} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="font-semibold text-forest-900">{initial.archived ? s.restoreQuestion : s.archiveQuestion}</p>
              <p className="mt-1 text-base text-ink/80">{initial.archived ? s.restoreExplain : s.archiveExplain}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button variant={initial.archived ? 'primary' : 'danger'} className="flex-1" loading={busy} onClick={() => void setArchived(!initial.archived)}>
                  {initial.archived ? s.restoreYes : s.archiveYes}
                </Button>
                <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => setConfirming(false)}>{s.keep}</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
