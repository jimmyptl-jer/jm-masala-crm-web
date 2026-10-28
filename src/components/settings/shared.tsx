/**
 * Shared pieces for the Settings sections: saveSettings (PUT /settings), the useSectionSave hook, and the
 * Section and SaveBar components.
 * API: GET /settings (via fetchQuery) and PUT /settings (admin only, api/src/routes/masters.ts); cache key
 * ['settings'] is replaced and invalidated after every save.
 * Used by CompanyPanel, BankPanel, DefaultsPanel and TermsEditor (TermsPanel), and Section by
 * pages/Settings.tsx. Errors from the API arrive as ApiError.fields with keys like 'company.name' or
 * 'export_terms.1'.
 * SRS: FR-04 (admin-only settings).
 */

import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button, Card, ErrorNote, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { t } from '@/strings';

// Company details as edited in the form: everything in Settings['company'] except logo_path, which the logo
// upload manages and the server preserves.
type Company = Omit<Settings['company'], 'logo_path'>;
// Bank details block of the settings object.
type Bank = Settings['bank'];

/**
 * What one settings section changes. Every field is optional; anything left out is taken from the server's
 * current settings by saveSettings. company and bank may be partial (only the edited keys).
 */
export interface SettingsPatch {
  company?: Partial<Company>;
  bank?: Partial<Bank>;
  export_terms?: string[];
  domestic_terms?: string[];
  validity_days?: number;
  followup_days?: number;
}

/**
 * Save one section of the company settings with PUT /settings (admin only).
 * The API wants the COMPLETE settings object on every PUT, so this first loads a fresh copy of the current
 * settings (GET /settings, staleTime 0 so a cached copy is never used), overlays `patch`, and sends
 * everything. That way saving "Bank" never overwrites a change made to "Company" elsewhere. Missing text
 * fields are sent as ''; validity_days and followup_days are converted to numbers (the only numbers in the
 * payload; they are day counts, not money).
 * Afterwards the answer is written into the react-query cache entry ['settings'] and that key is
 * invalidated, so useSettings() consumers (quote form defaults, the Settings screen) see the new values.
 * @param qc — the app's QueryClient. @param patch — the edited section(s).
 * @returns the saved Settings returned by the API (it also includes logo_url).
 * @throws ApiError, e.g. 400 validation_error with `fields` such as 'company.name' or 'export_terms.2'.
 */
export async function saveSettings(qc: ReturnType<typeof useQueryClient>, patch: SettingsPatch): Promise<Settings> {
  // Always fetch the latest settings first (staleTime: 0 forces a real request).
  const cur = await qc.fetchQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings'), staleTime: 0 });
  const c = cur.company;
  const b = cur.bank;
  // The full PUT body. `...patch.company` / `...patch.bank` override just the edited keys. logo_path is
  // deliberately not included: the API keeps the existing one.
  const body = {
    company: {
      name: c.name ?? '', address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '',
      iec: c.iec ?? '', gstin: c.gstin ?? '', state: c.state ?? '', state_code: c.state_code ?? '',
      ...patch.company,
    },
    bank: {
      bank_name: b.bank_name ?? '', branch: b.branch ?? '', account_no: b.account_no ?? '',
      ifsc: b.ifsc ?? '', swift: b.swift ?? '', ad_code: b.ad_code ?? '',
      ...patch.bank,
    },
    export_terms: patch.export_terms ?? cur.export_terms,
    domestic_terms: patch.domestic_terms ?? cur.domestic_terms,
    validity_days: Number(patch.validity_days ?? cur.validity_days),
    followup_days: Number(patch.followup_days ?? cur.followup_days),
  };
  const saved = await api.put<Settings>('/settings', body);
  // Put the saved copy into the cache immediately, then mark it stale so it is re-read.
  qc.setQueryData(['settings'], saved);
  await qc.invalidateQueries({ queryKey: ['settings'] });
  return saved;
}

/**
 * Shared save logic for the settings sections (Company, Bank, Terms, Defaults).
 * @returns { busy, errors, setErrors, fatal, run }:
 * - busy: a save is running (panels show a spinner on Save).
 * - errors: field -> message from an ApiError's `fields`; panels read keys like 'company.name' or
 *   'bank.ifsc' (or the bare key) to show text under inputs.
 * - setErrors: lets a panel set its own client-side errors before calling run.
 * - fatal: a non-field error (network, 500) shown in the SaveBar.
 * - run(patch): clears old errors, calls saveSettings(patch), shows the "Settings saved" toast and resolves
 *   true; on failure sets errors/fatal and resolves false.
 * Double-submit guard: `inFlight` is a ref (updated immediately, unlike state), so a second run() while one
 * is in progress returns false without sending anything.
 */
export function useSectionSave() {
  const qc = useQueryClient();
  const toast = useToast();
  // True while a save is running; a ref because it must change instantly, before React re-renders.
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fatal, setFatal] = useState<unknown>(null);

  // Start a save. Returns true only when the API accepted it.
  const run = async (patch: SettingsPatch): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setErrors({});
    setFatal(null);
    try {
      await saveSettings(qc, patch);
      toast(t.settings.saved);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
      else setFatal(e);
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { busy, errors, setErrors, fatal, run };
}

/**
 * One collapsible card of the Settings screen (a heading button that toggles the body).
 * The body stays mounted but hidden (the `hidden` attribute) when closed, so unsaved typing is not lost
 * when another section is opened.
 * @param props.title — heading text. @param props.open — whether the body is visible.
 * @param props.onToggle — called when the heading is clicked (Settings keeps one section open at a time).
 *   @param props.children — the panel.
 */
export function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <Card>
      <h2>
        <button type="button" aria-expanded={open} onClick={onToggle} className="tap flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="text-[17px] font-bold leading-6 text-ink">{title}</span>
          <ChevronDown className={`h-6 w-6 shrink-0 text-forest-800 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h2>
      <div hidden={!open} className="border-t border-cream-200 px-4 py-4">{children}</div>
    </Card>
  );
}

/**
 * Sticky bar with the Save (submit) button and any non-field error, placed at the bottom of every settings
 * form. Sits above the phone tab bar (bottom-[4.5rem]) and at the very bottom from md width.
 * @param props.busy — shows the spinner and disables the button (prevents double-saves).
 * @param props.fatal — error to show above the button (an ErrorNote), or null.
 * @param props.label — button text, default "Save".
 */
export function SaveBar({ busy, fatal, label }: { busy: boolean; fatal: unknown; label?: string }) {
  return (
    <div className="sticky bottom-[4.5rem] z-10 -mx-4 mt-4 space-y-2 border-t border-cream-200 bg-surface px-4 py-3 md:bottom-0">
      {fatal !== null && <ErrorNote error={fatal} />}
      <Button type="submit" className="w-full" loading={busy}>{busy ? t.common.saving : label ?? t.settings.save}</Button>
    </div>
  );
}
