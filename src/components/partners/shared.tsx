/**
 * Small pieces shared by the partner screens: role badges, the status pill, and the "Log activity" sheet (POST /partners/:id/activities,
 * which refreshes the keys ['partners'] and ['partner', id]).
 */
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { Button, ErrorNote, Select, Sheet, Textarea, Input, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { todayIST } from '@/lib/format';
import { ACTIVITY_KINDS, type Partner, type PartnerActivityKind, type PartnerRole, type PartnerStatus } from '@/lib/partners';
import { t } from '@/strings';

const s = t.partners;

const STATUS_STYLE: Record<PartnerStatus, string> = {
  active: 'bg-success-bg text-success-ink',
  under_review: 'bg-warning-bg text-warning-ink',
  inactive: 'bg-surface-muted text-fg-muted',
};

/** The partner's status as a coloured pill. */
export function StatusPill({ status }: { status: PartnerStatus }) {
  return <span className={clsx('inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_STYLE[status])}>{s.status[status]}</span>;
}

/** One small badge per role. */
export function RoleBadges({ roles }: { roles: PartnerRole[] }) {
  return <div className="flex flex-wrap gap-1">{roles.map((r) => <span key={r} className="inline-flex whitespace-nowrap rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-secondary">{s.roles[r]}</span>)}</div>;
}

/** Sheet to log a call, message, e-mail, meeting or note for a partner; closed while `partner` is null. */
export function LogActivitySheet({ partner, onClose }: { partner: Partner | null; onClose: () => void }) {
  return <Sheet open={!!partner} onClose={onClose} title={s.p.logActivity}>{partner && <LogActivityForm key={partner.id} partner={partner} onClose={onClose} />}</Sheet>;
}

function LogActivityForm({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<PartnerActivityKind>('call');
  const [body, setBody] = useState('');
  const [happened, setHappened] = useState(todayIST());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!body.trim()) { setErrors({ body: 'Write a short note.' }); return; }
    setBusy(true);
    setFatal(null);
    try {
      await api.post(`/partners/${partner.id}/activities`, { kind, body: body.trim(), happened_at: happened });
      void qc.invalidateQueries({ queryKey: ['partners'] });
      void qc.invalidateQueries({ queryKey: ['partner', partner.id] });
      toast(s.p.a.saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) setErrors(err.fields); else setFatal(err);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      <p className="text-sm text-ink-muted">{partner.company_name}</p>
      <Select label={s.p.a.kind} value={kind} onChange={(e) => setKind(e.target.value as PartnerActivityKind)} error={errors.kind}>{ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{s.p.kind[k]}</option>)}</Select>
      <Textarea label={s.p.a.body} rows={4} autoFocus value={body} onChange={(e) => setBody(e.target.value)} error={errors.body} />
      <Input label={s.p.a.date} type="date" max={todayIST()} value={happened} onChange={(e) => setHappened(e.target.value)} error={errors.happened_at} />
      {fatal !== null && <ErrorNote error={fatal} />}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{s.f.cancel}</Button><Button type="submit" loading={busy}>{s.p.a.save}</Button></div>
    </form>
  );
}
