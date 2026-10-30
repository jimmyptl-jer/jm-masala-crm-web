/**
 * Partner profile: /partners/:id. Header with the role badges, status and call / WhatsApp / e-mail buttons; the company details; Contacts
 * (add, edit, remove, one primary); Services per role with their documents (amber within 30 days of expiry, red when expired) and, for
 * administrators only, the rate, minimum order and payment terms; the activity timeline with "Log activity". Archive and restore live here.
 * API: GET /partners/:id (key ['partner', id]), PATCH /partners/:id (archive, restore, contacts, services), POST /partners/:id/activities.
 */
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Archive, ChevronLeft, Mail, MessageCircle, MessageSquarePlus, Pencil, Phone, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { ContactSheet } from '@/components/partners/ContactSheet';
import { PartnerForm } from '@/components/partners/PartnerForm';
import { ServiceSheet } from '@/components/partners/ServiceSheet';
import { LogActivitySheet, RoleBadges, StatusPill } from '@/components/partners/shared';
import { Button, EmptyState, ErrorNote, Sheet, Spinner, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { date, dateTime, money } from '@/lib/format';
import { usePartner } from '@/lib/hooks';
import { expiryTone, type PartnerContact, type PartnerService } from '@/lib/partners';
import { t } from '@/strings';

const s = t.partners;
const p = s.p;
const digits = (v: string) => v.replace(/[^\d]/g, '');

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return children ? <div><dt className="text-xs font-medium text-ink-muted">{label}</dt><dd className="mt-0.5 whitespace-pre-line text-sm text-ink">{children}</dd></div> : null;
}

function ExpiryChip({ expiresAt }: { expiresAt: string | null }) {
  const tone = expiryTone(expiresAt);
  if (tone === 'none') return null;
  return <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', tone === 'expired' ? 'bg-danger-bg text-danger-ink' : tone === 'soon' ? 'bg-warning-bg text-warning-ink' : 'bg-surface-muted text-ink-secondary')}>
    {date(expiresAt)}{tone === 'expired' ? ` · ${p.sv.expired}` : tone === 'soon' ? ` · ${p.sv.soon}` : ''}</span>;
}

export default function PartnerDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const query = usePartner(id);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [contact, setContact] = useState<PartnerContact | 'new' | null>(null);
  const [service, setService] = useState<PartnerService | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);

  if (query.isPending) return <Spinner label={s.loading} />;
  if (query.isError) {
    return query.error instanceof ApiError && query.error.status === 404
      ? <EmptyState title={s.notFound}><Link to="/partners" className="mt-2 font-semibold text-paprika underline">{p.back}</Link></EmptyState>
      : <ErrorNote error={query.error} onRetry={() => void query.refetch()} />;
  }
  const partner = query.data;
  const main = partner.contacts.find((c) => c.is_primary) ?? partner.contacts[0];
  const phone = main?.phone || partner.phone;
  const whatsapp = main?.whatsapp || partner.whatsapp || phone;
  const email = main?.email || partner.email;
  const location = [partner.address, [partner.city, partner.state].filter(Boolean).join(', '), [partner.country, partner.postal_code].filter(Boolean).join(' ')].filter(Boolean).join('\n');

  async function setArchived(archived: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      await api.patch(`/partners/${partner.id}`, { archived });
      void qc.invalidateQueries({ queryKey: ['partner', partner.id] });
      void qc.invalidateQueries({ queryKey: ['partners'] });
      toast(archived ? p.archivedToast : p.restoredToast);
    } catch (e) { setProblem(e); } finally { setBusy(false); }
  }

  const link = 'tap inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-hover';

  return <div className="space-y-5">
    <Link to="/partners" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-secondary hover:text-ink"><ChevronLeft className="h-4 w-4" />{p.back}</Link>

    <header className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-ink-muted">{partner.partner_code}</div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-ink">{partner.company_name}</h1>
          {partner.legal_name && <p className="text-sm text-ink-muted">{partner.legal_name}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2"><RoleBadges roles={partner.roles} /><StatusPill status={partner.status} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {phone && <a href={`tel:${phone}`} className={link}><Phone className="h-4 w-4" />{p.call}</a>}
          {whatsapp && <a href={`https://wa.me/${digits(whatsapp)}`} target="_blank" rel="noreferrer" className={link}><MessageCircle className="h-4 w-4" />{p.whatsapp}</a>}
          {email && <a href={`mailto:${email}`} className={link}><Mail className="h-4 w-4" />{p.email}</a>}
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />{p.edit}</Button>
          <Button onClick={() => setLogging(true)}><MessageSquarePlus className="h-4 w-4" />{p.logActivity}</Button>
        </div>
      </div>
      {partner.archived && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-muted px-4 py-3 text-sm text-ink-secondary"><span>{p.archived}</span><Button variant="secondary" loading={busy} onClick={() => void setArchived(false)}><RotateCcw className="h-4 w-4" />{p.restore}</Button></div>}
      {problem !== null && <div className="mt-4"><ErrorNote error={problem} /></div>}
    </header>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5">
        <section className="card p-5" aria-labelledby="pd-services">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="pd-services" className="text-lg font-bold text-ink">{p.services}</h2><Button variant="secondary" onClick={() => setService('new')}><Plus className="h-4 w-4" />{p.addService}</Button></div>
          {partner.services.length === 0 ? <p className="text-sm text-ink-muted">{p.noServices}</p> : <ul className="space-y-3">{partner.services.map((x) => (
            <li key={x.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-ink-secondary">{s.roles[x.role]}</span><div className="mt-1 font-semibold text-ink">{x.service_name || s.roles[x.role]}</div></div>
                <Button variant="ghost" aria-label={`${p.editService}: ${x.service_name || s.roles[x.role]}`} onClick={() => setService(x)}><Pencil className="h-4 w-4" /></Button>
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <Row label={p.sv.products}>{x.products_supplied.join(', ')}</Row>
                <Row label={p.sv.areas}>{x.service_areas.join(', ')}</Row>
                <Row label={p.sv.lead}>{x.lead_time_days == null ? '' : p.sv.leadDays(x.lead_time_days)}</Row>
                <Row label={p.sv.capacity}>{x.capacity_notes}</Row>
                {isAdmin && <Row label={p.sv.rate}>{x.rate_amount ? `${money(x.rate_amount, x.rate_currency)}${x.rate_unit ? ` ${p.units[x.rate_unit] ?? x.rate_unit}` : ''}` : ''}</Row>}
                {isAdmin && <Row label={p.sv.minimum}>{x.minimum_order_quantity}</Row>}
                {isAdmin && <Row label={p.sv.payment}>{x.payment_terms}</Row>}
                <Row label={p.sv.notes}>{x.notes}</Row>
              </dl>
              {x.documents.length > 0 && <div className="mt-3 border-t border-line pt-3"><div className="mb-1 text-xs font-medium text-ink-muted">{p.sv.documents}</div>
                <ul className="space-y-1.5">{x.documents.map((d, i) => <li key={i} className="flex flex-wrap items-center gap-2 text-sm text-ink"><span className="font-medium">{d.name}</span>{d.document_number && <span className="text-ink-muted">{d.document_number}</span>}<ExpiryChip expiresAt={d.expires_at} /></li>)}</ul></div>}
            </li>
          ))}</ul>}
          {!isAdmin && partner.services.length > 0 && <p className="mt-3 text-xs text-ink-muted">{p.sv.adminOnly}</p>}
        </section>

        <section className="card p-5" aria-labelledby="pd-activity">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="pd-activity" className="text-lg font-bold text-ink">{p.activity}</h2><Button variant="secondary" onClick={() => setLogging(true)}><MessageSquarePlus className="h-4 w-4" />{p.logActivity}</Button></div>
          {partner.activities.length === 0 ? <p className="text-sm text-ink-muted">{p.noActivity}</p> : <ol className="space-y-4">{partner.activities.map((a) => (
            <li key={a.id} className="border-l-2 border-line pl-4"><div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted"><span className="font-semibold text-ink-secondary">{p.kind[a.kind]}</span><span>{dateTime(a.happened_at)}</span><span>{a.user_name}</span></div><p className="mt-1 whitespace-pre-line text-sm text-ink">{a.body}</p></li>
          ))}</ol>}
        </section>
      </div>

      <aside className="space-y-5">
        <section className="card p-5" aria-labelledby="pd-contacts">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="pd-contacts" className="text-lg font-bold text-ink">{p.contacts}</h2><Button variant="secondary" onClick={() => setContact('new')}><Plus className="h-4 w-4" />{p.addContact}</Button></div>
          {partner.contacts.length === 0 ? <p className="text-sm text-ink-muted">{p.noContacts}</p> : <ul className="space-y-3">{partner.contacts.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0 text-sm"><div className="font-semibold text-ink">{c.name}{c.is_primary && <span className="ml-2 rounded-full bg-paprika-50 px-2 py-0.5 text-xs font-semibold text-paprika-700">{p.primary}</span>}</div>
                <div className="text-ink-muted">{[c.designation, c.department].filter(Boolean).join(' · ')}</div>
                {c.phone && <div className="text-ink-secondary">{c.phone}</div>}{c.email && <div className="break-all text-ink-secondary">{c.email}</div>}</div>
              <Button variant="ghost" aria-label={`${p.editContact}: ${c.name}`} onClick={() => setContact(c)}><Pencil className="h-4 w-4" /></Button>
            </li>
          ))}</ul>}
        </section>

        <section className="card p-5" aria-labelledby="pd-details">
          <h2 id="pd-details" className="mb-3 text-lg font-bold text-ink">{p.overview}</h2>
          <dl className="space-y-3">
            <Row label={p.address}>{location}</Row><Row label={p.gstin}>{partner.gstin}</Row><Row label={p.pan}>{partner.pan}</Row>
            <Row label={p.registration}>{partner.registration_details}</Row><Row label={p.notes}>{partner.notes}</Row>
            <Row label={s.f.website}>{partner.website}</Row>
          </dl>
          {!partner.archived && <Button variant="ghost" className="mt-4" loading={busy} onClick={() => { if (window.confirm(`${p.archive} ${partner.company_name}?`)) void setArchived(true); }}><Archive className="h-4 w-4" />{p.archive}</Button>}
        </section>
      </aside>
    </div>

    <Sheet wide open={editing} onClose={() => setEditing(false)} title={s.editTitle}><PartnerForm initial={partner} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} /></Sheet>
    <ContactSheet partner={partner} contact={contact} onClose={() => setContact(null)} />
    <ServiceSheet partner={partner} service={service} onClose={() => setService(null)} />
    <LogActivitySheet partner={logging ? partner : null} onClose={() => setLogging(false)} />
  </div>;
}
