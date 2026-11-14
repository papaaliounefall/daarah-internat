import React, { useState } from 'react';
import { http, errorMessage } from '../../lib/api';
import { useAuth } from '../../stores/authStore';
import { Button, PageHeader, TextField, useToast } from '../../components/ui';
import { ROLE_LABEL } from '../../app/navigation';

export const ProfilePage: React.FC = () => {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const mismatch = confirm.length > 0 && confirm !== newPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirm) return;
    setBusy(true);
    setError(null);
    try {
      await http.post('/auth/change-password/', { oldPassword, newPassword });
      setUser({ ...user, mustChangePassword: false });
      setOld(''); setNew(''); setConfirm('');
      toast.success('Mot de passe modifié.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Mon profil" description={`${user.fullName} — ${ROLE_LABEL[user.role]}`} />
      {user.mustChangePassword && (
        <p role="alert" className="mb-4 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
          Pour la sécurité de votre compte, vous devez choisir un nouveau mot de passe avant de continuer.
        </p>
      )}
      <form onSubmit={submit} className="panel max-w-md space-y-4 p-5">
        <h2 className="text-base font-semibold">Changer de mot de passe</h2>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Mot de passe actuel" type="password" autoComplete="current-password" required value={oldPassword} onChange={e => setOld(e.target.value)} />
        <TextField label="Nouveau mot de passe" type="password" autoComplete="new-password" required hint="Au moins 10 caractères, pas trop courant." value={newPassword} onChange={e => setNew(e.target.value)} />
        <TextField label="Confirmer le nouveau mot de passe" type="password" autoComplete="new-password" required error={mismatch ? 'Les mots de passe ne correspondent pas.' : undefined} value={confirm} onChange={e => setConfirm(e.target.value)} />
        <Button type="submit" loading={busy} disabled={!oldPassword || !newPassword || mismatch}>Enregistrer</Button>
      </form>
    </div>
  );
};
