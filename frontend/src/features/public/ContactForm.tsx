import React, { useState } from 'react';
import { Send } from 'lucide-react';
import type { AxiosError } from 'axios';
import { errorMessage } from '../../lib/api';
import { sendContact } from '../../services/site';
import { Button, TextAreaField, TextField } from '../../components/ui';
import { serverContactErrors, validateContact, type ContactErrors, type ContactValues } from './portalUtils';

const EMPTY: ContactValues = { name: '', phone: '', email: '', message: '' };

export const ContactForm: React.FC = () => {
  const [values, setValues] = useState<ContactValues>(EMPTY);
  const [trap, setTrap] = useState(''); // champ « website » : invisible, doit rester vide
  const [errors, setErrors] = useState<ContactErrors>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const set = (k: keyof ContactValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues(v => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors(er => ({ ...er, [k]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneral(null);
    const local = validateContact(values);
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setBusy(true);
    try {
      const res = await sendContact({
        name: values.name.trim(), phone: values.phone.trim(), email: values.email.trim(),
        message: values.message.trim(), website: trap,
      });
      setSent(res.detail || 'Votre demande a bien été envoyée.');
      setValues(EMPTY);
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status === 429) {
        setGeneral('Vous avez envoyé plusieurs demandes en peu de temps. Merci de patienter avant de réessayer, ou de nous joindre par téléphone.');
      } else if (status === 400) {
        const { fields, general: other } = serverContactErrors((err as AxiosError).response?.data);
        setErrors(fields);
        if (other || Object.keys(fields).length === 0) setGeneral(other ?? errorMessage(err));
      } else {
        setGeneral(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="rounded-md border border-brand-200 bg-brand-50 p-4 text-sm">
        <p className="font-medium text-brand-800">Demande envoyée</p>
        <p className="mt-1 text-slate-700">{sent}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setSent(null)}>Envoyer une autre demande</Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Demande d'information">
      {general && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{general}</p>}
      <TextField label="Nom complet" required autoComplete="name" maxLength={150} value={values.name} onChange={set('name')} error={errors.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Téléphone" type="tel" autoComplete="tel" maxLength={40} value={values.phone} onChange={set('phone')} error={errors.phone} hint="Téléphone ou e-mail obligatoire." />
        <TextField label="E-mail" type="email" autoComplete="email" maxLength={254} value={values.email} onChange={set('email')} error={errors.email} />
      </div>
      <TextAreaField label="Votre message" required rows={5} maxLength={3000} value={values.message} onChange={set('message')} error={errors.message} />
      {/* Piège à robots : hors écran, ignoré des lecteurs d'écran et de la tabulation. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Ne pas remplir ce champ
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} />
        </label>
      </div>
      <Button type="submit" loading={busy}><Send className="h-4 w-4" aria-hidden /> Envoyer la demande</Button>
    </form>
  );
};
