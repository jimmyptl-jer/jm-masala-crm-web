/**
 * Trade Intelligence (route /intelligence): market research and buyer discovery from imported data. Four sections chosen with the
 * buttons under the title (kept in the address as ?tab=, so links and refresh return to the same one):
 *  - Markets: which countries import the product, how big, how fast growing, at what price (components/trade/MarketsTab.tsx);
 *  - Buyer finder: discovered companies ranked by shipment evidence; shortlist them or turn them into CRM leads (BuyersTab.tsx);
 *  - Shipments: the shipment explorer (ShipmentsTab.tsx);
 *  - Data: import files (statistics, shipment records, company lists), history with undo, tracked HS codes, and where to get the files (DataTab.tsx).
 * A small row of numbers (companies, shortlisted, converted, shipments, last import) shows above the tabs.
 * API: GET /trade/summary here; each tab loads its own data. Nothing is collected automatically: data arrives only through the Data tab.
 */
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { BuyersTab } from '@/components/trade/BuyersTab';
import { DataTab } from '@/components/trade/DataTab';
import { MarketsTab } from '@/components/trade/MarketsTab';
import { ShipmentsTab } from '@/components/trade/ShipmentsTab';
import { PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import type { TradeSummary } from '@/lib/types';
import { t } from '@/strings';

const m = t.ti;
const TABS = [
  { key: 'markets', label: m.tabs.markets },
  { key: 'buyers', label: m.tabs.buyers },
  { key: 'shipments', label: m.tabs.shipments },
  { key: 'data', label: m.tabs.data },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Trade Intelligence page; see the file comment. */
export default function Intelligence() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab: TabKey = TABS.some((x) => x.key === raw) ? (raw as TabKey) : 'markets';
  const country = sp.get('country') ?? undefined;
  const summary = useQuery({ queryKey: ['trade', 'summary'], queryFn: () => api.get<TradeSummary>('/trade/summary') });
  const s = summary.data;

  const go = (key: TabKey, extra: Record<string, string> = {}) => setSp({ tab: key, ...extra }, { replace: true });

  return (
    <div>
      <PageHeader title={m.title} subtitle={m.subtitle} />
      {s && (s.companies > 0 || s.stat_rows > 0) && (
        <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink/70">
          <div><dt className="inline">Companies </dt><dd className="inline font-semibold text-forest-900">{s.companies.toLocaleString('en-US')}</dd></div>
          <div><dt className="inline">Shortlisted </dt><dd className="inline font-semibold text-forest-900">{s.shortlisted}</dd></div>
          <div><dt className="inline">Converted to leads </dt><dd className="inline font-semibold text-forest-900">{s.converted}</dd></div>
          <div><dt className="inline">Shipments </dt><dd className="inline font-semibold text-forest-900">{s.shipments.toLocaleString('en-US')}</dd></div>
          {s.first_year && <div><dt className="inline">Statistics </dt><dd className="inline font-semibold text-forest-900">{s.first_year}–{s.last_year}</dd></div>}
          {s.last_import && <div><dt className="inline">Last import </dt><dd className="inline font-semibold text-forest-900">{date(s.last_import)}</dd></div>}
        </dl>
      )}

      <div role="tablist" aria-label={m.title} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {TABS.map((x) => (
          <button
            key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => go(x.key)}
            className={clsx('tap shrink-0 rounded-full border px-4 text-base font-semibold', tab === x.key ? 'border-forest-900 bg-forest-900 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'markets' && <MarketsTab onFindBuyers={(c) => go('buyers', { country: c })} onGoData={() => go('data')} />}
      {tab === 'buyers' && <BuyersTab key={country ?? 'all'} initialCountry={country} />}
      {tab === 'shipments' && <ShipmentsTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}
