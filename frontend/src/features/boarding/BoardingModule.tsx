import React from 'react';
import { PageHeader } from '../../components/ui';
import { TabBar, TabPanel, useTabParam } from '../../components/ops/Tabs';
import { OccupancyTab } from './OccupancyTab';
import { AssignmentsTab } from './AssignmentsTab';
import { BoardingMovementsTab } from './MovementsTab';
import { RoomsTab } from './RoomsTab';

const TABS = [
  { id: 'occupation', label: 'Occupation' },
  { id: 'affectations', label: 'Affectations' },
  { id: 'mouvements', label: 'Entrées et sorties' },
  { id: 'chambres', label: 'Chambres' },
  { id: 'historique', label: 'Historique' },
];

/** Internat : occupation réelle, affectations, entrées / sorties, bâtiments et chambres. */
export const BoardingModule: React.FC = () => {
  const [active, setActive] = useTabParam(TABS);
  return (
    <div>
      <PageHeader title="Internat" description="Bâtiments, chambres, affectations des talibés et mouvements." />
      <TabBar tabs={TABS} active={active} onChange={setActive} label="Sections de l'internat" />
      <TabPanel id={active}>
        {active === 'occupation' && <OccupancyTab />}
        {active === 'affectations' && <AssignmentsTab mode="active" />}
        {active === 'mouvements' && <BoardingMovementsTab />}
        {active === 'chambres' && <RoomsTab />}
        {active === 'historique' && <AssignmentsTab mode="history" />}
      </TabPanel>
    </div>
  );
};

export default BoardingModule;
