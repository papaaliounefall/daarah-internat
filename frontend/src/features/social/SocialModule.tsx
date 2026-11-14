import React from 'react';
import { PageHeader } from '../../components/ui';
import { TabBar, TabPanel, useTabParam } from '../../components/ops/Tabs';
import { useAuth } from '../../stores/authStore';
import { OverviewTab } from './OverviewTab';
import { SponsorsTab } from './SponsorsTab';
import { SponsorshipsTab } from './SponsorshipsTab';
import { DonationsTab } from './DonationsTab';

/** Social et parrainages : vue d'ensemble, parrains, parrainages, dons. Les dons relèvent des finances. */
export const SocialModule: React.FC = () => {
  const user = useAuth(s => s.user)!;
  const isDirector = user.role === 'DIRECTEUR';
  const canSeeDonations = isDirector || user.canViewFinance;

  const tabs = [
    { id: 'apercu', label: "Vue d'ensemble" },
    { id: 'parrains', label: 'Parrains' },
    { id: 'parrainages', label: 'Parrainages' },
    ...(canSeeDonations ? [{ id: 'dons', label: 'Dons' }] : []),
  ];
  const [active, setActive] = useTabParam(tabs);

  return (
    <div>
      <PageHeader
        title="Social et parrainages"
        description={isDirector ? 'Talibés sociaux, parrains, parrainages et dons.' : 'Consultation des talibés sociaux, parrains, parrainages et dons.'}
      />
      <TabBar tabs={tabs} active={active} onChange={setActive} label="Sections du social" />
      <TabPanel id={active}>
        {active === 'apercu' && <OverviewTab />}
        {active === 'parrains' && <SponsorsTab canWrite={isDirector} />}
        {active === 'parrainages' && <SponsorshipsTab canWrite={isDirector} />}
        {active === 'dons' && canSeeDonations && <DonationsTab canWrite={isDirector} />}
      </TabPanel>
    </div>
  );
};

export default SocialModule;
