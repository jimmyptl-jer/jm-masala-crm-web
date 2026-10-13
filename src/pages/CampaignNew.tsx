/**
 * Campaign composer (routes /marketing/campaigns/new and /marketing/campaigns/:id/edit): build an e-mail campaign in four
 * steps - 1 Message (template, subject, wording, button), 2 Products & files (products with their pictures, PDFs to attach),
 * 3 Recipients (all eligible buyers, filters, or individual buyers), 4 Preview & send (the exact e-mail, test e-mail,
 * confirmation, Send). The campaign is saved as a draft when you press "Save draft" or move to step 4, so nothing is lost and
 * the preview, test and send all work on the saved draft.
 * API: POST /marketing/campaigns (create draft) and PATCH /marketing/campaigns/:id (update draft); editing loads
 * GET /marketing/campaigns/:id and opens the report instead if the campaign was already sent. The steps call their own
 * endpoints (see components/marketing/*Step.tsx). After a send starts the page opens the campaign report.
 * Local state: step, form (a CampaignInput), savedId, version (bumped on every save so the preview reloads).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MessageStep } from '@/components/marketing/MessageStep';
import { ProductsStep } from '@/components/marketing/ProductsStep';
import { RecipientsStep } from '@/components/marketing/RecipientsStep';
import { ReviewStep } from '@/components/marketing/ReviewStep';
import { Button, ErrorNote, PageHeader, Spinner, errorMessage, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { emptyCampaign } from '@/lib/marketing';
import type { Campaign, CampaignInput, CampaignReport } from '@/lib/types';
import { t } from '@/strings';

const m = t.mkt;

/** Route component for both routes; remounts (fresh state) when the campaign id changes. */
export default function CampaignNew() {
  const { id } = useParams();
  return <Composer key={id ?? 'new'} draftId={id} />;
}

/** Keeps only the fields the API accepts from a stored campaign. */
const toInput = (c: Campaign): CampaignInput => ({
  name: c.name, template_id: c.template_id, subject: c.subject, body: c.body, cta_label: c.cta_label, product_ids: c.product_ids,
  asset_ids: c.asset_ids, include_product_images: c.include_product_images, audience: c.audience,
});

function Composer({ draftId }: { draftId: string | undefined }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CampaignInput>(emptyCampaign());
  const [savedId, setSavedId] = useState<string | null>(draftId ?? null);
  const [version, setVersion] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // the loaded draft is copied into the form once
  const loaded = useRef(false);

  const draft = useQuery({
    queryKey: ['marketing', 'campaign', draftId],
    queryFn: () => api.get<CampaignReport>(`/marketing/campaigns/${draftId}`),
    enabled: !!draftId,
    staleTime: 0,
  });
  useEffect(() => {
    if (!draft.data || loaded.current) return;
    loaded.current = true;
    if (draft.data.campaign.status !== 'draft') { navigate(`/marketing/campaigns/${draftId}`, { replace: true }); return; }
    setForm(toInput(draft.data.campaign));
  }, [draft.data, draftId, navigate]);

  /** Changes some fields of the campaign and clears their error messages. */
  const set = (p: Partial<CampaignInput>) => { setForm((f) => ({ ...f, ...p })); setErrors((e) => { const n = { ...e }; for (const k of Object.keys(p)) delete n[k]; return n; }); };

  /**
   * Saves the draft (create or update) and returns its id, or null when it could not be saved (the error is shown).
   * The name defaults to the subject when left empty.
   */
  const persist = async (): Promise<string | null> => {
    const body = { ...form, name: form.name.trim() || form.subject.trim(), cta_label: form.cta_label?.trim() || null };
    try {
      const saved = savedId ? await api.patch<Campaign>(`/marketing/campaigns/${savedId}`, body) : await api.post<Campaign>('/marketing/campaigns', body);
      setSavedId(saved.id);
      setVersion((v) => v + 1);
      void qc.invalidateQueries({ queryKey: ['marketing', 'campaigns'] });
      return saved.id;
    } catch (e) {
      if (e instanceof ApiError && e.fields) setErrors(e.fields); else toast(errorMessage(e), 'error');
      return null;
    }
  };

  /** Checks the current step in the browser; returns the problems found (empty = fine to continue). */
  const check = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.subject.trim()) e.subject = `${m.subjectLabel} ${t.common.required}`;
      if (!form.body.trim()) e.body = `${m.bodyLabel} ${t.common.required}`;
    }
    return e;
  };

  const next = async () => {
    const e = check();
    setErrors(e);
    if (Object.keys(e).length) { toast(t.quoteForm.fixHighlighted, 'error'); return; }
    if (step === 2) {
      setBusy(true);
      const id = await persist();
      setBusy(false);
      if (!id) return;
    }
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0 });
  };

  const saveDraft = async () => {
    const e = check();
    setErrors(e);
    if (Object.keys(e).length) { toast(t.quoteForm.fixHighlighted, 'error'); return; }
    setBusy(true);
    const id = await persist();
    setBusy(false);
    if (id) toast(m.draftSaved);
  };

  if (draftId && draft.isError) return <ErrorNote error={draft.error} onRetry={() => void draft.refetch()} />;
  if (draftId && !loaded.current) return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <Link to="/marketing?tab=campaigns" className="tap -ml-2 mb-1 inline-flex items-center gap-1 rounded-lg px-2 text-base font-medium text-forest-800 hover:bg-forest-50">
        <ChevronLeft className="h-5 w-5" aria-hidden />{m.reportBack}
      </Link>
      <PageHeader title={draftId ? m.composerEditTitle : m.composerTitle} subtitle={m.stepOf(step + 1, 4)} />

      <ol className="mb-4 grid grid-cols-4 gap-2" aria-label={m.composerTitle}>
        {m.stepLabels.map((label, i) => (
          <li key={label}>
            <button
              type="button" disabled={i > step && !savedId} onClick={() => { if (i <= step || savedId) setStep(i); }} aria-current={i === step ? 'step' : undefined}
              className={clsx('flex min-h-[48px] w-full flex-col items-center justify-center rounded-lg border px-1 py-1 text-center text-xs font-semibold md:flex-row md:gap-2 md:text-sm',
                i === step ? 'border-forest-900 bg-forest-900 text-white' : i < step ? 'border-forest-700/40 bg-forest-50 text-forest-900' : 'border-forest-900/20 bg-white text-ink/60')}
            >
              <span className="text-base font-bold">{i + 1}</span><span className="leading-tight">{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && <MessageStep form={form} set={set} errors={errors} />}
      {step === 1 && <ProductsStep form={form} set={set} />}
      {step === 2 && <RecipientsStep form={form} set={set} />}
      {step === 3 && savedId && <ReviewStep form={form} id={savedId} version={version} onSent={(id) => navigate(`/marketing/campaigns/${id}`)} />}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => navigate('/marketing?tab=campaigns')}>{m.cancel}</Button>
        <Button variant="secondary" loading={busy} onClick={() => void saveDraft()}>{m.saveDraft}</Button>
        <div className="ml-auto flex gap-2">
          {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>{m.back}</Button>}
          {step < 3 && <Button loading={busy} onClick={() => void next()}>{m.next}</Button>}
        </div>
      </div>
    </div>
  );
}
