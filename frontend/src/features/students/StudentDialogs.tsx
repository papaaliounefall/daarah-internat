import React, { useState } from 'react';
import { errorMessage } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { addDocument, changeStudentStatus } from '../../services/students';
import { changeClass, enrollStudent, listClasses } from '../../services/academics';
import { Button, Modal, SelectField, Spinner, TextAreaField, TextField, useToast } from '../../components/ui';
import type { Student, StudentStatus } from '../../types';
import { DOCUMENT_KIND_LABEL, STATUS_LABEL, type DocumentKind } from '../../types/students';

const ErrorLine: React.FC<{ message: string | null }> = ({ message }) =>
  message ? <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p> : null;

/** Changement de classe d'une inscription existante, ou inscription à l'année en cours. */
export const ClassChangeModal: React.FC<{
  student: Student;
  yearId: string;
  /** null = le talibé n'a pas encore d'inscription pour cette année. */
  enrollmentId: string | null;
  currentClassId: string | null;
  onClose: () => void;
  onDone: () => void;
}> = ({ student, yearId, enrollmentId, currentClassId, onClose, onDone }) => {
  const toast = useToast();
  const classes = useFetch(() => listClasses(yearId), [yearId]);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enrolling = enrollmentId === null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrolling && !target) { setError('Choisissez la nouvelle classe.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (enrolling) await enrollStudent(student.id, yearId, target || null);
      else await changeClass(enrollmentId, target, reason.trim());
      toast.success(enrolling ? 'Inscription enregistrée.' : 'Changement de classe enregistré.');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={enrolling ? "Inscrire pour l'année en cours" : 'Changer de classe'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="class-change-form" loading={busy}>{enrolling ? "Inscrire" : 'Changer de classe'}</Button>
        </>
      }
    >
      <form id="class-change-form" onSubmit={submit} className="space-y-3">
        <ErrorLine message={error} />
        {classes.loading ? <Spinner /> : classes.error ? <p className="text-sm text-danger">{classes.error}</p> : (
          <>
            <SelectField label="Classe" required={!enrolling} value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">{enrolling ? 'Sans classe pour l\'instant' : 'Choisir une classe'}</option>
              {classes.data!.filter(c => c.id !== currentClassId).map(c => (
                <option key={c.id} value={c.id} disabled={c.enrolledCount >= c.capacity}>
                  {c.name}{c.teacherName ? ` — ${c.teacherName}` : ''} ({c.enrolledCount}/{c.capacity}{c.enrolledCount >= c.capacity ? ', complète' : ''})
                </option>
              ))}
            </SelectField>
            {!enrolling && <TextAreaField label="Motif (facultatif)" value={reason} onChange={e => setReason(e.target.value)} hint="Conservé dans l'historique des classes." />}
          </>
        )}
      </form>
    </Modal>
  );
};

/** Changement de statut social / payant (directeur) : historisé côté serveur. */
export const StatusChangeModal: React.FC<{ student: Student; onClose: () => void; onDone: () => void }> = ({ student, onClose, onDone }) => {
  const toast = useToast();
  const next: StudentStatus = student.status === 'PAYANT' ? 'SOCIAL' : 'PAYANT';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setError('Indiquez le motif du changement.'); return; }
    setBusy(true);
    setError(null);
    try {
      await changeStudentStatus(student.id, next, reason.trim());
      toast.success(`Statut modifié : ${STATUS_LABEL[next]}.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Changer le statut"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="status-form" loading={busy}>Confirmer le changement</Button>
        </>
      }
    >
      <form id="status-form" onSubmit={submit} className="space-y-3">
        <ErrorLine message={error} />
        <p className="text-sm text-slate-700">
          {student.fullName} passe de <strong>{STATUS_LABEL[student.status]}</strong> à <strong>{STATUS_LABEL[next]}</strong>.
          Le changement est conservé dans l'historique du dossier.
        </p>
        <TextAreaField label="Motif" required value={reason} onChange={e => setReason(e.target.value)} />
      </form>
    </Modal>
  );
};

const DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

export const DocumentModal: React.FC<{ student: Student; onClose: () => void; onDone: () => void }> = ({ student, onClose, onDone }) => {
  const toast = useToast();
  const [kind, setKind] = useState<DocumentKind>('EXTRAIT_NAISSANCE');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && !DOC_TYPES.includes(f.type)) { setError('Format non autorisé : PDF, JPG, PNG ou WebP.'); setFile(null); return; }
    setError(null);
    setFile(f);
    if (f && !title) setTitle(DOCUMENT_KIND_LABEL[kind]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Choisissez un fichier.'); return; }
    if (!title.trim()) { setError('Donnez un intitulé au document.'); return; }
    setBusy(true);
    setError(null);
    try {
      await addDocument(student.id, kind, title.trim(), file);
      toast.success('Document ajouté au dossier.');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Ajouter un document"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="doc-form" loading={busy}>Ajouter</Button>
        </>
      }
    >
      <form id="doc-form" onSubmit={submit} className="space-y-3">
        <ErrorLine message={error} />
        <SelectField label="Type de document" value={kind} onChange={e => setKind(e.target.value as DocumentKind)}>
          {(Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[]).map(k => <option key={k} value={k}>{DOCUMENT_KIND_LABEL[k]}</option>)}
        </SelectField>
        <TextField label="Intitulé" required value={title} onChange={e => setTitle(e.target.value)} />
        <div>
          <label htmlFor="doc-file" className="mb-1 block text-sm font-medium">Fichier <span className="text-danger" aria-hidden>*</span></label>
          <input id="doc-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={pick} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm" />
          <p className="mt-1 text-xs text-slate-500">PDF, JPG, PNG ou WebP.</p>
        </div>
      </form>
    </Modal>
  );
};
