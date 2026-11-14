import React from 'react';
import { PageHeader } from '../../components/ui';
import { TabBar, TabPanel, useTabParam } from '../../components/ops/Tabs';
import { SummaryTab } from './SummaryTab';
import { PaymentsTab } from './PaymentsTab';
import { DuesTab } from './DuesTab';
import { ArrearsTab } from './ArrearsTab';
import { ExpensesTab } from './ExpensesTab';
import { FeesTab } from './FeesTab';

const TABS = [
  { id: 'synthese', label: 'Synthèse' },
  { id: 'paiements', label: 'Paiements' },
  { id: 'echeances', label: 'Échéances' },
  { id: 'impayes', label: 'Impayés' },
  { id: 'depenses', label: 'Dépenses' },
  { id: 'frais', label: 'Frais et réductions' },
];

/** Finances : synthèse, paiements, échéances, impayés, dépenses, grille de frais. Droits contrôlés par le serveur. */
export const FinanceModule: React.FC = () => {
  const [active, setActive] = useTabParam(TABS);
  return (
    <div>
      <PageHeader title="Finances" description="Recettes, dépenses et suivi des frais de scolarité (montants en FCFA)." />
      <TabBar tabs={TABS} active={active} onChange={setActive} label="Sections des finances" />
      <TabPanel id={active}>
        {active === 'synthese' && <SummaryTab />}
        {active === 'paiements' && <PaymentsTab />}
        {active === 'echeances' && <DuesTab />}
        {active === 'impayes' && <ArrearsTab />}
        {active === 'depenses' && <ExpensesTab />}
        {active === 'frais' && <FeesTab />}
      </TabPanel>
    </div>
  );
};

export default FinanceModule;
