import React from 'react';
import { TabBar, TabPanel, useTabParam, type TabDef } from '../../components/ops/Tabs';
import { PageHeader, Spinner } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { listWorkingClasses } from '../../services/memorization';
import { useAuth } from '../../stores/authStore';
import type { ClassRoom } from '../../types';
import { AttendanceHistory } from './AttendanceHistory';
import { AttendanceStatsTab } from './AttendanceStats';
import { DailyEntry } from './DailyEntry';

const STAFF_TABS: TabDef[] = [
  { id: 'saisie', label: 'Saisie du jour' },
  { id: 'historique', label: 'Historique' },
  { id: 'statistiques', label: 'Statistiques' },
];
const PARENT_TABS: TabDef[] = [{ id: 'historique', label: 'Présences de mes enfants' }];

const NO_CLASSES: ClassRoom[] = [];

/** Présences (/app/presences) : saisie rapide, historique, statistiques ; le parent consulte ses enfants en lecture seule. */
export const AttendanceModule: React.FC = () => {
  const role = useAuth(s => s.user!.role);
  const isParent = role === 'PARENT';
  const tabs = isParent ? PARENT_TABS : STAFF_TABS;
  const [tab, setTab] = useTabParam(tabs);
  const classes = useFetch(() => (isParent ? Promise.resolve(NO_CLASSES) : listWorkingClasses()), [isParent]);
  const list = classes.data ?? NO_CLASSES;

  return (
    <div>
      <PageHeader
        title="Présences"
        description={isParent ? 'Présences et absences de vos enfants (lecture seule).' : 'Pointage quotidien par classe et par créneau.'}
      />
      {tabs.length > 1 && <TabBar tabs={tabs} active={tab} onChange={setTab} label="Présences" />}

      {classes.error && !classes.data && !isParent && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          Les classes n'ont pas pu être chargées : {classes.error}{' '}
          <button className="underline" onClick={classes.reload}>Réessayer</button>
        </p>
      )}

      {!isParent && classes.loading && !classes.data && <Spinner label="Chargement des classes…" />}
      {tab === 'saisie' && classes.data && <TabPanel id="saisie"><DailyEntry classes={list} /></TabPanel>}
      {tab === 'historique' && <TabPanel id="historique"><AttendanceHistory classes={list} readOnlyParent={isParent} /></TabPanel>}
      {tab === 'statistiques' && (classes.data || isParent) && (
        <TabPanel id="statistiques"><AttendanceStatsTab classes={list} canSeeAllClasses={role !== 'MAITRE'} /></TabPanel>
      )}
    </div>
  );
};

export default AttendanceModule;
