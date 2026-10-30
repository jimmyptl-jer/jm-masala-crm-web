/**
 * Add / edit / remove one contact of a partner. The API saves contacts as a whole list, so every change sends the full list with
 * PATCH /partners/:id { contacts } and refreshes ['partner', id] and ['partners']. At most one contact is primary: ticking "Primary
 * contact" here clears the flag on the others. `contact` is null while closed, 'new' to add, or the contact to edit.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, ErrorNote, Input, Sheet, Textarea, useToast } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { PartnerContact, PartnerDetail } from '@/lib/partners';
import { t } from '@/strings';

const s = t.partners.p;
type Draft = Omit<PartnerContact, 'id'> & { id?: string };
const blank = (primary: boolean): Draft => ({ name: '', designation: '', department: '', email: '', phone: '', whatsapp: '', is_primary: primary, notes: '' } as unknown as Draft);

export function ContactSheet({ partner, contact, onClose }: { partner: PartnerDetail; contact: PartnerContact | 'new' | null; onClose: () => void }) {
  return <Sheet open={contact !== null} onClose={onClose} title={contact === 'new' ? s.addContact : s.editContact}>{contact !== null && <ContactForm key={contact === 'new' ? 'new' : contact.id} partner={partner} contact={contact} onClose={onClose} />}</Sheet>;
}

function ContactForm({ partner, contact, onClose }: { partner: PartnerDetail; contact: PartnerContact | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const editing = contact === 'new' ? null : contact;
  const [f, setF] = useState<Draft>(() => editing ? { ...editing, designation: editing.designation ?? '', department: editing.department ?? '', email: editing.email ?? '', phone: editing.phone ?? '', whatsapp: editing.whatsapp ?? '', notes: editing.notes ?? '' } as Draft : blank(partner.contacts.length === 0));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);
  const field = (key: 'name' | 'designation' | 'department' | 'email' | 'phone' | 'whatsapp' | 'notes') => ({ value: (f[key] ?? '') as string, error: errors[`contacts.${indexOfThis()}.${key}`] ?? errors[key], onChange: (e: { target: { value: string } }) => setF((c) => ({ ...c, [key]: e.target.value })) });
  const indexOfThis = () => (editing ? partner.contacts.findIndex((c) => c.id === editing.id) : partner.contacts.length);

  async function save(next: Draft[]) {
    setBusy(true);
    setFatal(null);
    try {
      await api.patch(`/partners/${partner.id}`, { contacts: next });
      void qc.invalidateQueries({ queryKey: ['partner', partner.id] });
      void qc.invalidateQueries({ queryKey: ['partners'] });
      toast(s.c.saved);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fields && Object.keys(e.fields).length) setErrors(e.fields); else setFatal(e);
    } finally { setBusy(false); }
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (!f.name.trim()) { setErrors({ name: 'Enter the contact name.' }); return; }
    const others = partner.contacts.filter((c) => c.id !== editing?.id).map((c) => (f.is_primary ? { ...c, is_primary: false } : c));
    const mine: Draft = { ...f, name: f.name.trim() };
    void save(editing ? partner.contacts.map((c) => (c.id === editing.id ? mine : others.find((o) => o.id === c.id)!)) : [...others, mine]);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Input label={s.c.name} autoFocus {...field('name')} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={s.c.designation} optional {...field('designation')} />
        <Input label={s.c.department} optional {...field('department')} />
        <Input label={s.c.phone} optional type="tel" {...field('phone')} />
        <Input label={s.c.whatsapp} optional type="tel" {...field('whatsapp')} />
      </div>
      <Input label={s.c.email} optional type="email" {...field('email')} />
      <Textarea label={s.c.notes} optional rows={2} {...field('notes')} />
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={f.is_primary} onChange={(e) => setF((c) => ({ ...c, is_primary: e.target.checked }))} className="h-4 w-4 accent-paprika" />{s.c.primary}</label>
      {fatal !== null && <ErrorNote error={fatal} />}
      <div className="flex items-center justify-between gap-2">
        {editing ? <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(`${s.c.remove} ${editing.name}?`)) void save(partner.contacts.filter((c) => c.id !== editing.id)); }}>{s.c.remove}</Button> : <span />}
        <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>{t.partners.f.cancel}</Button><Button type="submit" loading={busy}>{s.c.save}</Button></div>
      </div>
    </form>
  );
}
