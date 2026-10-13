/**
 * App shell for all private screens: desktop sidebar plus phone top bar and bottom tab bar (SRS section 8).
 * Mounted by router.tsx inside RequireAuth; the page itself renders in the <Outlet />. Reads the user from
 * useAuth() (auth/AuthProvider.tsx). Sign out hides in AUTH_BYPASS mode (lib/config.ts). Settings link is
 * admin-only (FR-04).
 * Makes no API calls and uses no react-query keys.
 */

import clsx from 'clsx';
import { Globe, LayoutDashboard, FileText, LogOut, Megaphone, Plus, Settings as Cog, Users, Package } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { AUTH_BYPASS } from '@/lib/config';
import { t } from '@/strings';

/**
 * NavLink className callback for the desktop sidebar: dark-green highlight for the active route, subtle
 * hover otherwise.
 * @param isActive — supplied by react-router's NavLink.
 */
const link = ({ isActive }: { isActive: boolean }) =>
  clsx('tap flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium', isActive ? 'bg-forest-800 text-white' : 'text-forest-100 hover:bg-forest-800/60');

/**
 * Shell around every signed-in screen: it is the route element in router.tsx and draws the current page
 * through <Outlet />.
 * Desktop (md and up): left sidebar with logo, links Today, Quotes, New quote, Buyers, Marketing, Products and (admins
 * only, FR-04) Settings, then the user's name and a Sign out button.
 * Phone: a sticky green top bar (logo; Settings cog for admins; sign-out icon) and a fixed bottom tab bar
 * with Today, Quotes, a raised gold "+" for New quote, Buyers, Marketing, Products. Settings lives in the top bar
 * because the tab bar has no room for it (SRS section 8).
 * Uses useAuth(): me.full_name, isAdmin, signOut. In AUTH_BYPASS mode the Sign out buttons are hidden,
 * because there is no session to end.
 * `end` on the Today and Quotes links stops them looking active on sub-pages (/quotes/new, /quotes/:id). No
 * API calls or query keys here.
 */
export function Layout() {
  const { me, isAdmin, signOut } = useAuth();

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar (hidden below md). */}
      <aside className="hidden w-60 shrink-0 flex-col bg-forest-900 p-4 text-forest-100 md:flex">
        <div className="mb-6 flex items-center gap-3 px-1">
          <img src="/logo.png" alt="" className="h-11 w-11 rounded-lg bg-cream-50 object-contain p-0.5" />
          <div className="font-serif text-xl font-semibold leading-tight text-white">JM Masala<div className="font-sans text-xs font-normal text-gold-300">Quotations</div></div>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          <NavLink to="/" end className={link}><LayoutDashboard className="h-5 w-5" />{t.nav.today}</NavLink>
          <NavLink to="/quotes" end className={link}><FileText className="h-5 w-5" />{t.nav.quotes}</NavLink>
          <NavLink to="/quotes/new" className={link}><Plus className="h-5 w-5" />{t.nav.newQuote}</NavLink>
          <NavLink to="/buyers" className={link}><Users className="h-5 w-5" />{t.nav.buyers}</NavLink>
          <NavLink to="/marketing" className={link}><Megaphone className="h-5 w-5" />{t.nav.marketing}</NavLink>
          <NavLink to="/intelligence" className={link}><Globe className="h-5 w-5" />{t.ti.navLabel}</NavLink>
          <NavLink to="/products" className={link}><Package className="h-5 w-5" />{t.nav.products}</NavLink>
          {isAdmin && <NavLink to="/settings" className={link}><Cog className="h-5 w-5" />{t.nav.settings}</NavLink>}
        </nav>
        {/* signed-in person and Sign out: only when login is on (nobody is "signed in" while login is switched off) */}
        {!AUTH_BYPASS && (
          <div className="border-t border-forest-700 pt-3 text-sm">
            <div className="truncate px-1 text-forest-100">{me?.full_name}</div>
            <button onClick={() => void signOut()} className="tap mt-1 flex w-full items-center gap-2 rounded-lg px-1 text-gold-300 hover:text-white"><LogOut className="h-4 w-4" />{t.nav.signOut}</button>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
        Phone top bar (hidden from md up): logo, then Settings (admin) and Sign out (not in bypass
        mode).
        */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-forest-900 px-4 py-2 text-white md:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-9 w-9 rounded-md bg-cream-50 object-contain p-0.5" />
            <span className="font-serif text-lg font-semibold">JM Masala</span>
          </div>
          <div className="flex items-center">
            <NavLink to="/intelligence" aria-label={t.ti.title} className="tap grid place-items-center rounded-lg hover:bg-forest-800"><Globe className="h-5 w-5" /></NavLink>
            {isAdmin && <NavLink to="/settings" aria-label={t.nav.settings} className="tap grid place-items-center rounded-lg hover:bg-forest-800"><Cog className="h-5 w-5" /></NavLink>}
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
        <nav aria-label="Main" className="safe-bottom fixed inset-x-0 bottom-0 z-40 grid grid-cols-[1fr_1fr_auto_1fr_1fr_1fr] items-end border-t border-cream-200 bg-white md:hidden">
          <Tab to="/" end icon={<LayoutDashboard className="h-5 w-5" />} label={t.nav.today} />
          <Tab to="/quotes" end icon={<FileText className="h-5 w-5" />} label={t.nav.quotes} />
          <NavLink to="/quotes/new" aria-label={t.nav.newQuote} className="-mt-5 flex flex-col items-center pb-1">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-gold-500 text-forest-950 shadow-lg ring-4 ring-white"><Plus className="h-7 w-7" /></span>
          </NavLink>
          <Tab to="/buyers" icon={<Users className="h-5 w-5" />} label={t.nav.buyers} />
          <Tab to="/marketing" icon={<Megaphone className="h-5 w-5" />} label={t.nav.marketing} />
          <Tab to="/products" icon={<Package className="h-5 w-5" />} label={t.nav.products} />
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
