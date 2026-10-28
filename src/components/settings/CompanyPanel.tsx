/**
 * Settings > Company form (admin only, FR-04): the company identity printed on every PDF, plus the logo.
 * API: PUT /settings (through useSectionSave in shared.tsx) and POST /settings/logo (multipart upload).
 * Cache key ['settings'] is replaced after each. Validation errors come back as ApiError.fields keyed
 * 'company.<field>'.
 * Rendered by pages/Settings.tsx. Composes Input, Textarea, Select, Button, SaveBar. Uses INDIAN_STATES and
 * GSTIN_RE from lib/india.ts. SRS: BR-06 (company state code decides CGST+SGST vs IGST).
 */

import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Button, ErrorNote, Input, Select, Textarea, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { GSTIN_RE, INDIAN_STATES } from '@/lib/india';
import type { Settings } from '@/lib/types';
import { t } from '@/strings';
import { SaveBar, useSectionSave } from './shared';

const s = t.settings;
// Largest logo file accepted: 2 MB (the API enforces the same limit).
const MAX_LOGO = 2 * 1024 * 1024;

/**
 * "Company" section of Settings (admin): logo, name, address, phone, email, IEC, GSTIN and state.
 * @param props.settings — current settings from GET /settings; used once to fill the form (the logo preview
 *   always shows the latest settings.logo_url).
 * Save: client checks (name required, GSTIN shape) then run({ company }) -> PUT /settings -> toast; API
 * errors keyed 'company.<field>' show under the inputs.
 * State dropdown: picking a state fills both state and state_code; the code decides CGST+SGST vs IGST on
 * domestic quotes (BR-06).
 * Logo: a separate action, saved immediately and not by the Save button. Choose/Change -> file picker (PNG
 * or JPEG, max 2 MB, checked in the browser) -> POST /settings/logo (multipart) -> the answer replaces
 * cache ['settings'] -> success toast. Errors show under the logo.
 * Local state: f (text fields), logoBusy (upload running, disables the button), logoError (client-side
 * message), logoFatal (API error).
 */
export function CompanyPanel({ settings }: { settings: Settings }) {
  // Used to refresh the settings cache after a logo upload.
  const qc = useQueryClient();
  const toast = useToast();
  // Save plumbing from shared.tsx (busy, errors, setErrors for client checks, fatal, run).
  const { busy, errors, setErrors, fatal, run } = useSectionSave();
  const c = settings.company;
  // Editable copy of the company text fields (missing values become '').
  const [f, setF] = useState({
    name: c.name ?? '', address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '',
    iec: c.iec ?? '', gstin: c.gstin ?? '', state: c.state ?? '', state_code: c.state_code ?? '',
  });
  // Update one field.
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  // Hidden <input type=file>; the visible button clicks it.
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoFatal, setLogoFatal] = useState<unknown>(null);

  // Message for a field. The API names errors 'company.<field>', so look that up first, then the bare name
  // (client-side checks use bare names).
  const err = (k: string) => errors[`company.${k}`] ?? errors[k];

  /**
   * Form submit handler. Checks that the name is filled and that a typed GSTIN matches the 15-character
   * pattern (shown in the inputs if not), then saves with run({ company }) -> PUT /settings. The GSTIN is
   * upper-cased and the name trimmed before sending.
   * @param ev — submit event.
   */
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const v: Record<string, string> = {};
    if (!f.name.trim()) v.name = s.nameRequired;
    const g = f.gstin.trim().toUpperCase();
    if (g && !GSTIN_RE.test(g)) v.gstin = s.gstinInvalid;
    if (Object.keys(v).length) { setErrors(v); return; }
    await run({ company: { ...f, name: f.name.trim(), gstin: g } });
  };

  /**
   * Handle a chosen logo file: reject anything that is not PNG/JPEG or is over 2 MB (message under the
   * logo, nothing sent), otherwise upload with api.upload('/settings/logo', file) and put the returned
   * settings in the cache so the preview updates at once.
   * Ignored if no file or an upload is already running. The file input is cleared afterwards so the same
   * file can be picked again.
   * @param file — the first selected file, or undefined if the dialog was cancelled.
   */
  const pickLogo = async (file: File | undefined) => {
    if (!file || logoBusy) return;
    setLogoError(null);
    setLogoFatal(null);
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') { setLogoError(s.logoBadType); return; }
    if (file.size > MAX_LOGO) { setLogoError(s.logoTooBig); return; }
    setLogoBusy(true);
    try {
      const saved = await api.upload<Settings>('/settings/logo', file);
      qc.setQueryData(['settings'], saved);
      await qc.invalidateQueries({ queryKey: ['settings'] });
      toast(s.logoUploaded);
    } catch (e) {
      setLogoFatal(e);
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {/*
      Logo block: preview (or placeholder icon), choose/change button, hint and upload errors.
      Uploads immediately, independent of Save.
      */}
      <div>
        <div className="mb-1 text-sm font-medium text-forest-900">{s.logo}</div>
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-cream-200 bg-cream-50">
            {settings.logo_url ? <img src={settings.logo_url} alt={s.logoAlt} className="h-full w-full object-contain" /> : <ImagePlus className="h-7 w-7 text-fg-muted" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {!settings.logo_url && <p className="text-sm text-fg-muted">{s.logoNone}</p>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pickLogo(e.target.files?.[0])} />
            <Button variant="secondary" loading={logoBusy} onClick={() => fileRef.current?.click()}>{settings.logo_url ? s.logoChange : s.logoChoose}</Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-fg-muted">{s.logoHint}</p>
        {logoError && <p role="alert" className="mt-1 text-sm text-red-700">{logoError}</p>}
        {logoFatal !== null && <div className="mt-2"><ErrorNote error={logoFatal} /></div>}
      </div>

      <Input label={s.companyName} value={f.name} onChange={(e) => set('name', e.target.value)} error={err('name')} autoComplete="off" />
      <Textarea label={s.address} value={f.address} onChange={(e) => set('address', e.target.value)} error={err('address')} rows={3} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={s.phone} type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} error={err('phone')} autoComplete="off" />
        <Input label={s.email} type="email" inputMode="email" value={f.email} onChange={(e) => set('email', e.target.value)} error={err('email')} autoComplete="off" />
        <Input label={s.iec} value={f.iec} onChange={(e) => set('iec', e.target.value)} error={err('iec')} autoComplete="off" />
        <Input label={s.gstin} value={f.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} autoCapitalize="characters" error={err('gstin')} autoComplete="off" />
      </div>
      <Select label={s.state} value={f.state_code} error={err('state') ?? err('state_code')}
        onChange={(e) => {
          const st = INDIAN_STATES.find((x) => x.code === e.target.value);
          setF((x) => ({ ...x, state: st?.name ?? '', state_code: st?.code ?? '' }));
        }}>
        <option value="">{s.chooseState}</option>
        {INDIAN_STATES.map((st) => <option key={st.code} value={st.code}>{st.name} ({st.code})</option>)}
      </Select>
      <SaveBar busy={busy} fatal={fatal} />
    </form>
  );
}
