/**
 * App shell for all private screens (design system v2, DESIGN_SYSTEM.md): a white sidebar, a 56 px top bar and, on phones,
 * a bottom bar. Mounted by router.tsx inside RequireAuth; the page renders in the <Outlet />.
 *
 *  - Desktop sidebar: 240 px expanded, 64 px icon rail. It collapses automatically under 1280 px and by the collapse button;
 *    the choice is remembered in localStorage ('jm.nav'). Groups: (Dashboard, Pipeline, Buyers), Sales (Quotations with the
 *    number of drafts, Follow-ups with the number due as a red badge), Operations (Products, Orders); Settings (admin
 *    only) and the signed-in person at the bottom; a Search button (Ctrl/Cmd + K opens CommandPalette).
 *  - Top bar (md and up): breadcrumb, the bell (dot when follow-ups are due) and a "+ New" menu (New quotation, Add buyer).
 *  - Phone: header with the logo and sign-out, and a bottom bar: Home, Pipeline, a round paprika "+" (opens a Create sheet),
 *    Quotations, More (the full menu).
 * API: GET /buyers/summary (follow-ups due, key ['buyers','summary']) and GET /quotes?status=draft&limit=1 (draft count, key
 * ['quotes','nav-drafts']) for the badges. Proforma invoices, samples, shipments and payments from the design are not in
 * the app yet, so they are not in the menu. Sign out is hidden in AUTH_BYPASS mode (lib/config.ts); Settings is admin-only (FR-04).
 */
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Bell, Columns3, FileSpreadsheet, FileText, FlaskConical, LayoutDashboard, LogOut, MoreHorizontal, Package, PackageCheck, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings as SettingsIcon, Ship, Users, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState, type ElementType, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { CommandPalette } from '@/components/CommandPalette';
import { useMediaQuery } from '@/components/quote/shared';
import { Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { AUTH_BYPASS, MOCK_API } from '@/lib/config';
import { useBuyerSummary } from '@/lib/hooks';
import type { QuoteList } from '@/lib/types';
import { t } from '@/strings';

const n = t.nav;

/** One menu entry. `count` shows a badge (red when `alert`); `end` matches the path exactly. */
interface Item { to: string; label: string; icon: ElementType; end?: boolean; count?: number; alert?: boolean; /** Screen not built yet: shown greyed out, no link. */ soon?: boolean }

/** Breadcrumb label of the first path segment. */
const SECTION: Record<string, string> = {
  '': n.today, pipeline: n.pipeline, buyers: n.buyers, quotes: n.quotes, quotations: n.quotes, 'follow-ups': n.followups,
  products: n.products, orders: n.orders, settings: n.settings,
};

/** Shell around every signed-in screen. Local state: sidebar preference, palette, the "+ New" and More menus, the Create sheet. */
export function Layout() {
  const { me, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const wide = useMediaQuery('(min-width: 1280px)');
  const [pref, setPref] = useState<'collapsed' | 'expanded' | null>(() => {
    try { const v = localStorage.getItem('jm.nav'); return v === 'collapsed' || v === 'expanded' ? v : null; } catch { return null; }
  });
  const collapsed = pref ? pref === 'collapsed' : !wide;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const due = useBuyerSummary().data?.totals.followups_due ?? 0;
  const drafts = useQuery({ queryKey: ['quotes', 'nav-drafts'], queryFn: () => api.get<QuoteList>('/quotes?status=draft&limit=1').then((r) => r.total), staleTime: 60_000 }).data ?? 0;

  const toggle = () => {
    const next = collapsed ? 'expanded' : 'collapsed';
    setPref(next);
    try { localStorage.setItem('jm.nav', next); } catch { /* the choice just is not remembered */ }
  };

  // Ctrl/Cmd + K opens the search palette from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // menus close when the page changes
  useEffect(() => { setNewOpen(false); setMoreOpen(false); }, [pathname]);

  const groups: { label?: string; items: Item[] }[] = [
    { items: [
      { to: '/', label: n.today, icon: LayoutDashboard, end: true },
      { to: '/pipeline', label: n.pipeline, icon: Columns3 },
      { to: '/buyers', label: n.buyers, icon: Users },
    ] },
    { label: n.groupSales, items: [
      { to: '/quotes', label: n.quotes, icon: FileText, count: drafts || undefined },
      { to: '/proforma', label: n.proforma, icon: FileSpreadsheet, soon: true },
      { to: '/samples', label: n.samples, icon: FlaskConical, soon: true },
      { to: '/follow-ups', label: n.followups, icon: Workflow, count: due || undefined, alert: true },
    ] },
    { label: n.groupOperations, items: [
      { to: '/shipments', label: n.shipments, icon: Ship, soon: true },
      { to: '/payments', label: n.payments, icon: Banknote, soon: true },
      { to: '/products', label: n.products, icon: Package },
      { to: '/orders', label: n.orders, icon: PackageCheck },
    ] },
  ];
  /** Entries that lead somewhere (the greyed "soon" ones are left out of search and the phone menu). */
  const live = groups.flatMap((g) => g.items).filter((i) => !i.soon);
  const pages = useMemo(() => [...live.map((i) => ({ label: i.label, to: i.to })), ...(isAdmin ? [{ label: n.settings, to: '/settings' }] : [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin]);

  // breadcrumb: Home > section [> New / Edit / Details]
  const segs = pathname.split('/').filter(Boolean);
  const crumbs = [SECTION[segs[0] ?? ''] ?? segs[0] ?? n.today, ...(segs.length > 1 ? [segs[1] === 'new' ? n.pageNew : segs[segs.length - 1] === 'edit' ? n.pageEdit : n.pageDetails] : [])];
  const initials = (me?.full_name ?? 'JM').slice(0, 2).toUpperCase();
  const role = me?.role === 'admin' ? n.roleOwner : n.roleSales;

  /** Sidebar entry: 36 px, paprika-50 + paprika text + 3 px bar when active; icon only in the rail. */
  const entry = (i: Item) => i.soon ? (
    <div key={i.to} aria-disabled="true" title={collapsed ? `${i.label} (${n.soon})` : n.soonHint}
      className={clsx('flex h-9 cursor-not-allowed items-center gap-2.5 rounded-md text-sm text-ink-placeholder', collapsed ? 'justify-center px-0' : 'px-3')}>
      <i.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      {!collapsed && <span className="flex-1 truncate">{i.label}</span>}
      {!collapsed && <span className="rounded-full bg-surface-muted px-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">{n.soon}</span>}
    </div>
  ) : (
    <NavLink key={i.to} to={i.to} end={i.end} title={collapsed ? i.label : undefined}
      className={({ isActive }) => clsx(
        'relative flex h-9 items-center gap-2.5 rounded-md text-sm transition-colors', collapsed ? 'justify-center px-0' : 'px-3',
        isActive ? 'bg-paprika-50 font-bold text-paprika-700 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-paprika [&>svg]:text-paprika'
          : 'text-ink-secondary hover:bg-surface-hover hover:text-ink [&>svg]:text-ink-muted',
      )}>
      <i.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
      {!collapsed && <span className="flex-1 truncate">{i.label}</span>}
      {i.count != null && !collapsed && (
        <span className={clsx('rounded-full px-1.5 text-[11px] font-bold', i.alert ? 'bg-danger-bg text-danger-ink' : 'bg-surface-muted text-ink-secondary')}>{i.count}</span>
      )}
      {i.count != null && collapsed && i.alert && <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-danger" aria-hidden />}
    </NavLink>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar (hidden below md) */}
      <aside className={clsx('sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface transition-[width] md:flex', collapsed ? 'w-16' : 'w-60')}>
        <div className={clsx('flex h-14 items-center gap-2', collapsed ? 'justify-center' : 'px-4')}>
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-paprika font-display text-sm font-bold text-white" aria-hidden>JM</div>
          {!collapsed && <span className="flex-1 font-display text-xl font-bold text-ink">JM Masala</span>}
          {!collapsed && <button type="button" onClick={toggle} aria-label={n.collapse} title={n.collapse} className="tap grid place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"><PanelLeftClose className="h-4 w-4" strokeWidth={1.75} /></button>}
        </div>

        {collapsed ? (
          <button type="button" onClick={() => setPaletteOpen(true)} aria-label={n.search} title={`${n.search} (${n.searchKey})`} className="tap mx-auto mb-2 grid h-8 w-10 place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"><Search className="h-4 w-4" strokeWidth={1.75} /></button>
        ) : (
          <button type="button" onClick={() => setPaletteOpen(true)} className="mx-3 mb-2 flex h-8 items-center gap-2 rounded-md border border-line px-2 text-sm text-ink-muted hover:border-line-strong">
            <Search className="h-4 w-4" aria-hidden /><span className="flex-1 text-left">{n.search}</span><kbd className="rounded border border-line px-1 text-[10px]">{n.searchKey}</kbd>
          </button>
        )}

        <nav className="flex-1 overflow-y-auto px-2" aria-label={n.mainNav}>
          {groups.map((g, gi) => (
            <div key={gi} className={gi ? 'mt-4' : ''}>
              {g.label && !collapsed && <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted">{g.label}</p>}
              {g.items.map(entry)}
            </div>
          ))}
          {MOCK_API && !collapsed && <div className="mt-4 rounded-md border border-line bg-surface-muted px-3 py-2 text-xs text-ink-muted">{AUTH_BYPASS ? 'Demo workspace · sample data' : 'Sample data workspace'}</div>}
        </nav>

        <div className="border-t border-line p-2">
          {isAdmin && entry({ to: '/settings', label: n.settings, icon: SettingsIcon })}
          {collapsed && <button type="button" onClick={toggle} aria-label={n.expand} title={n.expand} className="tap mt-1 grid h-9 w-full place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"><PanelLeftOpen className="h-4 w-4" strokeWidth={1.75} /></button>}
          <div className={clsx('mt-1 flex items-center gap-2 rounded-md py-1.5', collapsed ? 'justify-center' : 'px-2')}>
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paprika-100 text-[11px] font-bold text-paprika-700" title={collapsed ? (me?.full_name ?? 'JM Masala') : undefined}>{initials}</div>
            {!collapsed && <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-sm font-bold text-ink">{me?.full_name ?? 'JM Masala'}</p><p className="text-xs text-ink-muted">{role}</p></div>}
            {!collapsed && !AUTH_BYPASS && <button onClick={() => void signOut()} aria-label={n.signOut} className="tap grid place-items-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"><LogOut className="h-4 w-4" /></button>}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop top bar: breadcrumb, bell, "+ New" */}
        <div className="sticky top-0 z-30 hidden h-14 items-center gap-3 border-b border-line bg-surface px-6 md:flex">
          <nav aria-label={n.breadcrumb} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <Link to="/" className="text-ink-muted hover:text-ink">{n.home}</Link>
            {crumbs.map((c, i) => (
              <span key={`${c}-${i}`} className="flex items-center gap-2">
                <span className="text-ink-placeholder" aria-hidden>/</span>
                <span className={clsx('truncate', i === crumbs.length - 1 ? 'font-bold text-ink' : 'text-ink-muted')} aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c}</span>
              </span>
            ))}
          </nav>
          <Link to="/follow-ups" aria-label={due ? n.followupsDue(due) : n.followups} className="tap relative grid place-items-center rounded-md text-ink-secondary hover:bg-surface-hover">
            <Bell className="h-4 w-4" strokeWidth={1.75} />{due > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-paprika ring-2 ring-surface" />}
          </Link>
          <div className="relative">
            <button type="button" aria-haspopup="menu" aria-expanded={newOpen} onClick={() => setNewOpen((v) => !v)} className="tap h-9 rounded-md bg-paprika px-4 text-sm font-bold text-white hover:bg-paprika-700 active:bg-paprika-800">{n.newMenu}</button>
            {newOpen && (
              <>
                <button type="button" aria-label={n.close} className="fixed inset-0 z-10 cursor-default" onClick={() => setNewOpen(false)} />
                <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-line bg-surface p-1 shadow-pop">
                  <button type="button" role="menuitem" onClick={() => navigate('/quotes/new')} className="flex w-full rounded-md px-3 py-2 text-left text-sm text-ink-secondary hover:bg-surface-hover hover:text-ink">{n.newQuotation}</button>
                  <button type="button" role="menuitem" onClick={() => navigate('/buyers?new=1')} className="flex w-full rounded-md px-3 py-2 text-left text-sm text-ink-secondary hover:bg-surface-hover hover:text-ink">{n.addBuyer}</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Phone header (hidden from md up) */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface px-4 text-ink md:hidden">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-paprika font-display text-sm font-bold text-white" aria-hidden>JM</div>
            <span className="font-display text-xl font-bold">JM Masala</span>
            {MOCK_API && <span className="rounded-full border border-line bg-surface-muted px-2 py-0.5 text-[10px] font-bold text-ink-muted">Sample data</span>}
          </div>
          <div className="flex items-center">
            <button type="button" onClick={() => setPaletteOpen(true)} aria-label={n.search} className="tap grid place-items-center rounded-md text-ink-muted hover:bg-surface-hover"><Search className="h-5 w-5" /></button>
            {!AUTH_BYPASS && <button onClick={() => void signOut()} aria-label={n.signOut} className="tap grid place-items-center rounded-md text-ink-muted hover:bg-surface-hover"><LogOut className="h-5 w-5" /></button>}
          </div>
        </header>

        <main className="has-tabbar mx-auto w-full max-w-[1440px] flex-1 px-4 py-4 md:px-6 md:py-6"><Outlet /></main>

        {/* Phone bottom bar: Home, Pipeline, round "+", Quotations, More */}
        <nav aria-label={n.mainNav} className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-line bg-surface md:hidden">
          {moreOpen && (
            <div className="glass-panel-strong absolute bottom-[calc(100%+0.75rem)] right-3 min-w-52 p-2 shadow-pop">
              {[...live, ...(isAdmin ? [{ to: '/settings', label: n.settings, icon: SettingsIcon } as Item] : [])].map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setMoreOpen(false)}
                  className={({ isActive }) => clsx('tap flex items-center gap-3 rounded-md px-3 py-2 text-sm', isActive ? 'bg-paprika-50 font-bold text-paprika-700' : 'text-ink-secondary hover:bg-surface-hover')}>
                  <i.icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />{i.label}
                </NavLink>
              ))}
            </div>
          )}
          <Tab to="/" end icon={<LayoutDashboard className="h-5 w-5" strokeWidth={1.75} />} label={n.home} />
          <Tab to="/pipeline" icon={<Columns3 className="h-5 w-5" strokeWidth={1.75} />} label={n.pipeline.replace('Buyer ', '')} />
          <div className="grid place-items-center pb-2">
            <button type="button" onClick={() => setCreateOpen(true)} aria-label={n.create} className="-mt-5 grid h-12 w-12 place-items-center rounded-full bg-paprika text-white shadow-pop hover:bg-paprika-700"><Plus className="h-6 w-6" /></button>
          </div>
          <Tab to="/quotes" icon={<FileText className="h-5 w-5" strokeWidth={1.75} />} label={n.quotes} />
          <button type="button" aria-expanded={moreOpen} aria-label={n.moreNav} onClick={() => setMoreOpen((o) => !o)} className={clsx('tap flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-bold', moreOpen ? 'text-paprika' : 'text-ink-muted')}><MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />{n.more}</button>
        </nav>
      </div>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title={n.create}>
        <div className="space-y-2">
          <Link to="/quotes/new" onClick={() => setCreateOpen(false)} className="tap flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-sm font-bold text-ink hover:bg-surface-hover"><FileText className="h-4 w-4 text-ink-muted" aria-hidden />{n.newQuotation}</Link>
          <Link to="/buyers?new=1" onClick={() => setCreateOpen(false)} className="tap flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-sm font-bold text-ink hover:bg-surface-hover"><Users className="h-4 w-4 text-ink-muted" aria-hidden />{n.addBuyer}</Link>
        </div>
      </Sheet>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={pages} />
    </div>
  );
}

/**
 * One item of the phone bottom bar: icon above a small label, paprika when its route is active.
 * @param props.to — route path. @param props.end — match the path exactly. @param props.icon — icon element. @param props.label — text under the icon.
 */
function Tab({ to, end, icon, label }: { to: string; end?: boolean; icon: ReactNode; label: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => clsx('tap flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-bold', isActive ? 'text-paprika' : 'text-ink-muted')}>
      {icon}{label}
    </NavLink>
  );
}
