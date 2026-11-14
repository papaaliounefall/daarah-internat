import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Badge } from '../../components/ui';
import { formatDate, formatDateTime } from '../../lib/format';
import { VISIT_STATUS_LABEL, type VisitRequest } from '../../types/visits';
import { STATUS_TONE, effectiveSlot, formatTime } from './visitUtils';

interface Props {
  visit: VisitRequest;
  /** Administration : affiche le parent demandeur. */
  showGuardian?: boolean;
  actions?: React.ReactNode;
}

/** Une demande de visite : enfant, créneau, statut, réponse de l'administration. */
export const VisitCard: React.FC<Props> = ({ visit, showGuardian, actions }) => {
  const slot = effectiveSlot(visit);
  const proposalPending = visit.status === 'MODIFICATION_PROPOSEE' && visit.proposedDate;
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink">Visite à {visit.studentName}</p>
          {showGuardian && <p className="text-sm text-slate-600">Demandée par {visit.guardianName}</p>}
        </div>
        <Badge tone={STATUS_TONE[visit.status]}>{VISIT_STATUS_LABEL[visit.status]}</Badge>
      </div>

      <p className="mt-2 flex items-center gap-2 text-sm text-ink">
        <CalendarClock className="h-4 w-4 text-slate-400" aria-hidden />
        <span>
          {visit.status === 'ACCEPTEE' || proposalPending ? slot.label : 'Créneau demandé'} : <strong>{formatDate(slot.date)} à {formatTime(slot.time)}</strong>
        </span>
      </p>
      {proposalPending && (
        <p className="ml-6 text-xs text-slate-500">Créneau initialement demandé : {formatDate(visit.requestedDate)} à {formatTime(visit.requestedTime)}</p>
      )}
      {visit.status === 'ACCEPTEE' && (visit.confirmedDate !== visit.requestedDate || visit.confirmedTime !== visit.requestedTime) && (
        <p className="ml-6 text-xs text-slate-500">Créneau initialement demandé : {formatDate(visit.requestedDate)} à {formatTime(visit.requestedTime)}</p>
      )}

      {visit.message && <p className="mt-2 text-sm text-slate-700"><span className="font-medium">Message :</span> {visit.message}</p>}
      {visit.adminNote && (
        <p className={`mt-2 rounded-md px-3 py-2 text-sm ${visit.status === 'REFUSEE' ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700'}`}>
          <span className="font-medium">{visit.status === 'REFUSEE' ? 'Motif du refus :' : 'Note du Daara :'}</span> {visit.adminNote}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">
        Demande du {formatDateTime(visit.createdAt)}
        {visit.decidedByName && visit.decisionDate ? ` · traitée par ${visit.decidedByName}` : ''}
      </p>

      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </li>
  );
};
