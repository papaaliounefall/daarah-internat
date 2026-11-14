import React, { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { createParentAccount, createUser, updateUser, type UserInput } from '../../services/users';
import { Button, Modal, SelectField, TextField, useToast } from '../../components/ui';
import { ROLE_LABEL } from '../../app/navigation';
import { useAuth } from '../../stores/authStore';
import type { Role } from '../../types';
import { RELATION_LABEL, type ManagedUser, type Relation } from '../../types/users';
import { StudentPicker, type PickedStudent } from './StudentPicker';
import { creatableRoles, generatePassword, suggestUsername } from './usersUtils';

interface Props {
  actorRole: Role;
  /** null = création. */
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: () => void;
}

export const UserFormModal: React.FC<Props> = ({ actorRole, user, onClose, onSaved }) => {
  const toast = useToast();
  const me = useAuth(s => s.user);
  const creating = user === null;
  const editingSelf = !creating && me?.id === user.id;
  const isDirector = actorRole === 'DIRECTEUR';
  const roles = creatableRoles(actorRole);

  const [username, setUsername] = useState(user?.username ?? '');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? roles[0] ?? 'PARENT');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [canViewFinance, setCanViewFinance] = useState(user?.canViewFinance ?? false);
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [children, setChildren] = useState<PickedStudent[]>([]);
  const [relation, setRelation] = useState<Relation>('PERE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentCreation = creating && role === 'PARENT';

  const onName = (setter: (v: string) => void, which: 'first' | 'last') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    if (creating && !usernameTouched) {
      const f = which === 'first' ? e.target.value : firstName;
      const l = which === 'last' ? e.target.value : lastName;
      setUsername(suggestUsername(f, l));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) { setError('Le prénom est obligatoire.'); return; }
    if (creating && !username.trim()) { setError("L'identifiant est obligatoire."); return; }
    if (creating && !password) { setError('Un mot de passe initial est requis.'); return; }
    if (parentCreation && children.length === 0) { setError('Rattachez le compte parent à au moins un enfant.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (parentCreation) {
        await createParentAccount({
          username: username.trim(), firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(),
          email: email.trim(), password, students: children.map(c => c.id), relation,
        });
        toast.success(`Compte parent créé et rattaché à ${children.length} enfant${children.length > 1 ? 's' : ''}.`);
      } else if (creating) {
        const body: UserInput = {
          username: username.trim(), firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(),
          phone: phone.trim(), role, password,
        };
        if (isDirector && role === 'ASSISTANT') body.canViewFinance = canViewFinance;
        await createUser(body);
        toast.success('Compte créé. Communiquez-lui son identifiant et son mot de passe initial.');
      } else {
        const body: Partial<UserInput> = { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() };
        if (password) body.password = password;
        if (isDirector) {
          if (!editingSelf) body.role = role;
          body.canViewFinance = role === 'ASSISTANT' ? canViewFinance : false;
          if (!editingSelf) body.isActive = isActive;
        }
        await updateUser(user.id, body);
        toast.success('Compte mis à jour.');
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={creating ? 'Nouveau compte' : `Modifier ${user.fullName}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="user-form" loading={busy}>{creating ? 'Créer le compte' : 'Enregistrer'}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Prénom" required value={firstName} onChange={onName(setFirstName, 'first')} autoComplete="off" />
          <TextField label="Nom" value={lastName} onChange={onName(setLastName, 'last')} autoComplete="off" />
          <TextField
            label="Identifiant de connexion" required={creating} value={username} disabled={!creating}
            onChange={e => { setUsername(e.target.value); setUsernameTouched(true); }} autoComplete="off"
            hint={creating ? 'Sans espace. Proposé à partir du nom, modifiable.' : "L'identifiant ne peut pas être modifié."}
          />
          <SelectField label="Rôle" value={role} onChange={e => setRole(e.target.value as Role)} disabled={(!isDirector && !creating) || editingSelf}
            hint={!isDirector ? 'Vous pouvez uniquement gérer des comptes parents.' : editingSelf ? 'Vous ne pouvez pas modifier votre propre rôle.' : undefined}>
            {(isDirector ? roles : creating ? roles : [role]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </SelectField>
          <TextField label="Courriel" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
          <TextField label="Téléphone" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="off" />
        </div>

        <div>
          <TextField
            label={creating ? 'Mot de passe initial' : 'Nouveau mot de passe (facultatif)'}
            required={creating}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            hint="Au moins 10 caractères, pas trop courant."
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}>
              <Wand2 className="h-4 w-4" aria-hidden /> Générer un mot de passe
            </Button>
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} /> Afficher
            </label>
          </div>
          <p className="mt-2 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-xs text-gold-700">
            {creating ? "Notez ce mot de passe : il ne sera plus affichable. " : ''}
            La personne devra le remplacer par un mot de passe personnel dès sa prochaine connexion.
          </p>
        </div>

        {parentCreation && (
          <div className="space-y-3 rounded-md border border-line p-3">
            <StudentPicker selected={children} onChange={setChildren} label="Enfants rattachés" />
            <SelectField label="Lien avec les enfants" value={relation} onChange={e => setRelation(e.target.value as Relation)}>
              {(Object.keys(RELATION_LABEL) as Relation[]).map(r => <option key={r} value={r}>{RELATION_LABEL[r]}</option>)}
            </SelectField>
          </div>
        )}
        {!creating && user.role === 'PARENT' && (
          <p className="text-xs text-slate-500">Les enfants rattachés se gèrent depuis le bouton « Enfants » de la liste.</p>
        )}

        {isDirector && role === 'ASSISTANT' && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={canViewFinance} onChange={e => setCanViewFinance(e.target.checked)} />
            <span>
              <span className="font-medium">Accès aux finances</span>
              <span className="block text-xs text-slate-500">Autorise cet assistant à consulter et enregistrer les opérations financières.</span>
            </span>
          </label>
        )}
        {isDirector && !creating && !editingSelf && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            <span>
              <span className="font-medium">Compte actif</span>
              <span className="block text-xs text-slate-500">Un compte désactivé ne peut plus se connecter ; son historique est conservé.</span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
};
