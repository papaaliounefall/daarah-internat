import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { useAuth } from '../../stores/authStore';
import { tabsForRole } from './tabs';

/** Paramètres : un onglet par domaine (la liste vit dans tabs/index.ts). */
export const SettingsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const role = useAuth(s => s.user?.role);
  const TABS = useMemo(() => tabsForRole(role), [role]);
  const active = TABS.find(t => t.id === params.get('onglet')) ?? TABS[0];
  if (!active) {
    return (
      <div role="alert" className="py-16 text-center">
        <p className="font-medium">Accès non autorisé</p>
        <p className="text-sm text-slate-500">Votre profil ne donne accès à aucune section des paramètres.</p>
      </div>
    );
  }
  const Active = active.component;

  const onKey = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = TABS[(index + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setParams({ onglet: next.id }, { replace: true });
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <div>
      <PageHeader title="Paramètres" description="Configuration de l'établissement." />
        <div role="tablist" aria-label="Sections des paramètres" className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t, i) => {
            const selected = t.id === active.id;
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setParams({ onglet: t.id }, { replace: true })}
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
      <div role="tabpanel" id={`panel-${active.id}`} aria-labelledby={`tab-${active.id}`}>
        <Active />
      </div>
    </div>
  );
};
