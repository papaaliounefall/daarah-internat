import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Async } from '../../components/ops/Async';
import { SelectField } from '../../components/ui';
import type { FetchState } from '../../hooks/useFetch';
import type { ClassRoom, Student } from '../../types';

interface Props {
  classes: ClassRoom[];
  classId: string;
  onClass: (id: string) => void;
  students: FetchState<Student[]>;
  selectedId: string | null;
  onSelect: (s: Student) => void;
}

/** Choix de la classe puis du talibé (liste cherchable, un tap). Le périmètre (classes du maître) est appliqué par le serveur. */
export const ClassStudentPicker: React.FC<Props> = ({ classes, classId, onClass, students, selectedId, onSelect }) => {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = students.data ?? [];
    return term ? rows.filter(s => `${s.fullName} ${s.registrationNumber}`.toLowerCase().includes(term)) : rows;
  }, [students.data, q]);

  return (
    <div className="panel">
      <div className="space-y-3 border-b border-line p-3">
        <SelectField label="Classe" value={classId} onChange={e => { onClass(e.target.value); setQ(''); }}>
          <option value="">Choisir une classe</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.enrolledCount})</option>)}
        </SelectField>
        {classId && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" className="input pl-9" placeholder="Rechercher un talibé" aria-label="Rechercher un talibé" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        )}
      </div>

      {!classId ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Choisissez une classe pour afficher ses talibés.</p>
      ) : (
        <Async state={students} isEmpty={d => d.length === 0} emptyTitle="Aucun talibé dans cette classe" emptyHint="Les inscriptions actives de la classe apparaissent ici.">
          {() => (
            <ul className="max-h-[60vh] overflow-y-auto" aria-label="Talibés de la classe">
              {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Aucun résultat.</li>}
              {shown.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(s)}
                    aria-current={s.id === selectedId ? 'true' : undefined}
                    className={`flex min-h-14 w-full flex-col justify-center border-b border-line px-3 py-2 text-left hover:bg-brand-50 ${s.id === selectedId ? 'bg-brand-50' : ''}`}
                  >
                    <span className="text-sm font-medium text-ink">{s.fullName}</span>
                    <span className="text-xs text-slate-500">
                      {s.currentSurahName ? `${s.currentSurahName}${s.currentAyah ? `, verset ${s.currentAyah}` : ''}` : 'Pas encore de leçon'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Async>
      )}
    </div>
  );
};
