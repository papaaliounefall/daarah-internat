import React, { useState } from 'react';
import { Button, Modal, SelectField, TextAreaField, TextField, useToast } from '../../components/ui';
import { plainErrorMessage } from '../../lib/apiErrors';
import { createVisit } from '../../services/visits';
import type { Student } from '../../types';
import { todayIso, validateVisit } from './visitUtils';

interface Props {
  children: Student[];
  onClose: () => void;
  onCreated: () => void;
}

/** Nouvelle demande de visite par un parent : enfant, date non passée, heure, message facultatif. */
export const VisitRequestForm: React.FC<Props> = ({ children, onClose, onCreated }) => {
  const toast = useToast();
  const [student, setStudent] = useState(children.length === 1 ? children[0].id : '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = validateVisit({ student, date, time });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShow(true);
    if (Object.keys(errors).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await createVisit({ student, requestedDate: date, requestedTime: time, message: message.trim() });
      toast.success("Demande envoyée. Vous serez prévenu dès qu'elle sera traitée.");
      onCreated();
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
      title="Demander une visite"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="visit-form" loading={busy}>Envoyer la demande</Button>
        </>
      }
    >
      <form id="visit-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <SelectField label="Enfant à visiter" required value={student} onChange={e => setStudent(e.target.value)} error={show ? errors.student : undefined}>
          <option value="">Choisir un enfant</option>
          {children.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
        </SelectField>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Date souhaitée" type="date" required min={todayIso()} value={date} onChange={e => setDate(e.target.value)} error={show ? errors.date : undefined} />
          <TextField label="Heure" type="time" required value={time} onChange={e => setTime(e.target.value)} error={show ? errors.time : undefined} />
        </div>
        <TextAreaField label="Message (facultatif)" rows={3} maxLength={500} value={message} onChange={e => setMessage(e.target.value)} hint="Précisez par exemple le nombre de visiteurs." />
        <p className="text-xs text-slate-500">La direction peut accepter, refuser ou proposer un autre créneau. Vous en serez informé par notification.</p>
      </form>
    </Modal>
  );
};
