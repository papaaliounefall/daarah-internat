import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Async } from '../../components/ops/Async';
import { Button, useToast } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDateTime } from '../../lib/format';
import { listUnreadNotifications, markAllNotificationsRead } from '../../services/parent';

/** Notifications non lues (les 5 plus récentes) ; « Tout marquer comme lu » appelle le serveur. */
export const ParentNotifications: React.FC = () => {
  const toast = useToast();
  const state = useFetch(listUnreadNotifications, []);
  const [busy, setBusy] = useState(false);

  const readAll = async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      state.reload();
    } catch (e) {
      toast.error(plainErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Rien à signaler : pas de bloc inutile en tête de page.
  if (state.data && state.data.count === 0) return null;
  if (!state.data && state.loading) return null;

  return (
    <section className="panel mb-4 p-4" aria-label="Notifications non lues">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">
          Notifications non lues{state.data ? ` (${state.data.count})` : ''}
        </h2>
        <Button variant="ghost" size="sm" loading={busy} onClick={readAll}>Tout marquer comme lu</Button>
      </div>
      <Async state={state} isEmpty={d => d.results.length === 0}>
        {page => (
          <ul className="mt-2 divide-y divide-line">
            {page.results.map(n => (
              <li key={n.id} className="py-2 text-sm">
                <p className="font-medium text-ink">
                  {n.kind === 'VISITE' ? <Link to="/app/visites" className="underline">{n.title}</Link> : n.title}
                </p>
                <p className="text-slate-600">{n.message}</p>
                <p className="text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </section>
  );
};
