import React, { useState } from 'react';
import { FileText, Pencil, Plus, UserMinus } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { addDocument, addPosition, getStaff, leaveStaff, listDocuments, listPositions } from '../../services/staff';
import { plainErrorMessage } from '../../lib/apiErrors';
import { formatDate, formatDateTime } from '../../lib/format';
import { Badge, Button, Modal, TextField, useToast } from '../../components/ui';
import { Async } from '../../components/ops/Async';
import { STAFF_CATEGORY_LABEL, STAFF_STATUS_LABEL, type StaffMember } from '../../types/staff';
import { isoDate } from '../finance/financeUtils';
import { StaffFormModal } from './StaffFormModal';

const statusTone = (s: StaffMember['status']) => (s === 'ACTIF' ? 'success' : s === 'CONGE' ? 'warning' : 'neutral');

const Info: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div>
    <dt className="text-xs text-slate-500">{label}</dt>
    <dd className="text-sm">{value || '—'}</dd>
  </div>
);

const PositionsSection: React.FC<{ staff: StaffMember; onChanged: () => void }> = ({ staff, onChanged }) => {
  const toast = useToast();
  const state = useFetch(() => listPositions(staff.id), [staff.id, staff.roleTitle]);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState('');
  const [start, setStart] = useState(isoDate());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role.trim()) return;
    setBusy(true);
    try {
      await addPosition(staff.id, role.trim(), start, note.trim());
      toast.success('Nouvelle fonction enregistrée.');
      setAdding(false); setRole(''); setNote('');
      state.reload();
      onChanged();
    } catch (err) {
      toast.error(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Historique des fonctions">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Historique des fonctions</h3>
        {staff.status !== 'PARTI' && !adding && <Button variant="secondary" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> Changer de fonction</Button>}
      </div>
      {adding && (
        <form onSubmit={submit} className="panel mb-3 grid gap-3 p-3 sm:grid-cols-2">
          <TextField label="Nouvelle fonction" required value={role} onChange={e => setRole(e.target.value)} />
          <TextField label="À compter du" type="date" required value={start} onChange={e => setStart(e.target.value)} />
          <TextField label="Remarque" value={note} onChange={e => setNote(e.target.value)} className="sm:col-span-2" />
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>Annuler</Button>
            <Button type="submit" loading={busy} disabled={!role.trim()}>Enregistrer la fonction</Button>
          </div>
        </form>
      )}
      <Async state={state} isEmpty={d => d.length === 0} emptyTitle="Aucune fonction enregistrée">
        {rows => (
          <ul className="divide-y divide-line rounded-md border border-line">
            {rows.map(p => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span><span className="font-medium">{p.roleTitle}</span>{p.note && <span className="text-slate-500"> — {p.note}</span>}</span>
                <span className="text-xs text-slate-500">{formatDate(p.startDate)} → {p.endDate ? formatDate(p.endDate) : 'en cours'}</span>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </section>
  );
};

const DocumentsSection: React.FC<{ staff: StaffMember }> = ({ staff }) => {
  const toast = useToast();
  const state = useFetch(() => listDocuments(staff.id), [staff.id]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file) return;
    setBusy(true);
    try {
      await addDocument(staff.id, title.trim(), file);
      toast.success('Document ajouté.');
      setTitle(''); setFile(null); setInputKey(k => k + 1);
      state.reload();
    } catch (err) {
      toast.error(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Documents">
      <h3 className="mb-2 text-sm font-semibold">Documents</h3>
      <form onSubmit={submit} className="panel mb-3 grid gap-3 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField label="Intitulé du document" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. : Contrat, pièce d'identité" />
        <div>
          <label htmlFor="staff-doc" className="mb-1 block text-sm font-medium">Fichier (PDF ou image)</label>
          <input key={inputKey} id="staff-doc" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <Button type="submit" loading={busy} disabled={!title.trim() || !file}>Ajouter le document</Button>
      </form>
      <Async state={state} isEmpty={d => d.length === 0} emptyTitle="Aucun document">
        {rows => (
          <ul className="divide-y divide-line rounded-md border border-line">
            {rows.map(d => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400" aria-hidden />{d.title}</span>
                <span className="flex items-center gap-3 text-xs text-slate-500">
                  Ajouté le {formatDateTime(d.createdAt)}
                  {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline">Ouvrir</a>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Async>
      <p className="mt-2 text-xs text-slate-500">Les documents ne peuvent pas être supprimés. Le lien d'ouverture est temporaire.</p>
    </section>
  );
};

const LeaveSection: React.FC<{ staff: StaffMember; onDone: () => void; onClose: () => void }> = ({ staff, onDone, onClose }) => {
  const toast = useToast();
  const [date, setDate] = useState(isoDate());
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await leaveStaff(staff.id, date);
      toast.success(`Le départ de ${staff.fullName} est enregistré.`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="panel grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <TextField label="Date de départ" type="date" required value={date} min={staff.hireDate || undefined} onChange={e => setDate(e.target.value)}
        hint="Le dossier passe au statut « Parti » et reste consultable. Il n'est jamais supprimé." />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" variant="danger" loading={busy}>Confirmer le départ</Button>
      </div>
    </form>
  );
};

/** Dossier complet d'un membre du personnel (directeur) : informations, fonctions, documents, départ. */
export const StaffDetailModal: React.FC<{ staffId: string; onClose: () => void; onChanged: () => void }> = ({ staffId, onClose, onChanged }) => {
  const state = useFetch(() => getStaff(staffId), [staffId]);
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const s = state.data;

  return (
    <Modal title={s ? s.fullName : 'Dossier du personnel'} size="xl" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Fermer</Button>}>
      <Async state={state}>
        {m => (
          <div className="space-y-6">
            <section aria-label="Informations">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(m.status)}>{STAFF_STATUS_LABEL[m.status]}</Badge>
                  <span className="text-sm text-slate-600">{STAFF_CATEGORY_LABEL[m.category]} — {m.roleTitle}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden /> Modifier</Button>
                  {m.status !== 'PARTI' && !leaving && (
                    <Button variant="secondary" size="sm" className="text-danger" onClick={() => setLeaving(true)}><UserMinus className="h-4 w-4" aria-hidden /> Enregistrer le départ</Button>
                  )}
                </div>
              </div>
              {leaving && <div className="mb-3"><LeaveSection staff={m} onDone={() => { state.reload(); onChanged(); }} onClose={() => setLeaving(false)} /></div>}
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                <Info label="Téléphone" value={m.phone} />
                <Info label="Adresse e-mail" value={m.email} />
                <Info label="Adresse" value={m.address} />
                <Info label="Date d'entrée" value={formatDate(m.hireDate)} />
                <Info label="Date de départ" value={formatDate(m.endDate)} />
                <Info label="Compte utilisateur" value={m.userName} />
                <Info label="Pièce d'identité" value={m.idNumber} />
                <div className="sm:col-span-2 lg:col-span-3"><Info label="Notes" value={m.notes} /></div>
              </dl>
            </section>
            <PositionsSection staff={m} onChanged={() => { state.reload(); onChanged(); }} />
            <DocumentsSection staff={m} />
            {editing && <StaffFormModal member={m} onClose={() => setEditing(false)} onSaved={() => { state.reload(); onChanged(); }} />}
          </div>
        )}
      </Async>
    </Modal>
  );
};
