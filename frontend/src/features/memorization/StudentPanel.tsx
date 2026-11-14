import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { TabBar, TabPanel, type TabDef } from '../../components/ops/Tabs';
import { Button, ErrorState, Spinner } from '../../components/ui';
import type { Student } from '../../types';
import { readerPath } from '../quran/quranUtils';
import { EvaluationForm } from './EvaluationForm';
import { LessonForm } from './LessonForm';
import { RevisionForm } from './RevisionForm';
import { StudentTimeline } from './StudentTimeline';
import type { ReferenceState } from './useReferenceData';

interface Props {
  student: Student;
  reference: ReferenceState;
  /** Directeur et maître saisissent ; l'assistant consulte seulement. */
  canWrite: boolean;
  /** Incrémenté après chaque saisie pour recharger l'historique. */
  refreshKey: number;
  onSaved: () => void;
  onBack: () => void;
}

const WRITE_TABS: TabDef[] = [
  { id: 'lecon', label: 'Nouvelle leçon' },
  { id: 'revision', label: 'Révision' },
  { id: 'evaluation', label: 'Évaluation' },
  { id: 'historique', label: 'Historique' },
];
const READ_TABS: TabDef[] = [{ id: 'historique', label: 'Historique' }];

/** Fiche de suivi d'un talibé : progression actuelle, saisie (leçon, révision, évaluation) et historique. */
export const StudentPanel: React.FC<Props> = ({ student, reference, canWrite, refreshKey, onSaved, onBack }) => {
  const tabs = canWrite ? WRITE_TABS : READ_TABS;
  const [tab, setTab] = useState(tabs[0].id);
  const active = tabs.some(t => t.id === tab) ? tab : tabs[0].id;
  const ref = reference.data;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="mb-1 -ml-2 lg:hidden" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden /> Retour à la liste</Button>
          <h2 className="text-lg font-semibold text-ink">{student.fullName}</h2>
          <p className="text-sm text-slate-500">{student.className || 'Sans classe'} · {student.registrationNumber}</p>
          <p className="mt-1 text-sm text-slate-700">
            {student.currentSurahNumber
              ? <>Dernière leçon : <strong>{student.currentSurahName}</strong>, verset {student.currentAyah}{student.currentJuz ? ` · juz ${student.currentJuz}` : ''}{student.currentHizb ? ` · hizb ${student.currentHizb}` : ''}</>
              : 'Aucune leçon enregistrée pour le moment.'}
          </p>
        </div>
        {student.currentSurahNumber && (
          <Link
            to={readerPath({ surah: student.currentSurahNumber, ayah: student.currentAyah, student: student.id })}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-slate-50"
          >
            <BookOpen className="h-4 w-4" aria-hidden /> Ouvrir au dernier verset
          </Link>
        )}
      </div>

      {reference.loading && !ref && <Spinner label="Chargement de la configuration…" />}
      {reference.error && !ref && <ErrorState message={reference.error} onRetry={reference.reload} />}

      {ref && (
        <>
          {tabs.length > 1 && <TabBar tabs={tabs} active={active} onChange={setTab} label="Suivi du talibé" />}
          {ref.surahs.length === 0 && active !== 'historique' && (
            <p role="alert" className="mb-4 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
              Le corpus coranique n'est pas encore installé sur le serveur : la saisie des leçons est indisponible tant que l'import n'a pas été fait.
            </p>
          )}
          {canWrite && active === 'lecon' && (
            <TabPanel id="lecon"><LessonForm student={student} reference={ref} onSaved={onSaved} /></TabPanel>
          )}
          {canWrite && active === 'revision' && (
            <TabPanel id="revision"><RevisionForm student={student} reference={ref} onSaved={onSaved} /></TabPanel>
          )}
          {canWrite && active === 'evaluation' && (
            <TabPanel id="evaluation"><EvaluationForm student={student} criteria={ref.criteria} onSaved={onSaved} /></TabPanel>
          )}
          {active === 'historique' && (
            <TabPanel id="historique">
              <StudentTimeline studentId={student.id} reference={ref} canCorrect={canWrite} refreshKey={refreshKey} onChanged={onSaved} />
            </TabPanel>
          )}
        </>
      )}
    </div>
  );
};
