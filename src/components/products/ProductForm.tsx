/**
 * Admin-only add / edit form for a product and all of its grades (opened from pages/Products.tsx).
 *
 * A "product" here is one name (e.g. Cumin Seeds) with one row per grade, because that is how the API stores it:
 * every grade is its own /products row. The form edits them together: the shared name, HS and HSN code and packing options, a grades
 * table (specs, tax, the rate per kg in USD and INR, active toggle) and the packaging image. The two codes belong to the product, so one
 * value is written to every grade.
 *
 * API: GET /products?archived=all (useProducts, to load every grade of the product being edited);
 * POST /products (new grade), PATCH /products/:id (existing grade, including archived), POST/DELETE
 * /products/:id/image (image of the first grade, saved at once), DELETE /products/:id?permanent=1 (delete a grade; the API deletes it
 * for good when no quotation used it and archives it otherwise). Invalidates ['products'] and toasts.
 * A saved grade can also be switched off. Packing options and the two codes are shared: the same values are written to every grade. Rates are per kilogram;
 * the Daily rates tab of the Products page edits the same two fields.
 * Not in the data yet (needs an API change, see docs/PRODUCT-MODEL-PROPOSAL.md): product code, category, several
 * images, documents.
 * Local state: name, packing, grades (rows), errors, busy, fatal, confirming, and the image state.
 */
import { useQueryClient } from '@tanstack/react-query';
import { ArrowUpToLine, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, ErrorNote, Input, Select, Spinner, Textarea, errorMessage, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { hasRoute, PROBE_ID } from '@/lib/config';
import { revealFirstError } from '@/lib/formFeedback';
import { useProducts } from '@/lib/hooks';
import type { Product } from '@/lib/types';
import { APPROVED_PRODUCT_NAMES, isApprovedProduct } from '@/lib/products';
import { t } from '@/strings';

const s = t.products;
const UNITS: Product['unit'][] = ['MT', 'KG', 'QTL'];
/** Largest packaging image the API accepts (8 MB); checked here first to give a friendly message. */
const MAX_IMAGE = 8 * 1024 * 1024;

/** One grade row as the form holds it. Everything is text (blank optional fields become null when saving). */
interface GradeRow {
  /** Stable client key for React and error lookup. */
  key: string;
  /** Product id once saved; undefined for a row that does not exist on the server yet. */
  id?: string;
  grade: string;
  cleaning: string;
  purity: string;
  moisture: string;
  specification: string;
  gst_rate: string;
  unit: Product['unit'];
  ref_rate_usd: string;
  ref_rate_inr: string;
  archived: boolean;
}

let counter = 0;
const newKey = () => `g${++counter}`;
const blankGrade = (): GradeRow => ({
  key: newKey(), grade: '', cleaning: '', purity: '', moisture: '', specification: '',
  gst_rate: '0', unit: 'MT', ref_rate_usd: '', ref_rate_inr: '', archived: false,
});
const fromProduct = (p: Product): GradeRow => ({
  key: newKey(), id: p.id, grade: p.grade ?? '', cleaning: p.cleaning ?? '', purity: p.purity ?? '', moisture: p.moisture ?? '',
  specification: p.specification ?? '', gst_rate: p.gst_rate ?? '', unit: p.unit,
  ref_rate_usd: p.ref_rate_usd ?? '', ref_rate_inr: p.ref_rate_inr ?? '', archived: p.archived,
});

/** The sections of the form, in the order of the step list on the left. */
const FORM_STEPS = [
  { id: 'pf-basic', title: s.secBasic, hint: s.stepBasicHint },
  { id: 'pf-grade', title: s.secGrade, hint: s.stepGradeHint },
  { id: 'pf-packing', title: s.packingTitle, hint: s.stepPackingHint },
  { id: 'pf-images', title: s.imageTitle, hint: s.stepImagesHint },
] as const;

/** A numbered card of the product form. */
function FormCard({ id, n, title, hint, action, children }: { id: string; n: number; title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-2 rounded-2xl border border-line bg-surface-muted p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div><h3 className="text-base font-bold text-crm-ink">{n}. {title}</h3>{hint && <p className="text-sm text-slate-500">{hint}</p>}</div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const cell = 'h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm text-crm-ink';
const numberOk = (v: string, decimals: number) => new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`).test(v);

/**
 * @param props.name - name of the product to edit (all its grades load together); omit to add a new product.
 * @param props.onSaved - called after a successful save, archive or restore (the parent closes the dialog).
 * @param props.onCancel - called by the Cancel button.
 */
export function ProductForm({ name: editName, onSaved, onCancel }: { name?: string; onSaved: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  // every grade of this product, archived ones included, so a switched-off grade can be switched on again
  const all = useProducts({ archived: 'all' });
  if (editName && all.isPending) return <Spinner />;
  if (editName && all.isError) return <ErrorNote error={all.error} onRetry={() => void all.refetch()} />;
  const existing = editName ? (all.data ?? []).filter((p) => p.name === editName) : [];
  return <Editor key={editName ?? 'new'} existing={existing} editing={!!editName} qc={qc} toast={toast} onSaved={onSaved} onCancel={onCancel} />;
}

function Editor({ existing, editing, qc, toast, onSaved, onCancel }: {
  existing: Product[]; editing: boolean; qc: ReturnType<typeof useQueryClient>; toast: ReturnType<typeof useToast>; onSaved: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(existing[0]?.name ?? '');
  // one status for every grade of the product: a draft may leave GST empty and is not offered on quotations
  const [status, setStatus] = useState<'draft' | 'active'>(existing.find((p) => !p.archived)?.status ?? existing[0]?.status ?? 'active');
  // the HS (export) and HSN (domestic) codes belong to the product: one value for every grade
  const [hs, setHs] = useState(() => existing.find((p) => p.hs_code)?.hs_code ?? '');
  const [hsn, setHsn] = useState(() => existing.find((p) => p.hsn_code)?.hsn_code ?? '');
  const [packing, setPacking] = useState<string[]>(() => [...(existing.find((p) => p.packing_options.length)?.packing_options ?? [])]);
  const [grades, setGrades] = useState<GradeRow[]>(() => (existing.length ? existing.map(fromProduct) : [blankGrade()]));
  // field-level messages: 'name', 'grades', 'packing_options...' or `${row key}.${field}`
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);
  const [confirming, setConfirming] = useState(false);

  // packaging image: belongs to the first saved grade and is saved straight away (its own routes)
  const primary = existing.find((p) => !p.archived) ?? existing[0];
  // image routes may not be live yet (config.ts hasRoute): then the image can only be looked at
  const canImage = hasRoute('POST', `/products/${PROBE_ID}/image`);
  const canRemoveImage = hasRoute('DELETE', `/products/${PROBE_ID}/image`);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(primary?.image_url ?? null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageFatal, setImageFatal] = useState<unknown>(null);

  /** Handler for the hidden file input: validates type and size, then POST /products/:id/image. */
  const pickImage = async (file: File | undefined) => {
    if (!file || !primary || imageBusy) return;
    setImageError(null);
    setImageFatal(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setImageError(s.imageBadType); return; }
    if (file.size > MAX_IMAGE) { setImageError(s.imageTooBig); return; }
    setImageBusy(true);
    try {
      const saved = await api.upload<Product>(`/products/${primary.id}/image`, file);
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

  /** Handler for "Remove image": DELETE /products/:id/image, clears the preview. */
  const removeImage = async () => {
    if (!primary || imageBusy) return;
    setImageBusy(true);
    setImageError(null);
    setImageFatal(null);
    try {
      await api.del(`/products/${primary.id}/image`);
      setImageUrl(null);
      await qc.invalidateQueries({ queryKey: ['products'] });
      toast(s.imageRemoved);
    } catch (e) {
      setImageFatal(e);
    } finally {
      setImageBusy(false);
    }
  };

  const setGrade = (key: string, patch: Partial<GradeRow>) => setGrades((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeUnsaved = (key: string) => setGrades((rows) => rows.filter((r) => r.key !== key));
  const err = (key: string, field: string) => errors[`${key}.${field}`];
  const setPack = (i: number, v: string) => setPacking((x) => x.map((p, j) => (j === i ? v : p)));
  const packingError = Object.entries(errors).find(([k]) => k.startsWith('packing_options'))?.[1];

  /** Request body of one grade: shared name and packing plus the row's own fields (blank optional -> null). */
  const bodyOf = (r: GradeRow) => ({
    name: name.trim(),
    grade: r.grade.trim() || null,
    specification: r.specification.trim() || null,
    cleaning: r.cleaning.trim() || null,
    purity: r.purity.trim() || null,
    moisture: r.moisture.trim() || null,
    hs_code: hs.trim() || null,
    hsn_code: hsn.trim() || null,
    gst_rate: r.gst_rate.trim() || null,
    status,
    unit: r.unit,
    packing_options: packing.map((p) => p.trim()).filter(Boolean),
    ref_rate_usd: r.ref_rate_usd || null,
    ref_rate_inr: r.ref_rate_inr || null,
  });

  /**
   * Save: validates (approved name, GST on every grade, no two live grades with the same name), then saves the
   * grades one by one (PATCH for saved rows, POST for new ones). A row that was created is remembered with its
   * new id, so pressing Save again after a failure never creates it twice.
   */
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const form = ev.currentTarget as HTMLFormElement;
    const v: Record<string, string> = {};
    if (!name.trim()) v.name = s.nameRequired;
    else if (!isApprovedProduct(name)) v.name = s.approvedOnly;
    if (grades.every((r) => r.archived)) v.grades = s.needOneGrade;
    const seen = new Set<string>();
    for (const r of grades) {
      if (!r.gst_rate.trim() && status === 'active') v[`${r.key}.gst_rate`] = s.gstRequiredActive;
      if (!r.archived) {
        const k = r.grade.trim().toLowerCase();
        if (seen.has(k)) v[`${r.key}.grade`] = s.gradeDuplicate;
        seen.add(k);
      }
    }
    setErrors(v);
    if (Object.keys(v).length) { toast(t.common.fixFields, 'error'); revealFirstError(ev.currentTarget as HTMLFormElement); return; }
    setBusy(true);
    setFatal(null);
    let current: GradeRow | undefined;
    try {
      for (const r of grades) {
        current = r;
        if (r.id) {
          await api.patch<Product>(`/products/${r.id}`, { ...bodyOf(r), archived: r.archived });
        } else if (!r.archived) {
          const created = await api.post<Product>('/products', bodyOf(r));
          setGrades((rows) => rows.map((x) => (x.key === r.key ? { ...x, id: created.id } : x)));
        }
      }
      await qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['rate-history'] });
      toast(editing ? s.updated : s.created);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields && current) {
        const row = current.key;
        setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, m]) => [k === 'name' || k.startsWith('packing_options') ? k : `${row}.${k}`, m])));
        toast(t.common.fixFields, 'error'); revealFirstError(form);
      } else { setFatal(e); toast(errorMessage(e) || t.common.saveFailed, 'error'); }
      await qc.invalidateQueries({ queryKey: ['products'] });
    } finally {
      setBusy(false);
    }
  };

  /** Archives or restores every grade of the product (after the confirm box): PATCH /products/:id { archived }. */
  const setAllArchived = async (archived: boolean) => {
    setBusy(true);
    setFatal(null);
    try {
      for (const r of grades) if (r.id) await api.patch<Product>(`/products/${r.id}`, { archived });
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

  /**
   * Delete a saved grade (after the confirm box): DELETE /products/:id?permanent=1. The API deletes it for good when no quotation used it
   * and archives it otherwise; the row leaves the form or turns into an archived row. Deleting the last grade closes the form.
   */
  const deleteGrade = async (r: GradeRow) => {
    if (!r.id || busy) return;
    if (!window.confirm(s.deleteGradeConfirm(r.grade.trim() || s.untitledGrade))) return;
    setBusy(true);
    setFatal(null);
    try {
      const res = await api.del<{ deleted: boolean }>(`/products/${r.id}?permanent=1`);
      await qc.invalidateQueries({ queryKey: ['products'] });
      if (res.deleted) {
        toast(s.gradeDeleted);
        if (grades.filter((x) => x.key !== r.key).length === 0) { onSaved(); return; }
        setGrades((rows) => rows.filter((x) => x.key !== r.key));
      } else {
        toast(s.gradeArchivedInstead);
        setGrade(r.key, { archived: true });
      }
    } catch (e) {
      setFatal(e);
    } finally {
      setBusy(false);
    }
  };

  const everyArchived = existing.length > 0 && existing.every((p) => p.archived);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-5">
        {/* step list: shortcuts that scroll to each section (not a wizard; everything saves together) */}
        <nav aria-label={s.stepsLabel} className="mb-4 md:sticky md:top-0 md:mb-0 md:self-start">
          <ol className="flex flex-wrap gap-2 md:flex-col md:flex-nowrap md:gap-1 md:overflow-x-auto">
            {FORM_STEPS.map((st, i) => (
              <li key={st.id} className="shrink-0">
                <button type="button" onClick={() => document.getElementById(st.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="tap flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-brand-50">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-forest-900 text-sm font-bold text-white">{i + 1}</span>
                  <span className="min-w-0"><span className="block whitespace-nowrap text-sm font-semibold text-crm-ink">{st.title}</span><span className="hidden text-xs text-slate-500 md:block">{st.hint}</span></span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
            <FormCard id="pf-basic" n={1} title={s.secBasic}>
              <Select label={s.name} value={name} onChange={(e) => setName(e.target.value)} error={errors.name}>
                {name && !APPROVED_PRODUCT_NAMES.includes(name as typeof APPROVED_PRODUCT_NAMES[number]) && <option value={name}>{name} · legacy item</option>}
                <option value="">{s.chooseProduct}</option>
                {APPROVED_PRODUCT_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
              <Select label={s.statusLabel} value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'active')} hint={s.statusHint}>
                <option value="active">{s.statusActiveOption}</option>
                <option value="draft">{s.statusDraftOption}</option>
              </Select>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label={s.hsCode} optional value={hs} onChange={(e) => setHs(e.target.value)} error={errors.hs_code} autoComplete="off" />
                <Input label={s.hsnCode} optional value={hsn} onChange={(e) => setHsn(e.target.value)} error={errors.hsn_code} autoComplete="off" />
              </div>
              <p className="text-xs text-slate-500">{s.codesShared}</p>
              <p className="text-sm text-slate-500">{s.basicHint}</p>
            </FormCard>
            <FormCard id="pf-images" n={4} title={s.imageTitle}>
              {!primary ? <p className="text-sm text-slate-500">{s.imageSaveFirst}</p> : (
                <>
                  <div className="grid h-32 w-full place-items-center overflow-hidden rounded-lg border border-slate-200 bg-forest-50">
                    {imageUrl ? <img src={imageUrl} alt={s.imageAlt(primary.name)} className="h-full w-full object-cover" /> : <ImagePlus className="h-7 w-7 text-fg-muted" aria-hidden />}
                  </div>
                  {!imageUrl && <p className="text-sm text-slate-500">{canImage ? s.imageNone : s.imageUnavailable}</p>}
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pickImage(e.target.files?.[0])} />
                  <div className="flex flex-wrap gap-2">
                    {canImage && <Button variant="secondary" loading={imageBusy} onClick={() => fileRef.current?.click()}>{imageUrl ? s.imageChange : s.imageChoose}</Button>}
                    {imageUrl && canRemoveImage && <Button variant="secondary" className="text-red-700" disabled={imageBusy} onClick={() => void removeImage()}>{s.imageRemove}</Button>}
                  </div>
                  {canImage && <p className="text-xs text-slate-500">{s.imageHint}</p>}
                  {imageError && <p role="alert" className="text-sm text-red-700">{imageError}</p>}
                  {imageFatal !== null && <ErrorNote error={imageFatal} />}
                </>
              )}
            </FormCard>
          </div>

          <FormCard
            id="pf-grade" n={2} title={s.secGrade} hint={s.secGradeHint}
            action={<Button variant="secondary" onClick={() => setGrades((rows) => [...rows, blankGrade()])}><Plus className="h-4 w-4" aria-hidden />{s.addGrade}</Button>}
          >
            {errors.grades && <p role="alert" className="text-sm text-red-700">{errors.grades}</p>}
            <div className="overflow-x-auto">
              <table className="rt w-full min-w-[1040px] border-separate border-spacing-y-1 text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-8 px-1 py-1">#</th><th className="px-1 py-1">{s.grade}</th><th className="px-1 py-1">{s.cleaning}</th>
                    <th className="px-1 py-1">{s.purity}</th><th className="px-1 py-1">{s.moisture}</th><th className="px-1 py-1">{s.unit}</th>
                    <th className="w-20 px-1 py-1">{s.gstRate}</th>
                    <th className="w-28 px-1 py-1">{s.refUsdLabel}</th><th className="w-28 px-1 py-1">{s.refInrLabel}</th>
                    <th className="px-1 py-1">{s.gradeStatus}</th><th className="px-1 py-1 text-right">{s.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((r, i) => (
                    <GradeTableRow key={r.key} r={r} n={i + 1} err={(f) => err(r.key, f)} onChange={(p) => setGrade(r.key, p)} onRemove={r.id ? undefined : () => removeUnsaved(r.key)} onDelete={r.id ? () => void deleteGrade(r) : undefined} busy={busy} />
                  ))}
                </tbody>
              </table>
            </div>
          </FormCard>

          <FormCard id="pf-packing" n={3} title={s.packingTitle} hint={s.packingHelp}>
            {packing.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input label={s.packingLabel(i + 1)} placeholder={s.packingPlaceholder} value={p} onChange={(e) => setPack(i, e.target.value)} autoComplete="off"
                    hint={i === 0 && packing.length > 1 ? s.packingDefault : undefined} />
                </div>
                {i > 0 && (
                  <Button variant="secondary" className="px-2" aria-label={s.makeDefaultAria(i + 1)} title={s.makeDefault} onClick={() => setPacking((x) => [x[i]!, ...x.filter((_, j) => j !== i)])}>
                    <ArrowUpToLine className="h-5 w-5" aria-hidden />
                  </Button>
                )}
                <Button variant="secondary" className="px-2 text-red-700" aria-label={s.removePacking(i + 1)} onClick={() => setPacking((x) => x.filter((_, j) => j !== i))}>
                  <Trash2 className="h-5 w-5" aria-hidden />
                </Button>
              </div>
            ))}
            {packingError && <p role="alert" className="text-sm text-red-700">{packingError}</p>}
            <Button variant="secondary" className="w-full" onClick={() => setPacking((x) => [...x, ''])}><Plus className="h-5 w-5" aria-hidden />{s.addPacking}</Button>
            {grades.length > 1 && <p className="text-xs text-slate-500">{s.packingShared}</p>}
          </FormCard>
        </div>
      </div>

      {fatal !== null && <ErrorNote error={fatal} />}
      <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-line bg-surface-muted px-4 py-3  md:-mx-6 md:px-6">
        <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>{t.common.cancel}</Button>
        <Button type="submit" className="flex-1" loading={busy}>{busy ? t.common.saving : s.save}</Button>
      </div>

      {/* Archive / restore the whole product (edit only): a button, then a confirm box before anything is sent. */}
      {editing && (
        <div className="border-t border-slate-200/80 pt-4">
          {!confirming ? (
            <Button variant="secondary" className="w-full" disabled={busy} onClick={() => setConfirming(true)}>{everyArchived ? s.restore : s.archive}</Button>
          ) : (
            <div role="alertdialog" aria-label={everyArchived ? s.restoreQuestion : s.archiveQuestion} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="font-semibold text-forest-900">{everyArchived ? s.restoreQuestion : s.archiveQuestion}</p>
              <p className="mt-1 text-base text-fg-secondary">{everyArchived ? s.restoreExplain : s.archiveExplain}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button variant={everyArchived ? 'primary' : 'danger'} className="flex-1" loading={busy} onClick={() => void setAllArchived(!everyArchived)}>
                  {everyArchived ? s.restoreYes : s.archiveYes}
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

/** Two table rows for one grade: its short fields, then its specification text across the full width. */
function GradeTableRow({ r, n, err, onChange, onRemove, onDelete, busy }: {
  r: GradeRow; n: number; err: (field: string) => string | undefined; onChange: (p: Partial<GradeRow>) => void; onRemove?: () => void; onDelete?: () => void; busy?: boolean;
}) {
  const text = (field: 'grade' | 'cleaning' | 'purity' | 'moisture', label: string) => (
    <input aria-label={`${label} ${n}`} value={r[field]} onChange={(e) => onChange({ [field]: e.target.value })} autoComplete="off" aria-invalid={!!err(field)}
      className={`${cell} ${err(field) ? 'border-red-600' : ''}`} />
  );
  return (
    <>
      <tr className={r.archived ? 'opacity-60' : ''}>
        <td className="px-1 text-slate-500">{n}</td>
        <td className="px-1">{text('grade', s.grade)}{err('grade') && <p role="alert" className="text-xs text-red-700">{err('grade')}</p>}</td>
        <td className="px-1">{text('cleaning', s.cleaning)}</td>
        <td className="px-1">{text('purity', s.purity)}</td>
        <td className="px-1">{text('moisture', s.moisture)}</td>
        <td className="px-1">
          <select aria-label={`${s.unit} ${n}`} value={r.unit} onChange={(e) => onChange({ unit: e.target.value as Product['unit'] })} className={cell}>
            {UNITS.map((u) => <option key={u} value={u}>{t.common.unit[u]}</option>)}
          </select>
        </td>
        <td className="px-1">
          <input aria-label={`${s.gstRate} ${n}`} inputMode="decimal" value={r.gst_rate} onChange={(e) => { const v = e.target.value.replace(',', '.'); if (numberOk(v, 2)) onChange({ gst_rate: v }); }}
            className={`${cell} text-right tabular-nums ${err('gst_rate') ? 'border-red-600' : ''}`} aria-invalid={!!err('gst_rate')} />
          {err('gst_rate') && <p role="alert" className="text-xs text-red-700">{err('gst_rate')}</p>}
        </td>
        {(['ref_rate_usd', 'ref_rate_inr'] as const).map((field) => (
          <td key={field} className="px-1">
            <input aria-label={`${field === 'ref_rate_usd' ? s.refUsdLabel : s.refInrLabel} ${n}`} inputMode="decimal" value={r[field]} placeholder="0.00"
              onChange={(e) => { const v = e.target.value.replace(',', '.'); if (numberOk(v, 2)) onChange({ [field]: v }); }}
              className={`${cell} text-right tabular-nums ${err(field) ? 'border-red-600' : ''}`} aria-invalid={!!err(field)} />
            {err(field) && <p role="alert" className="text-xs text-red-700">{err(field)}</p>}
          </td>
        ))}
        <td className="px-1">
          <label className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-emerald-800">
            <input type="checkbox" checked={!r.archived} onChange={(e) => onChange({ archived: !e.target.checked })} className="h-4 w-4 accent-forest-700" aria-label={`${s.gradeStatus} ${n}`} />
            {r.archived ? s.archivedBadge : s.statusActive}
          </label>
        </td>
        <td className="px-1 text-right">
          {onRemove && <button type="button" onClick={onRemove} aria-label={s.removeGrade(n)} className="tap inline-grid place-items-center rounded-lg text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
          {onDelete && <button type="button" disabled={busy} onClick={onDelete} aria-label={s.deleteGrade(n)} title={s.deleteGrade(n)} className="tap inline-grid place-items-center rounded-lg text-red-700 hover:bg-red-50 disabled:opacity-45"><Trash2 className="h-4 w-4" /></button>}
        </td>
      </tr>
      <tr className={r.archived ? 'opacity-60' : ''}>
        <td />
        <td colSpan={10} className="px-1 pb-2">
          <Textarea rows={2} label={`${s.specification} · ${r.grade.trim() || s.untitledGrade}`} optional placeholder={s.specificationPlaceholder} value={r.specification}
            onChange={(e) => onChange({ specification: e.target.value })} error={err('specification')} />
        </td>
      </tr>
    </>
  );
}
