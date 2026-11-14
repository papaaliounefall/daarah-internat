import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Surah } from '../../types/quran';
import { filterSurahs } from './quranUtils';

interface Props {
  surahs: Surah[];
  selected: number | null;
  onSelect: (n: number) => void;
}

/** Les 114 sourates, avec recherche (numéro, nom translittéré, nom français ou arabe). */
export const SurahList: React.FC<Props> = ({ surahs, selected, onSelect }) => {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterSurahs(surahs, query), [surahs, query]);

  return (
    <div className="panel flex flex-col lg:max-h-[calc(100vh-9rem)]">
      <div className="relative border-b border-line p-2">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          type="search"
          className="input pl-9"
          placeholder="Rechercher une sourate"
          aria-label="Rechercher une sourate"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Liste des sourates">
        {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Aucune sourate ne correspond à « {query} ».</li>}
        {shown.map(s => (
          <li key={s.number}>
            <button
              type="button"
              onClick={() => onSelect(s.number)}
              aria-current={s.number === selected ? 'true' : undefined}
              className={`flex min-h-12 w-full items-center gap-3 border-b border-line px-3 py-2 text-left hover:bg-brand-50 ${
                s.number === selected ? 'bg-brand-50' : ''
              }`}
            >
              <span className="w-8 shrink-0 text-right text-sm tabular-nums text-slate-500">{s.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{s.nameSimple}</span>
                <span className="block truncate text-xs text-slate-500">{s.nameFrench} · {s.versesCount} versets</span>
              </span>
              <span lang="ar" dir="rtl" className="font-arabic text-lg text-ink">{s.nameArabic}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
