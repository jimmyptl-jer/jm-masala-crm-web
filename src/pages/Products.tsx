/**
 * Products screen (route /products): the product catalogue with packaging-image thumbnails, search, a "show
 * archived" toggle and, for admins only, an add / edit sheet.
 * API: GET /products via useProducts (react-query key ['products', { q, archived }]). Creating, editing,
 * archiving and the packaging image are done by ProductForm (POST/PATCH /products, POST/DELETE
 * /products/:id/image), which invalidates ['products'] so this list refreshes.
 * Everyone signed in can read the list; only admins see the Add and Edit buttons (the API also enforces
 * this with a 403). Products are archived, never deleted (BR-12).
 * Composes PageHeader, Input, Sheet, ProductForm, Card, EmptyState, Spinner, ErrorNote and Button from
 * ui.tsx. Reads the signed-in role from useAuth (auth/AuthProvider.tsx). Mounted by router.tsx.
 */

import { Package, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { ProductForm } from '@/components/products/ProductForm';
import { Button, Card, EmptyState, ErrorNote, Input, PageHeader, Sheet, Spinner } from '@/components/ui';
import { qty, money } from '@/lib/format';
import { useDebounced, useProducts } from '@/lib/hooks';
import type { Product } from '@/lib/types';
import { t } from '@/strings';

// Shorthand for the products strings.
const s = t.products;

/**
 * Products screen (route /products).
 * The user sees: title with an "Add product" button (admins only; others see a read-only note instead), a
 * search box, a "show archived" checkbox and a list of product cards. Each card shows the packaging image
 * thumbnail (or a dashed placeholder icon when there is none; tapping a thumbnail opens the full image in a
 * new tab), name, grade, an Archived badge, a two-line specification, one line of unit / GST % / HS / HSN
 * codes, one line of indicative USD / INR reference rates, and an Edit button (admins only).
 * Data: useProducts({ q, archived }) -> GET /products, react-query key ['products', opts]. The search text
 * is debounced 300 ms so typing does not send a request per key. "Show archived" requests archived=all
 * (active AND archived together); unchecked requests only active products. The API sorts by name, then
 * grade, and returns at most 1000 rows. Each row's image_url is a signed link that expires after about an
 * hour, so a very old tab may show a broken thumbnail until the list refetches.
 * Add / Edit: opens a Sheet with ProductForm (admins only; the sheet is not rendered for others). The form
 * closes the sheet on save, cancel, archive or restore, and has already invalidated ['products'].
 * Empty states: no products at all (with a hint that differs for admin and sales) vs no match for the
 * current search / archived toggle. Loading -> Spinner; error -> ErrorNote with Retry.
 * Local state: q (search text), showArchived, editing (which product, or 'new', is open in the sheet).
 */
export default function Products() {
  // Admin flag from the signed-in profile; decides whether add / edit controls are shown.
  const { isAdmin } = useAuth();
  // Search box text (immediate).
  const [q, setQ] = useState('');
  // Whether archived products are included.
  const [showArchived, setShowArchived] = useState(false);
  // What the sheet is editing: a product, 'new' for the create form, or null when the sheet is closed.
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  // Search text after trimming and a 300 ms pause; this is what is sent to the API.
  const dq = useDebounced(q.trim(), 300);

  // GET /products with the current filters; an empty search is turned into 'not sent' by qs().
  const query = useProducts({ q: dq || undefined, archived: showArchived ? 'all' : 'false' });
  // Products to show (empty array while loading).
  const rows = query.data ?? [];
  /** Closes the add / edit sheet. Used for the sheet's close button, the form's Cancel and after a save. */
  const close = () => setEditing(null);

  return (
    <div>
      <PageHeader
        title={s.title}
        subtitle={isAdmin ? undefined : s.readOnlyNote}
        actions={isAdmin ? <Button onClick={() => setEditing('new')}><Plus className="h-5 w-5" aria-hidden />{s.add}</Button> : undefined}
      />

      <div className="space-y-3">
        <Input label={s.searchLabel} type="search" inputMode="search" placeholder={s.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <label className="tap flex items-center gap-3 text-base text-forest-900">
          <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {s.showArchived}
        </label>
      </div>

      <div className="mt-4">
        {query.isPending ? <Spinner /> : query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : rows.length === 0 ? (
          <Card>
            <EmptyState title={dq || showArchived ? s.noMatch : s.empty}>{!dq && !showArchived && (isAdmin ? s.emptyAdmin : s.emptySales)}</EmptyState>
          </Card>
        ) : (
          <ul className="grid gap-2 xl:grid-cols-2">
            {rows.map((p) => (
              <li key={p.id} className="card flex items-start gap-3 px-3 py-2.5">
                {/* Thumbnail: the signed image link when there is one, otherwise a placeholder icon. */}
                {p.image_url ? (
                  <a href={p.image_url} target="_blank" rel="noreferrer" aria-label={s.imageOpen(p.name)} className="shrink-0">
                    <img src={p.image_url} alt={s.imageAlt(p.name)} loading="lazy" className="h-16 w-24 rounded-lg border border-cream-200 bg-cream-50 object-cover" />
                  </a>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-cream-200 bg-cream-50" aria-hidden>
                    <Package className="h-5 w-5 text-ink/30" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words text-lg font-semibold text-forest-900">{p.name}</span>
                    {p.grade && <span className="text-base text-ink/70">{p.grade}</span>}
                    {p.archived && <span className="inline-block rounded-full bg-zinc-300 px-2.5 py-0.5 text-xs font-semibold text-zinc-800">{s.archivedBadge}</span>}
                  </div>
                  {p.specification && <p className="mt-0.5 line-clamp-2 break-words text-sm text-ink/70">{p.specification}</p>}
                  <p className="mt-1 text-sm text-ink/80">
                    {[
                      s.perUnit(t.common.unit[p.unit]),
                      `${s.gst} ${qty(p.gst_rate)}%`,
                      p.hs_code && `${s.hs} ${p.hs_code}`,
                      p.hsn_code && `${s.hsn} ${p.hsn_code}`,
                    ].filter(Boolean).join(' · ')}
                  </p>
                  {(p.ref_rate_usd || p.ref_rate_inr) && (
                    <p className="mt-0.5 text-sm tabular-nums text-ink/80">
                      {[p.ref_rate_usd && `${s.refUsd} ${money(p.ref_rate_usd, 'USD')}`, p.ref_rate_inr && `${s.refInr} ${money(p.ref_rate_inr, 'INR')}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {/* Edit opens the sheet with this product loaded; admins only. */}
                {isAdmin && (
                  <Button variant="secondary" aria-label={s.editAria(p.name)} onClick={() => setEditing(p)}>
                    <Pencil className="h-4 w-4" aria-hidden />{s.edit}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add / edit sheet. The form is keyed by product id so switching product starts from fresh state. */}
      {isAdmin && (
        <Sheet wide open={editing !== null} onClose={close} title={editing === 'new' ? s.newTitle : s.editTitle}>
          {editing !== null && <ProductForm key={editing === 'new' ? 'new' : editing.id} initial={editing === 'new' ? undefined : editing} onCancel={close} onSaved={close} />}
        </Sheet>
      )}
    </div>
  );
}
