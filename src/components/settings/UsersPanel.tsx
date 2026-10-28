/**
 * Settings > Users (admin only, FR-04): view users and edit their name and phone.
 * API: GET /users (key ['users']) and PATCH /users/:id (invalidates ['users']; also refreshes the auth
 * profile via useAuth().refreshMe when editing yourself, so "Prepared by" is current). Role changes are not
 * offered in this screen.
 * Rendered by pages/Settings.tsx. Composes Sheet, Input, Button, ErrorNote, Spinner, EmptyState.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Button, EmptyState, ErrorNote, Input, Sheet, Spinner, useToast } from '@/components/ui';
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  // react-query mutation: PATCH /users/:id. isPending drives the spinner and the double-submit guard.
  const save = useMutation({
    mutationFn: (body: { full_name: string; phone: string }) => api.patch<UserRow>(`/users/${user.id}`, body),
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
    save.mutate({ full_name: name.trim(), phone: phone.trim() }); // everyone is an admin: role is not editable
  };

  // Errors to show in the ErrorNote: only the ones that have no per-field messages (those are shown under
  // the inputs instead).
  const failure = save.error && !(save.error instanceof ApiError && save.error.fields) ? save.error : null;

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-base text-fg-secondary">{user.email ?? s.noEmail}</p>
      <Input label={s.fullName} hint={s.fullNameHint} value={name} onChange={(e) => setName(e.target.value)} error={errors.full_name} autoComplete="off" />
      <Input label={s.userPhone} optional type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} autoComplete="off" />
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

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-cream-100 p-3 text-sm text-fg-secondary">{s.usersNote}</p>
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
                </div>
                <div className="truncate text-sm text-fg-muted">{u.email ?? s.noEmail}</div>
              </div>
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
