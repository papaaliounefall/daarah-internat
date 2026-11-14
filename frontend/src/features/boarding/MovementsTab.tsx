import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listBoardingMovements, listCurrentlyOut, recordMovement } from '../../services/boarding';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDateTime } from '../../lib/format';
import { Badge, Button, ConfirmDialog, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { Async, FilterBar, TableWrap } from '../../components/ops/Async';
import { StudentSelect, type PickedStudent } from '../../components/ops/StudentSelect';
import { BOARDING_KIND_LABEL, type BoardingMovementKind, type CurrentlyOut } from '../../types/boarding';
import { expectedReturnError, nowLocalInput } from './boardingUtils';

const PAGE_SIZE = 20;

const MovementModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [kind, setKind] = useState<BoardingMovementKind>('SORTIE');
  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [reason, setReason] = useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnError = kind === 'SORTIE' ? expectedReturnError(occurredAt, expectedReturn) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || returnError) return;
    setBusy(true);
    setError(null);
    try {
      await recordMovement({ student: student.id, kind, occurredAt, reason: reason.trim(), expectedReturn: kind === 'SORTIE' ? expectedReturn : undefined });
      toast.success(`${BOARDING_KIND_LABEL[kind]} de ${student.fullName} enregistrée.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Enregistrer une entrée ou une sortie" onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="boarding-movement-form" loading={busy} disabled={!student || Boolean(returnError)}>Enregistrer le mouvement</Button>
      </>
    }>
      <form id="boarding-movement-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <StudentSelect value={student} onChange={setStudent} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Mouvement" value={kind} onChange={e => setKind(e.target.value as BoardingMovementKind)}>
            <option value="SORTIE">Sortie de l'internat</option>
            <option value="ENTREE">Retour à l'internat</option>
          </SelectField>
          <TextField label="Date et heure" type="datetime-local" required value={occurredAt} max={nowLocalInput()} onChange={e => setOccurredAt(e.target.value)} />
        </div>
        {kind === 'SORTIE' && (
          <TextField label="Retour prévu (facultatif)" type="datetime-local" value={expectedReturn} min={occurredAt} onChange={e => setExpectedReturn(e.target.value)} error={returnError ?? undefined} />
        )}
        <TextField label="Motif" value={reason} onChange={e => setReason(e.target.value)} placeholder={kind === 'SORTIE' ? 'Ex. : visite familiale, rendez-vous médical' : 'Ex. : retour de permission'} maxLength={255} />
        <p className="text-xs text-slate-500">Le talibé doit être logé à l'internat. Un mouvement enregistré ne se modifie pas.</p>
      </form>
    </Modal>
  );
};

/** Entrées / sorties : talibés actuellement sortis, puis historique des mouvements. */
export const BoardingMovementsTab: React.FC = () => {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const dSearch = useDebouncedValue(search);
  const [kind, setKind] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [returning, setReturning] = useState<CurrentlyOut | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPage(1); }, [dSearch, kind, dateFrom, dateTo]);

  const out = useFetch(listCurrentlyOut, []);
  const list = useFetch(() => listBoardingMovements({ page, pageSize: PAGE_SIZE, search: dSearch, kind, dateFrom, dateTo }), [page, dSearch, kind, dateFrom, dateTo]);
  const reload = () => { out.reload(); list.reload(); };

  const confirmReturn = async () => {
    if (!returning) return;
    setBusy(true);
    try {
      await recordMovement({ student: returning.student, kind: 'ENTREE', reason: 'Retour à l\'internat' });
      toast.success(`Retour de ${returning.studentName} enregistré.`);
      setReturning(null);
      reload();
    } catch (e) {
      toast.error(plainErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();
  return (
    <div className="space-y-6">
      <section aria-label="Actuellement sortis">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Actuellement sortis</h2>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Enregistrer une entrée ou une sortie</Button>
        </div>
        <Async state={out} isEmpty={d => d.length === 0} emptyTitle="Aucun talibé hors de l'internat" emptyHint="Tous les talibés logés sont présents.">
          {rows => (
            <TableWrap>
              <table className="table-base min-w-[40rem]">
                <thead><tr><th>Talibé</th><th>Chambre</th><th>Sorti le</th><th>Retour prévu</th><th>Motif</th><th><span className="sr-only">Action</span></th></tr></thead>
                <tbody>
                  {rows.map(r => {
                    const late = r.expectedReturn !== null && new Date(r.expectedReturn).getTime() < now;
                    return (
                      <tr key={r.student}>
                        <td><div className="font-medium">{r.studentName}</div><div className="font-mono text-xs text-slate-500">{r.registrationNumber}</div></td>
                        <td>{r.roomLabel}</td>
                        <td className="whitespace-nowrap">{formatDateTime(r.since) || '—'}</td>
                        <td className="whitespace-nowrap">{formatDateTime(r.expectedReturn) || '—'}{late && <div><Badge tone="danger">Retour dépassé</Badge></div>}</td>
                        <td>{r.reason || '—'}</td>
                        <td className="text-right"><Button variant="ghost" size="sm" onClick={() => setReturning(r)}>Enregistrer le retour</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Async>
      </section>

      <section aria-label="Historique des mouvements">
        <h2 className="mb-2 text-base font-semibold">Historique des mouvements</h2>
        <FilterBar>
          <TextField label="Recherche" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Talibé, matricule, motif" className="min-w-52" />
          <SelectField label="Type" value={kind} onChange={e => setKind(e.target.value)}>
            <option value="">Tous</option><option value="SORTIE">Sorties</option><option value="ENTREE">Entrées</option>
          </SelectField>
          <TextField label="Du" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <TextField label="Au" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </FilterBar>
        <Async state={list} isEmpty={d => d.results.length === 0} emptyTitle="Aucun mouvement" emptyHint="Aucune entrée ou sortie ne correspond à ces critères.">
          {data => (
            <TableWrap footer={<Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPage={setPage} />}>
              <table className="table-base min-w-[44rem]">
                <thead><tr><th>Date et heure</th><th>Talibé</th><th>Mouvement</th><th>Motif</th><th>Retour prévu</th><th>Saisi par</th></tr></thead>
                <tbody>
                  {data.results.map(m => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{formatDateTime(m.occurredAt)}</td>
                      <td><div className="font-medium">{m.studentName}</div><div className="font-mono text-xs text-slate-500">{m.registrationNumber}</div></td>
                      <td><Badge tone={m.kind === 'SORTIE' ? 'warning' : 'success'}>{BOARDING_KIND_LABEL[m.kind]}</Badge></td>
                      <td>{m.reason || '—'}</td>
                      <td className="whitespace-nowrap">{formatDateTime(m.expectedReturn) || '—'}</td>
                      <td>{m.recordedByName || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Async>
      </section>

      {creating && <MovementModal onClose={() => setCreating(false)} onSaved={reload} />}
      {returning && (
        <ConfirmDialog
          title="Enregistrer le retour"
          message={<>Confirmer le retour de <strong>{returning.studentName}</strong> à l'internat, à l'heure actuelle ?</>}
          confirmLabel="Enregistrer le retour"
          loading={busy}
          onConfirm={() => void confirmReturn()}
          onCancel={() => setReturning(null)}
        />
      )}
    </div>
  );
};
