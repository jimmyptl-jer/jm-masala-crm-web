/**
 * Dashboard (route `/`): a daily sales cockpit. Who to chase today, which products buyers want, and who is going cold.
 * Layout follows the supplied dashboard mockup and DESIGN_SYSTEM.md (white + paprika). The four cards at the top are buttons: each opens its
 * own tab below (chase list, overdue follow-ups, new enquiries, going cold); a fifth tab, Daily rates, holds the per-kg rate of every grade
 * (components/products/DailyRates.tsx, the same table as the Daily rates page).
 *
 * API: GET /buyers (useBuyers), GET /dashboard (quote follow-ups due), GET /quotes?limit=100 (sent quotes that end soon),
 * GET /products (reference prices). The box at the top is today's dollar rate (components/FxRateBar.tsx: GET and PUT /fx-rate). Marking a buyer done / logging a contact does POST /buyers/:id/activities (a logged
 * contact, which the API will use to update the buyer's last contact) and PATCH /buyers/:id (next follow-up and action),
 * then refreshes ['buyers'], ['quotes'] and ['dashboard']. The mock implements POST /buyers/:id/activities; the real API still has to.
 * The chase rules live in lib/chase.ts. "Done today" is remembered in this browser (localStorage 'jm.chase.done.<date>').
 * Not built because the data is missing (docs/DOMAIN-SPEC.md): quantities in MT per buyer, daily offer prices and the Unjha
 * market trend, samples, repeat-order timing, and the "send today's price list" broadcast. Nothing is calculated for money here.
 */
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageCircle, Phone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { FxRateBar } from '@/components/FxRateBar';
import { DailyRates } from '@/components/products/DailyRates';
import { ColdPanel, IconAction, NewEnquiriesPanel, wantsOf } from '@/components/today/TodayPanels';
import { Button, EmptyState, ErrorNote, Input, Select, Sheet, Spinner, Textarea, errorMessage, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { buildChase, goingCold, type ChaseKind, type ChaseRow, type ChaseTone } from '@/lib/chase';
import { addDays, money, todayIST, waLink } from '@/lib/format';
import { useBuyers, useProducts } from '@/lib/hooks';
import type { ActivityKind, Buyer, Dashboard, QuoteList } from '@/lib/types';
import { t } from '@/strings';

const c = t.today;
/** The filter chips; "follow-up today" rows only show under All. */
type Filter = 'all' | Exclude<ChaseKind, 'today'>;
const FILTERS: Filter[] = ['all', 'overdue', 'quote', 'sample', 'new'];
type Tab = 'chase' | 'overdue' | 'new' | 'cold' | 'rates';
const KINDS: ActivityKind[] = ['call', 'whatsapp', 'email', 'meeting', 'note'];

/** Morning, afternoon or evening for the current hour in India (NFR-12). */
function dayPart(): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date())) % 24;
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}

/** Badge classes for a chase reason (status colours). */
const TONE: Record<ChaseTone, string> = {
  danger: 'bg-danger-bg text-danger-ink', warning: 'bg-warning-bg text-warning-ink', info: 'bg-info-bg text-info-ink', neutral: 'bg-surface-muted text-ink-secondary',
};

/** The contacts marked done today, kept in this browser per day. */
function useDoneToday(today: string) {
  const key = `jm.chase.done.${today}`;
  const read = (): string[] => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') as string[]; } catch { return []; } };
  const [ids, setIds] = useState<string[]>(read);
  const add = (id: string) => setIds((cur) => {
    const next = cur.includes(id) ? cur : [...cur, id];
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* not remembered */ }
    return next;
  });
  return { done: ids, add };
}

/** One KPI card; the hero card has the paprika border and number and an optional progress bar. */
function Kpi({ label, value, sub, hero, tone, progress, subTone, active, onOpen }: { label: string; value: number; sub: string; hero?: boolean; tone?: 'danger'; progress?: number; subTone?: 'warning'; active?: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} aria-pressed={active} aria-label={c.openCard(label)}
      className={clsx('block w-full rounded-xl border bg-surface p-5 text-left shadow-card transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paprika/40', active ? 'border-paprika ring-1 ring-paprika/30' : hero ? 'border-paprika-200' : 'border-line')}>
      <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted">{label}</p>
      <p className={clsx('mt-2 text-[28px] font-bold leading-8 tabular-nums', hero ? 'text-paprika' : tone === 'danger' ? 'text-danger-ink' : 'text-ink')}>{value}</p>
      <p className={clsx('mt-1 text-sm', subTone === 'warning' ? 'text-warning-ink' : 'text-ink-muted')}>{sub}</p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={c.kpiProgress(0, 0)}>
          <div className="h-full rounded-full bg-paprika" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </button>
  );
}

/** Sheet used by both "Mark as done" and "+ Log contact": how you contacted them, what happened, and (done only) the next follow-up. */
function ContactSheet({ mode, buyers, buyer, onClose, onSaved }: { mode: 'done' | 'log'; buyers: Buyer[]; buyer?: Buyer; onClose: () => void; onSaved: (id: string) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [buyerId, setBuyerId] = useState(buyer?.id ?? '');
  const [kind, setKind] = useState<ActivityKind>('call');
  const [body, setBody] = useState('');
  const [next, setNext] = useState(addDays(todayIST(), 3));
  const [nextAction, setNextAction] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState<unknown>(null);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!buyerId) e.buyer = c.buyerRequired;
    if (!body.trim()) e.body = c.outcomeRequired;
    setErrors(e);
    if (Object.keys(e).length || busy) return;
    setBusy(true);
    setFatal(null);
    try {
      await api.post(`/buyers/${buyerId}/activities`, { kind, body: body.trim() });
      if (mode === 'done') await api.patch(`/buyers/${buyerId}`, { next_followup: next || null, next_action: nextAction.trim() || null });
      await Promise.all([qc.invalidateQueries({ queryKey: ['buyers'] }), qc.invalidateQueries({ queryKey: ['quotes'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]);
      toast(c.savedToast);
      onSaved(buyerId);
      onClose();
    } catch (err) {
      setFatal(err);
      toast(errorMessage(err) || c.saveFailed, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={mode === 'done' ? c.doneTitle : c.logTitle}>
      <form className="space-y-3" noValidate onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
        <p className="text-sm text-ink-muted">{mode === 'done' && buyer ? c.doneSubtitle(buyer.company_name) : c.logSubtitle}</p>
        {!buyer && (
          <Select label={c.buyer} value={buyerId} onChange={(e) => setBuyerId(e.target.value)} error={errors.buyer}>
            <option value="">{c.chooseBuyer}</option>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.company_name}</option>)}
          </Select>
        )}
        <Select label={c.kind} value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
          {KINDS.map((k) => <option key={k} value={k}>{t.common.activityKind[k]}</option>)}
        </Select>
        <Textarea label={c.outcome} placeholder={c.outcomePlaceholder} value={body} onChange={(e) => setBody(e.target.value)} error={errors.body} />
        {mode === 'done' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="date" label={c.nextDate} value={next} min={todayIST()} onChange={(e) => setNext(e.target.value)} />
            <Input label={c.nextAction} optional placeholder={c.nextActionPlaceholder} value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
          </div>
        )}
        {fatal !== null && <ErrorNote error={fatal} />}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>{c.cancel}</Button>
          <Button type="submit" className="flex-1" loading={busy}>{busy ? c.saving : c.save}</Button>
        </div>
      </form>
    </Sheet>
  );
}

/** Dashboard screen. Local state: Me/Team, the chase filter, and which contact sheet is open. */
export default function Today() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const today = todayIST();
  const [scope, setScope] = useState<'me' | 'team'>('me');
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<Tab>('chase');
  const [sheet, setSheet] = useState<{ mode: 'done' | 'log'; buyer?: Buyer } | null>(null);
  const { done, add } = useDoneToday(today);

  const buyersQ = useBuyers({ archived: 'false' });
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });
  const quotesQ = useQuery({ queryKey: ['quotes', 'dashboard'], queryFn: () => api.get<QuoteList>('/quotes?limit=100') });
  const products = useProducts({ archived: 'false' });

  const mine = useMemo(() => (buyersQ.data ?? []).filter((b) => scope === 'team' || !b.assigned_to || b.assigned_to === me?.id), [buyersQ.data, scope, me?.id]);
  const mineIds = useMemo(() => new Set(mine.map((b) => b.id)), [mine]);
  const quotes = quotesQ.data?.data ?? [];
  const chase = useMemo(() => buildChase(mine, quotes.filter((q) => mineIds.has(q.buyer_id)), (dash.data?.due ?? []).filter((d) => mineIds.has(d.buyer_id)), today), [mine, mineIds, quotes, dash.data, today]);
  const cold = useMemo(() => goingCold(mine, today), [mine, today]);

  const doneNow = done.filter((id) => mineIds.has(id)).length;
  const left = chase.length;
  const total = doneNow + left;
  const overdue = chase.filter((r) => r.kind === 'overdue').length;
  const newBuyers = mine.filter((b) => b.stage === 'new_lead');
  const notReplied = newBuyers.filter((b) => !b.last_contact_at).length;
  const waiting = quotes.filter((q) => mineIds.has(q.buyer_id) && q.status === 'sent').length;
  const shown = filter === 'all' ? chase : chase.filter((r) => r.kind === filter);
  const overdueRows = chase.filter((r) => r.kind === 'overdue');
  const counts = (f: Filter) => (f === 'all' ? chase.length : chase.filter((r) => r.kind === f).length);

  // demand per approved product: how many live buyers want it, with a reference price from the product list
  const demand = useMemo(() => {
    const byName = new Map<string, number>();
    for (const b of mine.filter((x) => x.stage !== 'lost')) for (const name of new Set(wantsOf(b))) byName.set(name, (byName.get(name) ?? 0) + 1);
    return [...byName.entries()].map(([name, n]) => ({ name, n, product: (products.data ?? []).find((p) => p.name === name && p.ref_rate_usd) })).sort((a, b) => b.n - a.n);
  }, [mine, products.data]);
  const maxDemand = Math.max(1, ...demand.map((d) => d.n));

  const loading = buyersQ.isPending || dash.isPending;
  const name = me?.full_name || c.greetingFallbackName;

  return (
    <div className="space-y-5">
      <FxRateBar />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-8 tracking-tight text-ink">{c.greeting(dayPart(), name)}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">{loading ? ' ' : c.summary(left, waiting)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label={c.scopeLabel} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
            {(['me', 'team'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={scope === s} onClick={() => setScope(s)}
                className={clsx('tap rounded-md px-4 text-sm font-bold', scope === s ? 'bg-ink text-white' : 'text-ink-secondary hover:bg-surface-hover')}>{s === 'me' ? c.scopeMe : c.scopeTeam}</button>
            ))}
          </div>
          <Button onClick={() => setSheet({ mode: 'log' })}>{c.logContact}</Button>
        </div>
      </div>

      {buyersQ.isError && <ErrorNote error={buyersQ.error} onRetry={() => void buyersQ.refetch()} />}
      {loading && !buyersQ.isError && <Spinner />}

      {!loading && !buyersQ.isError && (
        <>
          <section aria-label={c.kpiLabel} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi hero label={c.kpiChase} value={left} sub={c.kpiChaseSub(doneNow, left)} progress={total > 0 ? doneNow / total : 0} active={tab === 'chase'} onOpen={() => { setFilter('all'); setTab('chase'); }} />
            <Kpi label={c.kpiOverdue} value={overdue} tone="danger" sub={c.kpiOverdueSub} active={tab === 'overdue'} onOpen={() => setTab('overdue')} />
            <Kpi label={c.kpiNew} value={newBuyers.length} sub={notReplied > 0 ? c.kpiNewSub(notReplied) : c.kpiNewNone} subTone={notReplied > 0 ? 'warning' : undefined} active={tab === 'new'} onOpen={() => setTab('new')} />
            <Kpi label={c.kpiCold} value={cold.length} sub={c.kpiColdSub} active={tab === 'cold'} onOpen={() => setTab('cold')} />
          </section>

          {/* the tabs: the cards above open the first four, "Daily rates" is the fifth */}
          <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card" aria-label={c.tabsLabel}>
            <div role="tablist" aria-label={c.tabsLabel} className="flex gap-1 overflow-x-auto border-b border-line px-3">
              {([['chase', c.tabChase, left], ['overdue', c.tabOverdue, overdue], ['new', c.tabNew, newBuyers.length], ['cold', c.tabCold, cold.length], ['rates', c.tabRates, null]] as const).map(([key, label, count]) => (
                <button key={key} type="button" role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls="today-panel" onClick={() => setTab(key)}
                  className={clsx('tap -mb-px whitespace-nowrap border-b-2 px-4 text-sm font-bold', tab === key ? 'border-paprika text-paprika' : 'border-transparent text-ink-muted hover:text-ink')}>{label}{count !== null ? ` ${count}` : ''}</button>
              ))}
            </div>
            <div role="tabpanel" id="today-panel" aria-labelledby={`tab-${tab}`}>
              {tab === 'chase' && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                    <h2 id="chase-h" className="text-[17px] font-bold leading-6 text-ink">{c.chaseTitle}</h2>
                    <div role="group" aria-label={c.filtersLabel} className="flex flex-wrap gap-1">
                      {FILTERS.map((f) => (
                        <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                          className={clsx('tap rounded-full px-3 text-sm font-bold', filter === f ? 'bg-paprika-50 text-paprika-700' : 'text-ink-muted hover:bg-surface-hover hover:text-ink')}>
                          {c.filters[f]}{f === 'all' ? ` ${counts(f)}` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ChaseTable rows={shown} onDone={(b) => setSheet({ mode: 'done', buyer: b })} onQuote={(b) => navigate(`/quotes/new?buyer=${b.id}`)} />
                </>
              )}
              {tab === 'overdue' && (
                <>
                  <div className="px-5 py-4"><h2 className="text-[17px] font-bold leading-6 text-ink">{c.overdueTitle}</h2><p className="text-sm text-ink-muted">{c.overdueHint}</p></div>
                  <ChaseTable rows={overdueRows} onDone={(b) => setSheet({ mode: 'done', buyer: b })} onQuote={(b) => navigate(`/quotes/new?buyer=${b.id}`)} />
                </>
              )}
              {tab === 'new' && (
                <>
                  <div className="px-5 py-4"><h2 className="text-[17px] font-bold leading-6 text-ink">{c.newTitle}</h2><p className="text-sm text-ink-muted">{c.newHint}</p></div>
                  <NewEnquiriesPanel buyers={newBuyers} onQuote={(b) => navigate(`/quotes/new?buyer=${b.id}`)} />
                </>
              )}
              {tab === 'cold' && (
                <>
                  <div className="px-5 py-4"><h2 className="text-[17px] font-bold leading-6 text-ink">{c.coldTitle}</h2><p className="text-sm text-ink-muted">{c.coldHint}</p></div>
                  <ColdPanel rows={cold} />
                </>
              )}
              {tab === 'rates' && <DailyRates embedded />}
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {/* product demand */}
            <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card" aria-labelledby="demand-h">
              <div className="flex items-center justify-between gap-2 px-5 py-4">
                <h2 id="demand-h" className="text-[17px] font-bold leading-6 text-ink">{c.demandTitle}</h2>
                <Link to="/products" className="text-sm font-bold text-paprika hover:underline">{c.editPrices}</Link>
              </div>
              {demand.length === 0 ? (
                <div className="border-t border-line px-5 py-8"><EmptyState title={c.demandEmpty}>{c.demandEmptyHint}</EmptyState></div>
              ) : (
                <table className="w-full text-[13.5px]">
                  <thead className="border-y border-line bg-surface-muted">
                    <tr className="h-9 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted"><th className="px-5 text-left">{c.colProduct}</th><th className="px-3 text-left">{c.colDemand}</th><th className="px-5 text-right">{c.colOffer}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {demand.map((d) => (
                      <tr key={d.name} className="h-[60px]">
                        <td className="px-5"><div className="font-bold text-ink">{d.name}</div><div className="text-xs text-ink-muted">{c.buyers(d.n)}</div></td>
                        <td className="px-3"><div className="flex items-center gap-3"><div className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-paprika" style={{ width: `${(d.n / maxDemand) * 100}%` }} /></div><span className="w-6 tabular-nums text-ink-secondary">{d.n}</span></div></td>
                        <td className="px-5 text-right">{d.product ? <><div className="num font-bold text-ink">{money(d.product.ref_rate_usd, 'USD')}</div><div className="text-xs text-ink-muted">{c.perUnit('KG')}</div></> : <span className="text-xs text-ink-muted">{c.noPrice}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="border-t border-line px-5 py-3 text-xs text-ink-muted">{c.demandNote}</p>
            </section>

            {/* going cold */}
            <section className="rounded-xl border border-line bg-surface p-5 shadow-card" aria-labelledby="cold-h">
              <h2 id="cold-h" className="text-[17px] font-bold leading-6 text-ink">{c.coldTitle}</h2>
              {cold.length === 0 ? (
                <div className="mt-3"><EmptyState title={c.coldEmpty}>{c.coldEmptyHint}</EmptyState></div>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {cold.slice(0, 6).map(({ buyer: b, days }) => {
                    const wa = b.whatsapp ?? b.phone;
                    return (
                      <li key={b.id} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <Link to={`/buyers/${b.id}`} className="block truncate font-bold text-ink hover:underline">{b.company_name}</Link>
                          <p className="truncate text-sm text-ink-muted">{[b.country ?? b.state, wantsOf(b)[0]].filter(Boolean).join(' · ')}</p>
                        </div>
                        <span className={clsx('text-sm font-bold tabular-nums', days >= 30 ? 'text-danger-ink' : 'text-warning-ink')}>{c.coldDays(days)}</span>
                        <IconAction href={wa ? waLink(wa, c.waMessage(b.contact_name ?? b.company_name, wantsOf(b)[0] ?? null)) : undefined} disabled={!wa} label={c.whatsappAria(b.company_name)} tint newTab><MessageCircle className="h-4 w-4" aria-hidden /></IconAction>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {sheet && <ContactSheet mode={sheet.mode} buyers={mine} buyer={sheet.buyer} onClose={() => setSheet(null)} onSaved={add} />}
    </div>
  );
}

/** One row of the chase list: buyer, what they want, last contact, the reason badge and the actions. */
function ChaseLine({ row, onDone, onQuote }: { row: ChaseRow; onDone: () => void; onQuote: () => void }) {
  const b = row.buyer;
  const wants = wantsOf(b);
  const since = row.daysSinceContact;
  const wa = b.whatsapp ?? b.phone;
  const callNo = b.phone ? b.phone.replace(/[^\d+]/g, '') : '';
  return (
    <tr className="h-[72px] hover:bg-surface-hover">
      <td className="px-5"><Link to={`/buyers/${b.id}`} className="font-bold text-ink hover:underline">{b.company_name}</Link><div className="text-ink-muted">{b.country ?? b.state ?? '—'}</div></td>
      <td className="px-3"><div className="text-ink-secondary">{wants.length ? wants.join(', ') : <span className="text-ink-muted">{c.noWants}</span>}</div></td>
      <td className={clsx('px-3 tabular-nums', since !== null && since > 10 ? 'font-bold text-danger-ink' : 'text-ink-secondary')}>{since === null ? c.noContact : c.daysAgo(since)}</td>
      <td className="px-3"><span className={clsx('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold', TONE[row.tone])}>{row.label}</span></td>
      <td className="px-5">
        <div className="flex items-center justify-end gap-2">
          {row.kind === 'new' ? (
            <button type="button" onClick={onQuote} aria-label={c.quoteAria(b.company_name)} className="tap h-9 rounded-lg bg-paprika px-4 text-sm font-bold text-white hover:bg-paprika-700">{c.quote}</button>
          ) : (
            <>
              <IconAction href={wa ? waLink(wa, c.waMessage(b.contact_name ?? b.company_name, wants[0] ?? null)) : undefined} disabled={!wa} label={c.whatsappAria(b.company_name)} tint newTab><MessageCircle className="h-4 w-4" aria-hidden /></IconAction>
              <IconAction href={callNo ? `tel:${callNo}` : undefined} disabled={!callNo} label={c.callAria(b.company_name)}><Phone className="h-4 w-4" aria-hidden /></IconAction>
              <IconAction label={c.doneAria(b.company_name)} onClick={onDone}><Check className="h-4 w-4" aria-hidden /></IconAction>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/** The chase table (also used by the Overdue tab): one ChaseLine per row, or the empty message. */
function ChaseTable({ rows, onDone, onQuote }: { rows: ChaseRow[]; onDone: (b: Buyer) => void; onQuote: (b: Buyer) => void }) {
  if (rows.length === 0) return <div className="border-t border-line px-5 py-8"><EmptyState title={c.chaseEmpty}>{c.chaseEmptyHint}</EmptyState></div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[13.5px]">
        <thead className="border-y border-line bg-surface-muted">
          <tr className="h-9 text-[11px] font-bold uppercase tracking-[0.05em] text-ink-muted">
            <th className="px-5">{c.colBuyer}</th><th className="px-3">{c.colWants}</th><th className="px-3">{c.colLast}</th><th className="px-3">{c.colWhy}</th><th className="px-5 text-right">{c.colAction}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => <ChaseLine key={r.buyer.id} row={r} onDone={() => onDone(r.buyer)} onQuote={() => onQuote(r.buyer)} />)}
        </tbody>
      </table>
    </div>
  );
}
