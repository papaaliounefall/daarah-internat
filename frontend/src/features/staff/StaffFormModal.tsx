import React, { useState } from 'react';
import { useFetch } from '../../hooks/useFetch';
import { saveStaff } from '../../services/staff';
import { getAll } from '../../services/params';
import { plainErrorMessage } from '../../lib/apiErrors';
import { Button, Modal, SelectField, TextAreaField, TextField, useToast } from '../../components/ui';
import { STAFF_CATEGORY_LABEL, STAFF_STATUS_LABEL, type StaffCategory, type StaffFormValues, type StaffMember, type StaffStatus } from '../../types/staff';
import type { ManagedUser } from '../../types/users';
import { isoDate } from '../finance/financeUtils';

export const emptyStaff = (): StaffFormValues => ({
  fullName: '', category: 'AUTRE', roleTitle: '', phone: '', email: '', address: '', hireDate: isoDate(), status: 'ACTIF', idNumber: '', notes: '', user: '',
});

export const staffToForm = (s: StaffMember): StaffFormValues => ({
  fullName: s.fullName, category: s.category, roleTitle: s.roleTitle, phone: s.phone, email: s.email ?? '', address: s.address ?? '',
  hireDate: s.hireDate ?? '', status: s.status, idNumber: s.idNumber ?? '', notes: s.notes ?? '', user: s.user ?? '',
});

/** Création / modification d'un dossier (directeur). Un changement de fonction est historisé par le serveur. */
export const StaffFormModal: React.FC<{ member: StaffMember | null; onClose: () => void; onSaved: (m: StaffMember) => void }> = ({ member, onClose, onSaved }) => {
  const toast = useToast();
  const [v, setV] = useState<StaffFormValues>(member ? staffToForm(member) : emptyStaff());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Comptes utilisateurs non parents pouvant être liés au dossier.
  const users = useFetch(() => getAll<ManagedUser>('/users/', { isActive: 'true', ordering: 'last_name' }), []);
  const set = <K extends keyof StaffFormValues>(k: K, val: StaffFormValues[K]) => setV(p => ({ ...p, [k]: val }));
  const valid = Boolean(v.fullName.trim() && v.roleTitle.trim());
  const roleChanged = member !== null && member.roleTitle !== v.roleTitle && v.roleTitle.trim() !== '';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveStaff(member?.id ?? null, { ...v, fullName: v.fullName.trim(), roleTitle: v.roleTitle.trim() });
      toast.success(member ? 'Dossier modifié.' : 'Dossier créé.');
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const linkable = (users.data ?? []).filter(u => u.role !== 'PARENT');

  return (
    <Modal title={member ? 'Modifier le dossier' : 'Nouveau dossier du personnel'} size="lg" onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" form="staff-form" loading={busy} disabled={!valid}>Enregistrer</Button>
      </>
    }>
      <form id="staff-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Nom complet" required value={v.fullName} onChange={e => set('fullName', e.target.value)} maxLength={200} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Catégorie" value={v.category} onChange={e => set('category', e.target.value as StaffCategory)}>
            {(Object.keys(STAFF_CATEGORY_LABEL) as StaffCategory[]).map(c => <option key={c} value={c}>{STAFF_CATEGORY_LABEL[c]}</option>)}
          </SelectField>
          <TextField label="Fonction" required value={v.roleTitle} onChange={e => set('roleTitle', e.target.value)} maxLength={120}
            hint={roleChanged ? "La fonction précédente sera clôturée et conservée dans l'historique." : undefined} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Téléphone" type="tel" value={v.phone} onChange={e => set('phone', e.target.value)} />
          <TextField label="Adresse e-mail" type="email" value={v.email} onChange={e => set('email', e.target.value)} />
        </div>
        <TextField label="Adresse" value={v.address} onChange={e => set('address', e.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Date d'entrée" type="date" value={v.hireDate} onChange={e => set('hireDate', e.target.value)} />
          <SelectField label="Statut" value={v.status} onChange={e => set('status', e.target.value as StaffStatus)}
            hint={member ? "Pour enregistrer un départ, utilisez l'action « Enregistrer le départ »." : undefined}>
            {(Object.keys(STAFF_STATUS_LABEL) as StaffStatus[])
              .filter(s => s !== 'PARTI' || member?.status === 'PARTI')
              .map(s => <option key={s} value={s}>{STAFF_STATUS_LABEL[s]}</option>)}
          </SelectField>
        </div>
        <TextField label="Numéro de pièce d'identité" value={v.idNumber} onChange={e => set('idNumber', e.target.value)} hint="Information sensible, visible du directeur uniquement." />
        <SelectField label="Compte utilisateur lié" value={v.user} onChange={e => set('user', e.target.value)}
          hint={users.error ? 'Liste des comptes indisponible.' : 'Facultatif : permet de rattacher un maître ou un assistant à son dossier.'}>
          <option value="">Aucun compte</option>
          {linkable.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.username})</option>)}
        </SelectField>
        <TextAreaField label="Notes" value={v.notes} onChange={e => set('notes', e.target.value)} hint="Information sensible, visible du directeur uniquement." />
      </form>
    </Modal>
  );
};
