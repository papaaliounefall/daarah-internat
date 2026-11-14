import React, { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { assignStudent, changeRoom, listRooms } from '../../services/boarding';
import { plainErrorMessage } from '../../lib/apiErrors';
import { Button, Modal, SelectField, TextAreaField, TextField, useToast } from '../../components/ui';
import { StudentSelect, type PickedStudent } from '../../components/ops/StudentSelect';
import { Async } from '../../components/ops/Async';
import type { BoardingAssignment } from '../../types/boarding';
import { assignableRooms, roomOptionLabel } from './boardingUtils';

interface Props {
  /** Affectation active à déplacer : mode « changement de chambre ». Absente : première affectation. */
  current?: BoardingAssignment;
  onClose: () => void;
  onSaved: () => void;
}

/** Première affectation ou changement de chambre ; l'historique est conservé par le serveur. */
export const AssignModal: React.FC<Props> = ({ current, onClose, onSaved }) => {
  const toast = useToast();
  const changing = Boolean(current);
  const rooms = useFetch(() => listRooms({ isActive: 'true' }), []);
  const [student, setStudent] = useState<PickedStudent | null>(
    current ? { id: current.student, fullName: current.studentName, registrationNumber: current.registrationNumber } : null,
  );
  const [room, setRoom] = useState('');
  const [bed, setBed] = useState(current?.bedNumber ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !room) return;
    setBusy(true);
    setError(null);
    try {
      const input = { student: student.id, room, bedNumber: bed.trim(), note: note.trim() };
      if (changing) await changeRoom(input); else await assignStudent(input);
      toast.success(changing ? `${student.fullName} change de chambre.` : `${student.fullName} est affecté à l'internat.`);
      onSaved();
      onClose();
    } catch (err) {
      // Chambre complète, talibé déjà affecté, lit pris… : messages français du serveur, affichés tels quels.
      const msg = plainErrorMessage(err);
      setError(msg);
      toast.error(msg);
      rooms.reload(); // l'occupation a pu changer entre-temps
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={changing ? 'Changer de chambre' : 'Affecter un talibé à une chambre'} onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="assign-form" loading={busy} disabled={!student || !room}>{changing ? 'Changer de chambre' : "Affecter à la chambre"}</Button>
      </>
    }>
      <form id="assign-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <StudentSelect value={student} onChange={setStudent} required disabled={changing} accept={s => !s.isArchived} />
        {changing && current && <p className="text-sm text-slate-600">Chambre actuelle : {current.buildingName} — {current.roomLabel}{current.bedNumber ? `, lit ${current.bedNumber}` : ''}.</p>}
        <Async state={rooms} isEmpty={d => assignableRooms(d).length === 0 && !d.some(r => changing && r.id === current?.room)} emptyTitle="Aucune chambre disponible" emptyHint="Toutes les chambres actives sont complètes, ou aucune chambre n'existe.">
          {all => {
            const options = changing ? all.filter(r => r.isActive && (r.freePlaces > 0 || r.id === current?.room)) : assignableRooms(all);
            return (
              <SelectField label={changing ? 'Nouvelle chambre' : 'Chambre'} required value={room} onChange={e => setRoom(e.target.value)} hint="Seules les chambres actives avec une place libre sont proposées.">
                <option value="">Choisir une chambre…</option>
                {options.map(r => <option key={r.id} value={r.id}>{roomOptionLabel(r)}</option>)}
              </SelectField>
            );
          }}
        </Async>
        <TextField label="Numéro de lit (facultatif)" value={bed} onChange={e => setBed(e.target.value)} maxLength={10} />
        <TextAreaField label={changing ? 'Motif du changement' : 'Remarque'} value={note} onChange={e => setNote(e.target.value)} rows={2} />
      </form>
    </Modal>
  );
};
