import React from 'react';
import type { FetchState } from '../../hooks/useFetch';
import { EmptyState, ErrorState, Spinner } from '../ui';

interface Props<T> {
  state: FetchState<T>;
  isEmpty?: (data: T) => boolean;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}

/** Chargement / erreur / vide / contenu : les quatre états d'une liste en un seul endroit. */
export function Async<T>({ state, isEmpty, emptyTitle = 'Aucun élément', emptyHint, emptyAction, children }: Props<T>) {
  const { data, loading, error, reload } = state;
  if (error && data === undefined) return <ErrorState message={error} onRetry={reload} />;
  if (data === undefined) return <Spinner />;
  if (isEmpty?.(data)) return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />;
  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''} aria-busy={loading}>
      {error && <p role="alert" className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {children(data)}
    </div>
  );
}

/** Tableau avec défilement horizontal maîtrisé sur petit écran. */
export const TableWrap: React.FC<{ children: React.ReactNode; footer?: React.ReactNode }> = ({ children, footer }) => (
  <div className="panel overflow-hidden">
    <div className="overflow-x-auto">{children}</div>
    {footer}
  </div>
);

/** Indicateur chiffré simple (pas de carte décorative). */
export const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string; tone?: 'default' | 'danger' | 'success' }> = ({ label, value, hint, tone = 'default' }) => (
  <div className="panel px-4 py-3">
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-brand-700' : 'text-ink'}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
  </div>
);

/** Barre de filtres alignée, repliable sur mobile. */
export const FilterBar: React.FC<{ children: React.ReactNode; actions?: React.ReactNode }> = ({ children, actions }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div className="flex flex-wrap items-end gap-3">{children}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);
