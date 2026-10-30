/**
 * "Today's dollar rate" box at the top of the dashboard: shows the rupees one US dollar is worth today, who set it and when, and lets
 * anyone signed in change it. The rate is shared by the whole team and the API uses it in every quote calculation (rupee value of a
 * dollar quote, margin from rupee costs); this screen only shows and edits it and never calculates.
 * API: GET /fx-rate (useFxRate, key ['fx-rate']) and PUT /fx-rate { rate }. A rate saved on an earlier day is still shown, with a warning
 * asking for today's rate. Used by pages/Today.tsx.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Button, NumberInput, errorMessage, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { date } from '@/lib/format';
import { useFxRate } from '@/lib/hooks';
import type { FxRate } from '@/lib/types';
import { t } from '@/strings';

const c = t.today;

/** '83.4500' -> '83.45' (the API stores 4 decimals; people think in 2). */
const shown = (rate: string) => rate.replace(/(\.\d\d)0+$/, '$1');

export function FxRateBar() {
  const q = useFxRate();
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();
  const fx = q.data;

  // follow the saved rate until the person starts typing
  useEffect(() => { if (!dirty) setValue(fx?.rate ? shown(fx.rate) : ''); }, [fx?.rate, dirty]);

  const save = useMutation({
    mutationFn: () => api.put<FxRate>('/fx-rate', { rate: value }),
    onSuccess: (saved) => { qc.setQueryData(['fx-rate'], saved); void qc.invalidateQueries({ queryKey: ['quote-calc'] }); setDirty(false); setError(undefined); toast(c.fxSaved); },
    onError: (e) => { const msg = e instanceof ApiError && e.fields?.rate ? e.fields.rate : errorMessage(e); setError(msg); toast(c.fxFailed, 'error'); },
  });

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!/^\d+(\.\d{1,4})?$/.test(value) || Number(value) <= 0) { setError(c.fxInvalid); return; }
    setError(undefined);
    save.mutate();
  };

  const stale = !!fx?.rate && !fx.is_today;
  return (
    <section aria-label={c.fxTitle} className={clsx('flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-surface p-4 shadow-card', !fx?.rate || stale ? 'border-warning' : 'border-line')}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted">{c.fxTitle}</p>
        <p className="mt-1 text-[28px] font-bold leading-8 tabular-nums text-ink" aria-live="polite">
          {fx?.rate ? <>₹{shown(fx.rate)} <span className="text-base font-medium text-ink-muted">{c.fxPer}</span></> : <span className="text-ink-placeholder">{q.isPending ? ' ' : c.fxNotSet}</span>}
        </p>
        <p className={clsx('mt-1 text-sm', !fx?.rate || stale ? 'text-warning-ink' : 'text-ink-muted')}>
          {q.isError ? errorMessage(q.error) : !fx?.rate ? (q.isPending ? ' ' : c.fxNotSetHint) : stale ? c.fxStale(date(fx.rate_date)) : c.fxSetBy(fx.updated_by_name ?? '', date(fx.updated_at))}
        </p>
      </div>
      <form onSubmit={submit} className="flex items-start gap-2" noValidate>
        <NumberInput label={c.fxLabel} decimals={4} value={value} error={error} wrapperClassName="w-40" onChange={(v) => { setValue(v); setDirty(true); setError(undefined); }} />
        <Button type="submit" className="mt-[1.65rem]" loading={save.isPending} disabled={!dirty && !!fx?.rate && fx.is_today}>{c.fxSave}</Button>
      </form>
    </section>
  );
}
