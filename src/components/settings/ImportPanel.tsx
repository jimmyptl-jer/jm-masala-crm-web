/**
 * Settings > Import from Excel (admin only, FR-04): bulk-load buyers or products from an .xlsx file.
 * API: GET /import/:entity/template, POST /import/:entity?mode=dry and ?mode=commit
 * (api/src/routes/misc.ts; entity = buyers | products). After a commit it invalidates the react-query key
 * ['buyers'] or ['products'].
 * Flow: pick entity -> download template -> upload (automatic dry run, shows errors) -> Import. Commit is
 * all-or-nothing and refuses duplicates. Rendered by pages/Settings.tsx; composes Segmented, Button,
 * ErrorNote.
 */

import { useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Button, ErrorNote, Segmented, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { ImportReport } from '@/lib/types';
import { t } from '@/strings';

const s = t.settings;
// What can be imported: the buyers list or the products list.
type Entity = 'buyers' | 'products';

/** Which columns to show in the preview of valid rows, per entity. */
const PREVIEW: Record<Entity, string[]> = {
  buyers: ['company_name', 'type', 'city', 'country', 'state'],
  products: ['name', 'grade', 'unit', 'gst_rate'],
};
/**
 * One preview row as a single line: the chosen columns joined by ' · ', skipping empty values.
 * @param row — a valid row as the API would save it. @param entity — decides the columns.
 */
const previewLine = (row: Record<string, unknown>, entity: Entity) =>
  PREVIEW[entity].map((k) => row[k]).filter((v) => v !== null && v !== undefined && v !== '').map(String).join(' · ');

/**
 * "Import from Excel" section of Settings (admin). A 3-step flow with a safe dry run:
 * 1. Choose Buyers or Products (Segmented; changing it clears everything).
 * 2. "Download template" -> GET /import/:entity/template saves an .xlsx with the expected columns
 * (api.download).
 * 3. "Choose file" -> the .xlsx is uploaded at once as a DRY RUN (POST /import/:entity?mode=dry). The
 * report shows rows read, rows valid and a list of problems by Excel row and column, plus a preview of the
 * first valid rows. Nothing is saved yet.
 * "Import N rows" appears only when there are no errors and at least one valid row. It uploads the same
 * file again with POST /import/:entity?mode=commit; the API saves all rows in one transaction (or none),
 * then the ['buyers'] or ['products'] lists are invalidated, a toast shows the count and a "done" box
 * offers "Import another".
 * Rows that duplicate an existing buyer/product (or repeat inside the file) are reported as errors, so a
 * double upload cannot create copies.
 * Local state: entity, file (chosen File), report (last dry-run result), saved (result of the last import),
 * busy ('template' | 'check' | 'commit' | null: disables all controls so only one request runs at a time),
 * error (any thrown value shown in an ErrorNote).
 */
export function ImportPanel() {
  // Used to refresh the buyers/products lists after a successful import.
  const qc = useQueryClient();
  const toast = useToast();
  // Hidden file input; the visible button clicks it.
  const fileRef = useRef<HTMLInputElement>(null);
  // Which list is being imported.
  const [entity, setEntity] = useState<Entity>('buyers');
  // The file chosen in step 3; kept so Import can upload it again in commit mode.
  const [file, setFile] = useState<File | null>(null);
  // The last dry-run report (ImportReport) from the API, or null.
  const [report, setReport] = useState<ImportReport | null>(null);
  // After a successful commit: how many rows were saved and for which entity (drives the green "done" box).
  const [saved, setSaved] = useState<{ n: number; entity: Entity } | null>(null);
  // Which request is running, if any.
  const [busy, setBusy] = useState<'template' | 'check' | 'commit' | null>(null);
  // Last failure (network, bad file, server error) for the ErrorNote.
  const [error, setError] = useState<unknown>(null);

  // Forget the file, report, result and error (used when switching entity and by "Import another").
  const reset = () => { setFile(null); setReport(null); setSaved(null); setError(null); };

  /**
   * Switch between buyers and products and clear the screen; ignored while a request is running. @param e —
   * the new entity.
   */
  const changeEntity = (e: Entity) => { if (!busy) { setEntity(e); reset(); } };

  /**
   * Download the import template for the chosen entity: GET /import/:entity/template, saved as
   * '<entity>-import-template.xlsx'. Ignored while busy; errors go to the ErrorNote.
   */
  const template = async () => {
    if (busy) return;
    setBusy('template');
    setError(null);
    try { await api.download(`/import/${entity}/template`, `${entity}-import-template.xlsx`); }
    catch (e) { setError(e); }
    finally { setBusy(null); }
  };

  /**
   * Dry run: upload the file with POST /import/:entity?mode=dry and store the ImportReport (errors, valid
   * count, preview). Nothing is saved on the server.
   * @param f — the .xlsx file.
   */
  const check = async (f: File) => {
    setBusy('check');
    setError(null);
    setReport(null);
    setSaved(null);
    try { setReport(await api.upload<ImportReport>(`/import/${entity}?mode=dry`, f)); }
    catch (e) { setError(e); }
    finally { setBusy(null); }
  };

  /**
   * File input change handler: take the first file, remember it and start the dry-run check immediately.
   * The input's value is cleared first so choosing the same file again (after fixing it) still fires a
   * change event.
   * @param ev — change event of the file input.
   */
  const onPick = (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0];
    ev.target.value = ''; // allow choosing the same file again after fixing it
    if (!f || busy) return;
    setFile(f);
    void check(f);
  };

  /**
   * "Import N rows" handler: upload the remembered file with POST /import/:entity?mode=commit. On success:
   * record the saved count, clear the report and file, invalidate [entity] and toast. If the API answers
   * 400 `import_has_errors` (the file changed in the meantime, or rows now conflict), the error body is not
   * kept by ApiError, so the dry run is simply repeated to show the current problem list. Other errors go
   * to the ErrorNote.
   */
  const commit = async () => {
    if (!file || busy) return;
    setBusy('commit');
    setError(null);
    try {
      const r = await api.upload<ImportReport>(`/import/${entity}?mode=commit`, file);
      setSaved({ n: r.saved, entity });
      setReport(null);
      setFile(null);
      await qc.invalidateQueries({ queryKey: [entity] });
      toast(s.importedToast(r.saved));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'import_has_errors') {
        // the 400 body holds the report but ApiError drops it, so run the check again to show the problems
        setBusy(null);
        await check(file);
        return;
      }
      setError(e);
    } finally {
      setBusy((b) => (b === 'commit' ? null : b));
    }
  };

  // Number of problems in the report.
  const errCount = report?.errors.length ?? 0;
  // The Import button is available only for a clean report with at least one valid row and the file still
  // held.
  const canImport = !!report && !!file && errCount === 0 && report.valid > 0;

  return (
    <div className="space-y-3">
      <p className="text-base text-fg-secondary">{s.importIntro}</p>

      <Segmented<Entity> label={s.importStep1} value={entity} onChange={changeEntity} disabled={!!busy}
        options={[{ value: 'buyers', label: s.entityBuyers }, { value: 'products', label: s.entityProducts }]} />

      <div>
        <div className="mb-1 text-sm font-medium text-forest-900">{s.importStep2}</div>
        <Button variant="secondary" className="w-full" loading={busy === 'template'} disabled={!!busy} onClick={() => void template()}>
          <Download className="h-5 w-5" aria-hidden />{s.downloadTemplate}
        </Button>
      </div>

      <div>
        <div className="mb-1 text-sm font-medium text-forest-900">{s.importStep3}</div>
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-hidden onChange={onPick} />
        <Button variant="secondary" className="w-full" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          <FileSpreadsheet className="h-5 w-5" aria-hidden />{file ? s.changeFile : s.chooseFile}
        </Button>
        {file && <p className="mt-1 break-all text-sm text-fg-secondary">{file.name}</p>}
        <p className="mt-1 text-xs text-fg-muted">{s.fileHint}</p>
      </div>

      {busy === 'check' && <p role="status" className="text-base text-forest-800">{s.checking}</p>}
      {error !== null && <ErrorNote error={error} />}

      {report && (
        <div className="space-y-3 rounded-lg border border-forest-900/15 p-3" aria-live="polite">
          <h3 className="text-lg font-semibold text-forest-900">{s.reportTitle}</h3>
          <ul className="space-y-0.5 text-base">
            <li>{s.reportTotal(report.total)}</li>
            <li className="text-green-800">{s.reportValid(report.valid)}</li>
            {errCount > 0 && <li className="font-semibold text-red-700">{s.reportErrors(errCount)}</li>}
          </ul>

          {errCount > 0 && (
            <div>
              <h4 className="font-semibold text-forest-900">{s.errorsTitle}</h4>
              <p className="text-sm text-fg-secondary">{s.errorsHelp}</p>
              <ul className="mt-2 max-h-72 divide-y divide-red-100 overflow-y-auto rounded-lg border border-red-200 bg-red-50">
                {report.errors.map((e, i) => (
                  <li key={i} className="px-3 py-2 text-sm text-red-900">
                    <span className="font-semibold">{s.errorRow(e.row)}</span>
                    {e.field && <span>{` · ${s.errorColumn} ${e.field}`}</span>}
                    <div>{e.message}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.preview.length > 0 && (
            <div>
              <h4 className="font-semibold text-forest-900">{s.previewTitle}</h4>
              <ul className="mt-1 divide-y divide-cream-200 text-sm">
                {report.preview.map((row, i) => <li key={i} className="break-words py-1.5">{previewLine(row, entity) || '—'}</li>)}
              </ul>
            </div>
          )}

          {canImport && (
            <Button className="w-full" loading={busy === 'commit'} disabled={!!busy} onClick={() => void commit()}>
              {busy === 'commit' ? s.importing : s.importRows(report.valid)}
            </Button>
          )}
        </div>
      )}

      {saved && (
        <div role="status" className="space-y-2 rounded-lg bg-forest-50 p-3">
          <p className="text-base font-semibold text-forest-900">{s.importDone(saved.n, saved.entity === 'buyers' ? s.entityBuyers.toLowerCase() : s.entityProducts.toLowerCase())}</p>
          <Button variant="secondary" className="w-full" onClick={reset}>{s.importAnother}</Button>
        </div>
      )}
    </div>
  );
}
