/**
 * Marketing tab (route /marketing): the Marketing Hub. Four sections, chosen with the buttons under the title (kept in the
 * address as ?tab= so a link or a refresh returns to the same one):
 *  - Overview: the Buyer CRM numbers, follow-ups, pipeline board and sales by channel (components/marketing/OverviewTab.tsx);
 *  - Campaigns: the history of e-mail campaigns and the "New campaign" button (CampaignsTab.tsx);
 *  - Templates: saved e-mail wording (TemplatesTab.tsx);
 *  - Files: the catalogue PDF, company profile and other files to attach (LibraryTab.tsx).
 * The composer for a new campaign is pages/CampaignNew.tsx; a sent campaign's report is pages/CampaignDetail.tsx.
 * No API calls here; each tab loads its own data.
 */
import clsx from 'clsx';
import { useSearchParams } from 'react-router-dom';
import { CampaignsTab } from '@/components/marketing/CampaignsTab';
import { LibraryTab } from '@/components/marketing/LibraryTab';
import { OverviewTab } from '@/components/marketing/OverviewTab';
import { TemplatesTab } from '@/components/marketing/TemplatesTab';
import { PageHeader } from '@/components/ui';
import { t } from '@/strings';

const TABS = [
  { key: 'overview', label: t.mkt.tabOverview },
  { key: 'campaigns', label: t.mkt.tabCampaigns },
  { key: 'templates', label: t.mkt.tabTemplates },
  { key: 'files', label: t.mkt.tabLibrary },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/** Marketing tab; see the file comment. */
export default function Marketing() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab');
  const tab: TabKey = TABS.some((x) => x.key === raw) ? (raw as TabKey) : 'overview';

  return (
    <div>
      <PageHeader title={t.crm.marketingTitle} subtitle={t.crm.marketingSub} />

      <div role="tablist" aria-label={t.crm.marketingTitle} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {TABS.map((x) => (
          <button
            key={x.key} type="button" role="tab" aria-selected={tab === x.key}
            onClick={() => setSp(x.key === 'overview' ? {} : { tab: x.key }, { replace: true })}
            className={clsx('tap shrink-0 rounded-full border px-4 text-base font-semibold', tab === x.key ? 'border-forest-900 bg-forest-900 text-white' : 'border-forest-900/25 bg-white text-forest-900 hover:bg-forest-50')}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'campaigns' && <CampaignsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'files' && <LibraryTab />}
    </div>
  );
}
