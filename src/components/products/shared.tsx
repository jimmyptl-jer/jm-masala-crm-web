/**
 * Small pieces shared by the Products list (pages/Products.tsx) and the product page (pages/ProductDetail.tsx):
 * grouping product rows by name, the photo, a stat tile and a label/value line. Pure presentation, no API calls.
 */
import clsx from 'clsx';
import { Package } from 'lucide-react';
import type { ReactNode } from 'react';
import { money } from '@/lib/format';
import type { Product } from '@/lib/types';
import { t } from '@/strings';

const s = t.products;

/** One product name with all of its grade rows. */
export interface Group { name: string; rows: Product[]; image: string | null; packing: string[]; updated: string; archived: boolean }

/** Groups the flat product rows by name (the API sorts by name, then grade). */
export function group(rows: Product[]): Group[] {
  const map = new Map<string, Product[]>();
  for (const p of rows) map.set(p.name, [...(map.get(p.name) ?? []), p]);
  return [...map.entries()].map(([name, list]) => ({
    name, rows: list,
    image: list.find((p) => p.image_url)?.image_url ?? null,
    packing: [...new Set(list.flatMap((p) => p.packing_options))],
    updated: list.map((p) => p.updated_at).filter(Boolean).sort().at(-1) ?? '',
    archived: list.every((p) => p.archived),
  }));
}

/** Product photo (the signed packaging image link) or a placeholder icon. */
export function Thumb({ src, name, className }: { src: string | null; name: string; className?: string }) {
  return src
    ? <img src={src} alt={s.imageAlt(name)} loading="lazy" className={clsx('object-cover', className)} />
    : <div className={clsx('grid place-items-center bg-forest-50 text-forest-900/30', className)} aria-hidden><Package className="h-8 w-8" /></div>;
}

/** One of the four numbers at the top. */
export function Stat({ icon, label, value, sub, tint }: { icon: ReactNode; label: string; value: string | number; sub: string; tint: string }) {
  return (
    <div className="glass-panel flex min-h-[96px] items-center gap-3 p-4">
      <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl [&>svg]:h-5 [&>svg]:w-5', tint)}>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-600">{label}</div>
        <div className="mt-0.5 text-2xl font-bold leading-none tracking-tight text-crm-ink tabular-nums">{value}</div>
        <div className="mt-1 truncate text-xs text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

export const Fact = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="grid grid-cols-[8rem_1fr] gap-3 py-1.5 text-sm"><dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-words font-medium text-slate-800">{value || s.notProvided}</dd></div>
);

export const refLine = (p: Product) => [p.ref_rate_usd && `${s.refUsd} ${money(p.ref_rate_usd, 'USD')}`, p.ref_rate_inr && `${s.refInr} ${money(p.ref_rate_inr, 'INR')}`].filter(Boolean).join(' · ');
export const uniq = (list: (string | null)[]) => [...new Set(list.filter((x): x is string => !!x))];

