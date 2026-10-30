/**
 * Settings > Users (admin only, FR-04): see everyone, approve people who signed up (they have no access until approved), and edit a
 * user's name, phone, role and access (active / deactivated).
 * API: GET /users (key ['users']) and PATCH /users/:id (invalidates ['users']; also refreshes the auth
 * profile via useAuth().refreshMe when editing yourself, so "Prepared by" is current). The API refuses to remove the last active admin.
 * Rendered by pages/Settings.tsx. Composes Sheet, Input, Button, ErrorNote, Spinner, EmptyState.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Button, EmptyState, ErrorNote, Input, Select, Sheet, Spinner, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import type { Role, UserRow } from '@/lib/types';
import { t } from '@/strings';

const s = t.settings;
/** Display word for a role: Admin or Sales. @param r — 'admin' | 'sales'. */
const roleLabel = (r: Role) => (r === 'admin' ? s.roleAdmin : s.roleSales);

/**
 * Form (shown in a Sheet) to edit one user's full name and phone. The name prints on quotes as "Prepared
 * by".
 * @param props.user — the row being edited (from GET /users). @param props.onClose — closes the sheet
 *   (Cancel, or after a successful save).
 * Save: name required (checked in the browser) -> PATCH /users/:id with { full_name, phone } (role is not
 * changed here) -> invalidate ['users'] -> if it is the signed-in user, refreshMe() so the new name shows
 * -> "User saved" toast -> close. The Save button is disabled while saving and submit() also ignores a
 * second call.
 * API errors: ApiError.fields (full_name, phone) show under the inputs; any other error appears in an
 * ErrorNote.
 * Local state: name, phone (text), errors (field messages).
 */
function UserEditor({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me, refreshMe } = useAuth();
  const [name, setName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // react-query mutation: PATCH /users/:id. isPending drives the spinner and the double-submit guard.
  const save = useMutation({
    mutationFn: (body: { full_name: string; phone: string; role: Role; active: boolean }) => api.patch<UserRow>(`/users/${user.id}`, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['users'] });
      if (me?.id === user.id) await refreshMe();
      toast(s.userSaved);
      onClose();
    },
    onError: (e) => { if (e instanceof ApiError && e.fields) setErrors(e.fields); },
  });

  /**
   * Form submit: stop if already saving, check the name, then run the mutation. @param ev — submit event.
   */
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (save.isPending) return;
    if (!name.trim()) { setErrors({ full_name: s.nameMissing }); return; }
    setErrors({});
    save.mutate({ full_name: name.trim(), phone: phone.trim(), role, active });
  };

  // Errors to show in the ErrorNote: only the ones that have no per-field messages (those are shown under
  // the inputs instead).
  const failure = save.error && !(save.error instanceof ApiError && save.error.fields) ? save.error : null;

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-base text-fg-secondary">{user.email ?? s.noEmail}</p>
      <Input label={s.fullName} hint={s.fullNameHint} value={name} onChange={(e) => setName(e.target.value)} error={errors.full_name} autoComplete="off" />
      <Input label={s.userPhone} optional type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} autoComplete="off" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={s.roleLabel} value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="sales">{s.roleSales}</option><option value="admin">{s.roleAdmin}</option></Select>
        <Select label={s.accessLabel} value={active ? 'on' : 'off'} onChange={(e) => setActive(e.target.value === 'on')}><option value="on">{s.accessActive}</option><option value="off">{s.accessOff}</option></Select>
      </div>
      {failure && <ErrorNote error={failure} />}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={save.isPending}>{t.common.cancel}</Button>
        <Button type="submit" className="flex-1" loading={save.isPending}>{save.isPending ? t.common.saving : t.common.save}</Button>
      </div>
    </form>
  );
}

/**
 * "Users" section of Settings (admin): lists everyone with name, role badge and email, each with an Edit
 * button that opens UserEditor in a Sheet. New users are created in the Supabase dashboard, not here (the
 * note at the top says so).
 * Data: GET /users (admin only), react-query key ['users']. Shows a spinner while loading, an ErrorNote
 * with Retry on failure and an empty-state if there are no users.
 * Local state: editing = the user being edited (null = sheet closed). The editor has key={user.id} so it
 * starts fresh for each user.
 */
export function UsersPanel() {
  // Loads the user list: GET /users -> { data: UserRow[] }, unwrapped.
  const query = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ data: UserRow[] }>('/users').then((r) => r.data) });
  // The user whose editor sheet is open, or null.
  const [editing, setEditing] = useState<UserRow | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  // one click approval of a pending person: PATCH /users/:id { active: true }
  const approve = useMutation({
    mutationFn: (id: string) => api.patch<UserRow>(`/users/${id}`, { active: true }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['users'] }); toast(s.approved); },
  });

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-cream-100 p-3 text-sm text-fg-secondary">{s.usersNote}</p>
      {approve.isError && <ErrorNote error={approve.error} />}
      {query.isPending ? <Spinner /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : query.data.length === 0 ? (
        <EmptyState title={s.usersEmpty} />
      ) : (
        <ul className="divide-y divide-cream-200">
          {query.data.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words text-base font-semibold text-forest-900">{u.full_name}</span>
                  <span className={clsx('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', u.role === 'admin' ? 'bg-gold-100 text-wood-800' : 'bg-forest-100 text-forest-900')}>{roleLabel(u.role)}</span>
                  {u.status === 'pending' && <span className="inline-block rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-ink">{s.statusPending}</span>}
                  {u.status === 'inactive' && <span className="inline-block rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-semibold text-danger-ink">{s.statusInactive}</span>}
                </div>
                <div className="truncate text-sm text-fg-muted">{u.email ?? s.noEmail}</div>
              </div>
              {u.status === 'pending' && <Button aria-label={s.approveAria(u.full_name)} loading={approve.isPending && approve.variables === u.id} onClick={() => approve.mutate(u.id)}>{s.approve}</Button>}
              <Button variant="secondary" aria-label={s.editAria(u.full_name)} onClick={() => setEditing(u)}><Pencil className="h-4 w-4" aria-hidden />{t.common.edit}</Button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={s.editUser}>
        {editing && <UserEditor key={editing.id} user={editing} onClose={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}
