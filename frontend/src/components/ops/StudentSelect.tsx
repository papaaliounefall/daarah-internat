import React, { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { searchStudents } from '../../services/students';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { Student } from '../../types';

export interface PickedStudent { id: string; fullName: string; registrationNumber: string }

/** Choix d'un talibé par recherche (nom, prénom ou matricule). */
export const StudentSelect: React.FC<{
  value: PickedStudent | null;
  onChange: (s: PickedStudent | null) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** Filtre local appliqué aux résultats (ex. talibés non archivés). */
  accept?: (s: Student) => boolean;
}> = ({ value, onChange, label = 'Talibé', required, disabled, accept }) => {
  const id = useId();
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q);
  const [results, setResults] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (dq.trim().length < 2) { setResults([]); return; }
    let live = true;
    setSearching(true);
    searchStudents(dq.trim())
      .then(r => { if (live) setResults(accept ? r.filter(accept) : r); })
      .catch(() => { if (live) setResults([]); })
      .finally(() => { if (live) setSearching(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const pick = (s: Student) => {
    onChange({ id: s.id, fullName: s.fullName, registrationNumber: s.registrationNumber });
    setQ('');
    setResults([]);
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-slate-50 px-3 py-2 text-sm">
          <span>{value.fullName} <span className="font-mono text-xs text-slate-500">{value.registrationNumber}</span></span>
          {!disabled && (
            <button type="button" aria-label={`Changer de talibé (${value.fullName})`} className="rounded p-0.5 text-slate-500 hover:bg-slate-200" onClick={() => onChange(null)}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <>
          <input id={id} type="search" className="input" placeholder="Rechercher un talibé (2 lettres minimum)" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" disabled={disabled} />
          {q.trim().length >= 2 && (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-md border border-line bg-white" aria-live="polite">
              {searching && <li className="px-3 py-2 text-sm text-slate-500">Recherche…</li>}
              {!searching && results.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Aucun talibé trouvé.</li>}
              {results.map(s => (
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
