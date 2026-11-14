import React, { useState } from 'react';
import { Async, FilterBar } from '../../components/ops/Async';
import { ReasonDialog } from '../../components/ops/ReasonDialog';
import { Pagination } from '../../components/ui/Pagination';
import { Button, Modal, SelectField, TextAreaField, TextField, useToast } from '../../components/ui';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useFetch } from '../../hooks/useFetch';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate } from '../../lib/format';
import { acceptVisit, listVisits, proposeVisit, refuseVisit } from '../../services/visits';
import { VISIT_STATUS_LABEL, type VisitRequest, type VisitStatus } from '../../types/visits';
import { VisitCard } from './VisitCard';
import { adminActions, effectiveSlot, formatTime, isSlotPast, todayIso } from './visitUtils';

const PAGE_SIZE = 20;

type Dialog = { kind: 'accept' | 'refuse' | 'propose'; visit: VisitRequest };

/** Modal « Proposer une autre date / heure ». */
const ProposeDialog: React.FC<{ visit: VisitRequest; onClose: () => void; onDone: () => void }> = ({ visit, onClose, onDone }) => {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateError = !date ? 'Choisissez une date.' : date < todayIso() ? 'La date ne peut pas être dans le passé.' : undefined;
  const timeError = !time ? 'Indiquez une heure.' : !dateError && isSlotPast(date, time) ? 'Ce créneau est déjà passé.' : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShow(true);
    if (dateError || timeError) return;
    setBusy(true);
    setError(null);
    try {
      await proposeVisit(visit.id, date, time, note.trim() || undefined);
      toast.success('Proposition envoyée au parent.');
      onDone();
      onClose();
    } catch (err) {
      const msg = plainErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Proposer un autre créneau"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Retour</Button>
          <Button type="submit" form="propose-form" loading={busy}>Envoyer la proposition</Button>
        </>
      }
    >
      <form id="propose-form" onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-slate-600">
          Visite à {visit.studentName}, demandée par {visit.guardianName} pour le {formatDate(visit.requestedDate)} à {formatTime(visit.requestedTime)}.
        </p>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Nouvelle date" type="date" required min={todayIso()} value={date} onChange={e => setDate(e.target.value)} error={show ? dateError : undefined} />
          <TextField label="Nouvelle heure" type="time" required value={time} onChange={e => setTime(e.target.value)} error={show ? timeError : undefined} />
        </div>
        <TextAreaField label="Message pour le parent (facultatif)" rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
      </form>
    </Modal>
  );
};

/** Vue de la direction : traitement des demandes (accepter, refuser avec motif, proposer un autre créneau). */
export const AdminVisits: React.FC = () => {
  const toast = useToast();
  const [status, setStatus] = useState<VisitStatus | ''>('EN_ATTENTE');
  const [dateAfter, setDateAfter] = useState('');
  const [dateBefore, setDateBefore] = useState('');
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const state = useFetch(() => listVisits({ status, dateAfter, dateBefore, search: dSearch }, page, PAGE_SIZE), [status, dateAfter, dateBefore, dSearch, page]);
  const reset = () => setPage(1);

  const accept = async (note: string) => {
    await acceptVisit(dialog!.visit.id, note || undefined);
    toast.success('Visite acceptée. Le parent est prévenu.');
    state.reload();
  };
  const refuse = async (reason: string) => {
    await refuseVisit(dialog!.visit.id, reason);
    toast.success('Visite refusée. Le parent est prévenu.');
    state.reload();
  };

  return (
    <div>
      <FilterBar>
        <SelectField label="Statut" value={status} onChange={e => { setStatus(e.target.value as VisitStatus | ''); reset(); }}>
          <option value="">Tous</option>
          {(Object.keys(VISIT_STATUS_LABEL) as VisitStatus[]).map(s => <option key={s} value={s}>{VISIT_STATUS_LABEL[s]}</option>)}
        </SelectField>
        <TextField label="Visites à partir du" type="date" value={dateAfter} onChange={e => { setDateAfter(e.target.value); reset(); }} />
        <TextField label="Jusqu'au" type="date" value={dateBefore} min={dateAfter || undefined} onChange={e => { setDateBefore(e.target.value); reset(); }} />
        <TextField label="Recherche" type="search" placeholder="Enfant ou parent" value={search} onChange={e => { setSearch(e.target.value); reset(); }} />
      </FilterBar>

      <Async
        state={state}
        isEmpty={d => d.results.length === 0}
        emptyTitle={status === 'EN_ATTENTE' ? 'Aucune demande en attente' : 'Aucune demande trouvée'}
        emptyHint="Les nouvelles demandes des parents apparaissent ici et dans vos notifications."
      >
        {data => (
          <>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {data.results.map(v => {
                const a = adminActions(v.status);
                return (
                  <VisitCard
                    key={v.id}
                    visit={v}
                    showGuardian
                    actions={
                      <>
                        {a.accept && <Button size="sm" onClick={() => setDialog({ kind: 'accept', visit: v })}>Accepter</Button>}
                        {a.propose && <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'propose', visit: v })}>Proposer un autre créneau</Button>}
                        {a.refuse && <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'refuse', visit: v })}>Refuser</Button>}
                      </>
                    }
                  />
                );
              })}
            </ul>
            <div className="panel mt-4"><Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} /></div>
          </>
        )}
      </Async>

      {dialog?.kind === 'accept' && (
        <ReasonDialog
          title="Accepter la visite" danger={false} required={false} label="Note pour le parent (facultatif)" confirmLabel="Accepter la visite"
          message={<>Visite à {dialog.visit.studentName} le {formatDate(effectiveSlot(dialog.visit).date)} à {formatTime(effectiveSlot(dialog.visit).time)}. Le parent sera prévenu.</>}
          onConfirm={accept} onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'refuse' && (
        <ReasonDialog
          title="Refuser la visite" label="Motif du refus" confirmLabel="Refuser la visite"
          message={<>Le motif sera communiqué au parent ({dialog.visit.guardianName}).</>}
          onConfirm={refuse} onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'propose' && <ProposeDialog visit={dialog.visit} onClose={() => setDialog(null)} onDone={state.reload} />}
    </div>
  );
};
