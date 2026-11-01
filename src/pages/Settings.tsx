/**
 * Settings screen (route /settings, admin only via RequireAdmin, FR-04). Shows six accordion sections and
 * nothing else.
 * API: GET /settings through useSettings (react-query key ['settings']); each panel saves with PUT
 * /settings or its own endpoint and refreshes that key.
 * Composes: Section + CompanyPanel, BankPanel, TermsPanel, DefaultsPanel, UsersPanel, ImportPanel
 * (src/components/settings/). The PDFs print the company, bank and terms saved here.
 */

import { useState } from 'react';
import { BankPanel } from '@/components/settings/BankPanel';
import { CompanyPanel } from '@/components/settings/CompanyPanel';
import { DefaultsPanel } from '@/components/settings/DefaultsPanel';
import { ImportPanel } from '@/components/settings/ImportPanel';
import { Section } from '@/components/settings/shared';
import { TermsPanel } from '@/components/settings/TermsEditor';
import { UsersPanel } from '@/components/settings/UsersPanel';
import { AUTH_BYPASS, hasRoute } from '@/lib/config';
import { ErrorNote, PageHeader, Spinner } from '@/components/ui';
import { useSettings } from '@/lib/hooks';
import { t } from '@/strings';

// Shorthand for this screen's strings.
const s = t.settings;
// The six collapsible sections, in the order shown.
type SectionId = 'company' | 'bank' | 'terms' | 'defaults' | 'users' | 'import';

/**
 * Settings screen (route /settings; admin only, wrapped in RequireAdmin, FR-04). A stack of collapsible
 * sections: Company, Bank details, Default terms, Defaults, Users, Import.
 * The user sees a title and a list of cards; tapping a card heading opens it and closes the previous one
 * (accordion; Company is open at first). Each section has its own form, its own Save and its own API calls
 * (documented in components/settings/*); this page only loads the settings and arranges the sections.
 * Data: useSettings() -> GET /settings, key ['settings']. While loading a spinner; on error an ErrorNote
 * with Retry. The Users and Import sections load their own data.
 * Local state: open = which section is expanded (null = all closed).
 */
export default function Settings() {
  // Settings query shared with the rest of the app (cached 5 minutes).
  const query = useSettings();
  // Which section is expanded.
  const [open, setOpen] = useState<SectionId | null>('company');
  // Clicking the open section closes it; clicking another opens that one instead.
  const toggle = (id: SectionId) => setOpen((cur) => (cur === id ? null : id));
  // The loaded settings, passed to the Company, Bank, Terms and Defaults panels (they copy it into their
  // own form state once).
  const data = query.data;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={s.title} subtitle={AUTH_BYPASS ? undefined : s.subtitle} />
      {query.isPending ? <Spinner /> : query.isError || !data ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : (
        <div className="space-y-3">
          <Section title={s.company} open={open === 'company'} onToggle={() => toggle('company')}><CompanyPanel settings={data} /></Section>
          <Section title={s.bank} open={open === 'bank'} onToggle={() => toggle('bank')}><BankPanel settings={data} /></Section>
          <Section title={s.terms} open={open === 'terms'} onToggle={() => toggle('terms')}><TermsPanel settings={data} /></Section>
          <Section title={s.defaults} open={open === 'defaults'} onToggle={() => toggle('defaults')}><DefaultsPanel settings={data} /></Section>
          {/* user accounts and roles belong to login, which is switched off for now (set up later) */}
          {!AUTH_BYPASS && <Section title={s.users} open={open === 'users'} onToggle={() => toggle('users')}><UsersPanel /></Section>}
          {hasRoute('POST', '/import/products') && <Section title={s.import} open={open === 'import'} onToggle={() => toggle('import')}><ImportPanel /></Section>}
        </div>
      )}
    </div>
  );
}
