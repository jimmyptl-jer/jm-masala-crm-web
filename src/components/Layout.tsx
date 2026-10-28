/**
 * App shell for all private screens: desktop sidebar plus phone top bar and bottom tab bar (SRS section 8).
 * Mounted by router.tsx inside RequireAuth; the page itself renders in the <Outlet />. Reads the user from
 * useAuth() (auth/AuthProvider.tsx). Sign out hides in AUTH_BYPASS mode (lib/config.ts). Settings link is
 * admin-only (FR-04).
 * Makes no API calls and uses no react-query keys.
 */

import clsx from 'clsx';
import { Columns3, FileText, LayoutDashboard, LogOut, MoreHorizontal, Package, PackageCheck, Plus, Settings as SettingsIcon, Users, Workflow } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { AUTH_BYPASS, MOCK_API } from '@/lib/config';
import { t } from '@/strings';

/**
 * NavLink className callback for the desktop sidebar: dark-green highlight for the active route, subtle
 * hover otherwise.
 * @param isActive — supplied by react-router's NavLink.
 */
const link = ({ isActive }: { isActive: boolean }) =>
  clsx('tap flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-white/15 text-white shadow-inner ring-1 ring-white/10' : 'text-slate-200 hover:bg-white/8 hover:text-white');

/**
 * Shell around every signed-in screen: it is the route element in router.tsx and draws the current page
 * through <Outlet />.
 * Desktop (md and up): left sidebar with logo and only two links for now, Quotes and Buyers (the other screens
 * live on the feature-0002 branch and are added back gradually), then the user's name and a Sign out button.
 * Phone: a sticky green top bar (logo; Settings cog for admins; sign-out icon) and a fixed bottom tab bar
 * with Today, Quotes, a raised gold "+" for New quote, Buyers, Marketing, Products. Settings lives in the top bar
 * because the tab bar has no room for it (SRS section 8).
 * Uses useAuth(): me.full_name, isAdmin, signOut. In AUTH_BYPASS mode the Sign out buttons are hidden,
 * because there is no session to end.
 * `end` on the Today and Quotes links stops them looking active on sub-pages (/quotes/new, /quotes/:id). No
 * API calls or query keys here.
 */
export function Layout() {
  const { me, signOut, isAdmin } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar (hidden below md). */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/10 bg-crm-navy p-4 text-slate-100 shadow-xl md:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <img src="/logo.png" alt="" className="h-11 w-11 rounded-xl bg-white/95 object-contain p-1 shadow" />
          <div className="font-sans text-lg font-semibold leading-tight tracking-tight text-white">JM Masala<div className="mt-0.5 text-xs font-normal tracking-wide text-slate-300">CRM</div></div>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          <NavLink to="/" end className={link}><LayoutDashboard className="h-5 w-5" />{t.nav.today}</NavLink>
          <NavLink to="/pipeline" className={link}><Columns3 className="h-5 w-5" />{t.nav.pipeline}</NavLink>
          <NavLink to="/buyers" className={link}><Users className="h-5 w-5" />{t.nav.buyers}</NavLink>
          <NavLink to="/quotes" className={link}><FileText className="h-5 w-5" />{t.nav.quotes}</NavLink>
          <NavLink to="/follow-ups" className={link}><Workflow className="h-5 w-5" />{t.nav.followups}</NavLink>
          <NavLink to="/products" className={link}><Package className="h-5 w-5" />{t.nav.products}</NavLink>
          <NavLink to="/orders" className={link}><PackageCheck className="h-5 w-5" />{t.nav.orders}</NavLink>
          {isAdmin && <NavLink to="/settings" className={link}><SettingsIcon className="h-5 w-5" />{t.nav.settings}</NavLink>}
          {MOCK_API && <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">{AUTH_BYPASS ? 'Demo workspace · sample data' : 'Sample data workspace'}</div>}
        </nav>
        {/* signed-in person and Sign out: only when login is on (nobody is "signed in" while login is switched off) */}
        <div className="flex items-center gap-3 border-t border-white/10 pt-4 text-sm">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 bg-white/10 font-semibold text-white">{(me?.full_name ?? 'JM').slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1"><div className="truncate font-medium text-white">{me?.full_name ?? 'JM Masala'}</div><div className="text-xs text-slate-300">{me?.role === 'admin' ? 'Owner' : 'Sales'}</div></div>
          {!AUTH_BYPASS && <button onClick={() => void signOut()} aria-label={t.nav.signOut} className="tap grid place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
        Phone top bar (hidden from md up): logo, then Settings (admin) and Sign out (not in bypass
        mode).
        */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-crm-navy px-4 py-2 text-white shadow-lg backdrop-blur-xl md:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-lg bg-white/95 object-contain p-1" />
            <span className="font-serif text-lg font-semibold">JM Masala</span>
            {MOCK_API && <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-200">Sample data</span>}
          </div>
          <div className="flex items-center">
            {!AUTH_BYPASS && <button onClick={() => void signOut()} aria-label={t.nav.signOut} className="tap grid place-items-center rounded-lg hover:bg-forest-800"><LogOut className="h-5 w-5" /></button>}
          </div>
        </header>

        {/*
        The screen content. `has-tabbar` (index.css) adds bottom padding so the phone tab bar never
        covers the end of a page.
        */}
        <main className="has-tabbar mx-auto w-full max-w-7xl flex-1 px-4 py-4 md:px-8 md:py-6"><Outlet /></main>

        {/*
        Phone bottom tab bar (hidden from md up): equal columns around the raised gold New quote button.
        */}
        <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-white/70 bg-white/80 shadow-[0_-8px_32px_rgba(28,47,78,0.08)] backdrop-blur-xl md:hidden">
          {moreOpen && <div className="glass-panel-strong absolute bottom-[calc(100%+0.75rem)] right-3 min-w-52 p-2 shadow-xl">
            <MobileMoreLink to="/quotes" icon={<FileText className="h-4 w-4" />} label={t.nav.quotes} onClick={() => setMoreOpen(false)} />
            <MobileMoreLink to="/follow-ups" icon={<Workflow className="h-4 w-4" />} label={t.nav.followups} onClick={() => setMoreOpen(false)} />
            <MobileMoreLink to="/products" icon={<Package className="h-4 w-4" />} label={t.nav.products} onClick={() => setMoreOpen(false)} />
            <MobileMoreLink to="/orders" icon={<PackageCheck className="h-4 w-4" />} label={t.nav.orders} onClick={() => setMoreOpen(false)} />
            {isAdmin && <MobileMoreLink to="/settings" icon={<SettingsIcon className="h-4 w-4" />} label={t.nav.settings} onClick={() => setMoreOpen(false)} />}
          </div>}
          <Tab to="/" end icon={<LayoutDashboard className="h-5 w-5" />} label={t.nav.today} />
          <Tab to="/pipeline" icon={<Columns3 className="h-5 w-5" />} label={t.nav.pipeline} />
          <Tab to="/quotes/new" icon={<Plus className="h-5 w-5" />} label={t.nav.newQuote} />
          <Tab to="/buyers" icon={<Users className="h-5 w-5" />} label={t.nav.buyers} />
          <button type="button" aria-expanded={moreOpen} aria-label="More navigation" onClick={() => setMoreOpen((open) => !open)} className={clsx('tap flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium', moreOpen ? 'text-crm-blue' : 'text-ink/55')}><MoreHorizontal className="h-5 w-5" />More</button>
        </nav>
      </div>
    </div>
  );
}

/**
 * One item in the phone bottom tab bar: icon above a small label, highlighted when its route is active.
 * @param props.to — route path. @param props.end — match the path exactly (used for / and /quotes).
 * @param props.icon — icon element. @param props.label — text under the icon.
 */
function Tab({ to, end, icon, label }: { to: string; end?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => clsx('tap flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium', isActive ? 'text-forest-900' : 'text-ink/55')}>
      {icon}{label}
    </NavLink>
  );
}

function MobileMoreLink({ to, icon, label, onClick }: { to: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <NavLink to={to} onClick={onClick} className={({ isActive }) => clsx('tap flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium', isActive ? 'bg-blue-50 text-crm-blue' : 'text-slate-700 hover:bg-slate-50')}>{icon}{label}</NavLink>;
}
