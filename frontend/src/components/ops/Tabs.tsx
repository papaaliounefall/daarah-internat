import React from 'react';
import { useSearchParams } from 'react-router-dom';

export interface TabDef { id: string; label: string }

/** Onglet actif conservé dans l'URL (?onglet=…) : le rechargement et le lien direct restent fidèles. */
export function useTabParam(tabs: TabDef[]): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('onglet');
  const active = tabs.find(t => t.id === wanted)?.id ?? tabs[0].id;
  return [active, (id: string) => setParams({ onglet: id }, { replace: true })];
}

/** Barre d'onglets accessible (flèches gauche/droite), défilement horizontal sur mobile. */
export const TabBar: React.FC<{ tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string }> = ({ tabs, active, onChange, label }) => {
  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={e => onKey(e, i)}
            className={`-mb-px min-h-10 shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
              selected ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

export const TabPanel: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div>
);
