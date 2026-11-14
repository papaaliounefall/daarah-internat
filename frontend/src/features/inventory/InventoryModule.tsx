import React from 'react';
import { PageHeader } from '../../components/ui';
import { TabBar, TabPanel, useTabParam } from '../../components/ops/Tabs';
import { DashboardTab } from './DashboardTab';
import { ItemsTab } from './ItemsTab';
import { MovementsTab } from './MovementsTab';
import { AlertsTab } from './AlertsTab';
import { CategoriesTab, SuppliersTab } from './ReferenceTab';

const TABS = [
  { id: 'tableau', label: 'Tableau de bord' },
  { id: 'articles', label: 'Articles' },
  { id: 'mouvements', label: 'Mouvements' },
  { id: 'alertes', label: 'Alertes' },
  { id: 'categories', label: 'Catégories' },
  { id: 'fournisseurs', label: 'Fournisseurs' },
];

/** Stocks : articles, mouvements (entrée, sortie, ajustement), alertes de seuil. */
export const InventoryModule: React.FC = () => {
  const [active, setActive] = useTabParam(TABS);
  return (
    <div>
      <PageHeader title="Stocks" description="Denrées, fournitures et matériel de l'établissement." />
      <TabBar tabs={TABS} active={active} onChange={setActive} label="Sections des stocks" />
      <TabPanel id={active}>
        {active === 'tableau' && <DashboardTab onOpenAlerts={() => setActive('alertes')} />}
        {active === 'articles' && <ItemsTab />}
        {active === 'mouvements' && <MovementsTab />}
        {active === 'alertes' && <AlertsTab />}
        {active === 'categories' && <CategoriesTab />}
        {active === 'fournisseurs' && <SuppliersTab />}
      </TabPanel>
    </div>
  );
};

export default InventoryModule;
