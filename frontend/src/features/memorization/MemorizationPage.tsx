import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Async } from '../../components/ops/Async';
import { EmptyState, PageHeader } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { listClassStudents } from '../../services/academics';
import { listWorkingClasses } from '../../services/memorization';
import { getStudent } from '../../services/students';
import { useAuth } from '../../stores/authStore';
import type { Student } from '../../types';
import { ClassStudentPicker } from './ClassStudentPicker';
import { StudentPanel } from './StudentPanel';
import { useReferenceData } from './useReferenceData';

/**
 * Suivi coranique (/app/suivi) : le directeur et le maître saisissent, l'assistant consulte.
 * URL : ?classe=<id>&eleve=<id> (ou ?student=<id> depuis une autre page : la classe est alors déduite).
 */
export const MemorizationPage: React.FC = () => {
  const role = useAuth(s => s.user!.role);
  const canWrite = role === 'DIRECTEUR' || role === 'MAITRE';
  const [params, setParams] = useSearchParams();
  const deepLink = params.get('student');
  const eleve = params.get('eleve') ?? deepLink;
  const classe = params.get('classe') ?? '';

  const classes = useFetch(listWorkingClasses, []);
  const reference = useReferenceData();
  const students = useFetch(() => (classe ? listClassStudents(classe) : Promise.resolve([] as Student[])), [classe]);
  const [refreshKey, setRefreshKey] = useState(0);

  const select = (classId: string, studentId?: string) => {
    const p = new URLSearchParams();
    if (classId) p.set('classe', classId);
    if (studentId) p.set('eleve', studentId);
    setParams(p, { replace: true });
  };

  // Lien direct ?student= : on retrouve la classe du talibé.
  useEffect(() => {
    if (!deepLink || classe) return;
    let live = true;
    getStudent(deepLink)
      .then(s => { if (live && s.classId) select(s.classId, s.id); })
      .catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink, classe]);

  // Sans choix préalable, la première classe est proposée (un maître n'en a souvent qu'une).
  useEffect(() => {
    if (!classes.data || classe || deepLink || classes.data.length === 0) return;
    select(classes.data[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.data]);

  const selected = students.data?.find(s => s.id === eleve) ?? null;

  const onSaved = () => { setRefreshKey(k => k + 1); students.reload(); };

  return (
    <div>
      <PageHeader
        title="Suivi coranique"
        description={canWrite ? 'Enregistrez la leçon, la révision ou l\'évaluation d\'un talibé en quelques gestes.' : 'Consultation du suivi des talibés.'}
      />
      <Async
        state={classes}
        isEmpty={d => d.length === 0}
        emptyTitle="Aucune classe à suivre"
        emptyHint={role === 'MAITRE' ? "Aucune classe ne vous est attribuée pour l'année en cours. Contactez le directeur." : "Créez d'abord une classe pour l'année en cours."}
      >
        {list => (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
            <aside className={selected ? 'hidden lg:block' : 'block'}>
              <ClassStudentPicker
                classes={list}
                classId={classe}
                onClass={id => select(id)}
                students={students}
                selectedId={selected?.id ?? null}
                onSelect={s => select(classe, s.id)}
              />
            </aside>
            <section className={selected ? 'block' : 'hidden lg:block'} aria-label="Suivi du talibé">
              {selected ? (
                <StudentPanel
                  student={selected}
                  reference={reference}
                  canWrite={canWrite}
                  refreshKey={refreshKey}
                  onSaved={onSaved}
                  onBack={() => select(classe)}
                />
              ) : (
                <div className="panel"><EmptyState title="Choisissez un talibé" hint="Sélectionnez un talibé dans la liste pour saisir ou consulter son suivi." /></div>
              )}
            </section>
          </div>
        )}
      </Async>
    </div>
  );
};

export default MemorizationPage;
