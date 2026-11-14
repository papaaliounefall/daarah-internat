import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Async } from '../../components/ops/Async';
import { Button, ConfirmDialog, SelectField, useToast } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate } from '../../lib/format';
import { listMyChildren } from '../../services/parent';
import { acceptProposal, cancelVisit, declineProposal, listVisits } from '../../services/visits';
import { VISIT_STATUS_LABEL, type VisitRequest, type VisitStatus } from '../../types/visits';
import { VisitCard } from './VisitCard';
import { VisitRequestForm } from './VisitRequestForm';
import { effectiveSlot, formatTime, parentCanAnswerProposal, parentCanCancel } from './visitUtils';

type Pending = { kind: 'cancel' | 'accept' | 'decline'; visit: VisitRequest };

const COPY = {
  cancel: { title: 'Annuler la demande', confirm: 'Annuler la demande', danger: true },
  accept: { title: 'Accepter la proposition', confirm: 'Accepter', danger: false },
  decline: { title: 'Refuser la proposition', confirm: 'Refuser la proposition', danger: true },
} as const;

/** Vue du parent : ses demandes, leur statut, annulation et réponse aux propositions de la direction. */
export const ParentVisits: React.FC = () => {
  const toast = useToast();
  const [status, setStatus] = useState<VisitStatus | ''>('');
  const children = useFetch(listMyChildren, []);
  const visits = useFetch(() => listVisits({ status }), [status]);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const fn = pending.kind === 'cancel' ? cancelVisit : pending.kind === 'accept' ? acceptProposal : declineProposal;
      await fn(pending.visit.id);
      toast.success(pending.kind === 'cancel' ? 'Demande annulée.' : pending.kind === 'accept' ? 'Proposition acceptée : la visite est confirmée.' : 'Proposition refusée : la demande est close.');
      setPending(null);
      visits.reload();
    } catch (e) {
      toast.error(plainErrorMessage(e));
      setPending(null);
      visits.reload();
    } finally {
      setBusy(false);
    }
  };

  const noChildren = !!children.data && children.data.length === 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SelectField label="Statut" value={status} onChange={e => setStatus(e.target.value as VisitStatus | '')} className="w-56">
          <option value="">Toutes mes demandes</option>
          {(Object.keys(VISIT_STATUS_LABEL) as VisitStatus[]).map(s => <option key={s} value={s}>{VISIT_STATUS_LABEL[s]}</option>)}
        </SelectField>
        <Button onClick={() => setCreating(true)} disabled={!children.data || noChildren}>
          <Plus className="h-4 w-4" aria-hidden /> Nouvelle demande
        </Button>
      </div>

      {noChildren && (
        <p role="status" className="mb-4 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
          Aucun enfant n'est lié à votre compte : contactez la direction pour pouvoir demander une visite.
        </p>
      )}

      <Async
        state={visits}
        isEmpty={d => d.results.length === 0}
        emptyTitle={status ? 'Aucune demande avec ce statut' : "Vous n'avez fait aucune demande de visite"}
        emptyHint="Utilisez « Nouvelle demande » pour proposer un créneau à la direction."
      >
        {page => (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {page.results.map(v => (
              <VisitCard
                key={v.id}
                visit={v}
                actions={
                  <>
                    {parentCanAnswerProposal(v.status) && (
                      <>
                        <Button size="sm" onClick={() => setPending({ kind: 'accept', visit: v })}>Accepter la proposition</Button>
                        <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'decline', visit: v })}>Refuser la proposition</Button>
                      </>
                    )}
                    {parentCanCancel(v.status) && (
                      <Button size="sm" variant="secondary" onClick={() => setPending({ kind: 'cancel', visit: v })}>Annuler la demande</Button>
                    )}
                    {v.status === 'ACCEPTEE' && (
                      <p className="w-full text-xs text-slate-500">Une visite acceptée est confirmée : pour la modifier, contactez le Daara.</p>
                    )}
                  </>
                }
              />
            ))}
          </ul>
        )}
      </Async>

      {creating && children.data && <VisitRequestForm children={children.data} onClose={() => setCreating(false)} onCreated={visits.reload} />}

      {pending && (
        <ConfirmDialog
          title={COPY[pending.kind].title}
          confirmLabel={COPY[pending.kind].confirm}
          danger={COPY[pending.kind].danger}
          loading={busy}
          onConfirm={run}
          onCancel={() => setPending(null)}
          message={
            pending.kind === 'accept'
              ? <>La visite à {pending.visit.studentName} sera confirmée le {formatDate(effectiveSlot(pending.visit).date)} à {formatTime(effectiveSlot(pending.visit).time)}.</>
              : pending.kind === 'decline'
                ? <>Refuser cette proposition clôt la demande. Vous pourrez déposer une nouvelle demande.</>
                : <>Annuler votre demande de visite à {pending.visit.studentName} ? Cette action est définitive ; vous pourrez déposer une nouvelle demande.</>
          }
        />
      )}
    </div>
  );
};
