import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { searchStudents } from '../../services/students';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Student } from '../../types';

export interface PickedStudent { id: string; fullName: string; registrationNumber: string }

/** Sélection d'un ou plusieurs talibés par recherche (nom, prénom ou matricule). */
export const StudentPicker: React.FC<{
  selected: PickedStudent[];
  onChange: (list: PickedStudent[]) => void;
  /** Talibés à ne pas proposer (déjà liés). */
  excludeIds?: string[];
  single?: boolean;
  label?: string;
}> = ({ selected, onChange, excludeIds = [], single, label = 'Enfants' }) => {
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q);
  const [results, setResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (dq.trim().length < 2) { setResults([]); return; }
    let live = true;
    setSearching(true);
    searchStudents(dq.trim())
      .then(r => { if (live) setResults(r); })
      .catch(() => { if (live) setResults([]); })
      .finally(() => { if (live) setSearching(false); });
    return () => { live = false; };
  }, [dq]);

  const taken = new Set([...selected.map(s => s.id), ...excludeIds]);
  const options = results.filter(r => !taken.has(r.id));

  const pick = (s: Student) => {
    const p = { id: s.id, fullName: s.fullName, registrationNumber: s.registrationNumber };
    onChange(single ? [p] : [...selected, p]);
    setQ('');
    setResults([]);
  };

  return (
    <div>
      <label htmlFor="picker-q" className="mb-1 block text-sm font-medium">{label}</label>
      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {selected.map(s => (
            <li key={s.id} className="inline-flex items-center gap-1 rounded bg-brand-50 py-0.5 pl-2 pr-1 text-sm text-brand-800">
              {s.fullName}
              <button type="button" aria-label={`Retirer ${s.fullName}`} className="rounded p-0.5 hover:bg-brand-100" onClick={() => onChange(selected.filter(x => x.id !== s.id))}>
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!(single && selected.length > 0) && (
        <>
          <input id="picker-q" type="search" className="input" placeholder="Rechercher un talibé (2 lettres minimum)" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          {q.trim().length >= 2 && (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-line bg-white" aria-live="polite">
              {searching && <li className="px-3 py-2 text-sm text-slate-500">Recherche…</li>}
              {!searching && options.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Aucun talibé trouvé.</li>}
              {options.map(s => (
                <li key={s.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => pick(s)}>
                    <span>{s.fullName}</span>
                    <span className="font-mono text-xs text-slate-500">{s.registrationNumber}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
