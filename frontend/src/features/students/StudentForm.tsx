import React, { useEffect, useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { saveStudent } from '../../services/students';
import { Button, Field, Modal, SelectField, TextAreaField, TextField, useToast } from '../../components/ui';
import type { ClassRoom, Student } from '../../types';
import { STATUS_LABEL, type StudentFormValues } from '../../types/students';
import { initials } from '../../lib/format';

const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const today = () => new Date().toISOString().slice(0, 10);

export function emptyStudentForm(): StudentFormValues {
  return {
    firstName: '', lastName: '', gender: 'M', birthDate: '', birthPlace: '', nationality: 'Sénégalaise', address: '',
    fatherName: '', fatherPhone: '', motherName: '', motherPhone: '', guardianName: '', guardianPhone: '',
    emergencyContact: '', emergencyPhone: '', status: 'PAYANT', enrollmentDate: today(), classroom: '', notes: '',
  };
}

export function studentToForm(s: Student): StudentFormValues {
  return {
    firstName: s.firstName, lastName: s.lastName, gender: s.gender, birthDate: s.birthDate ?? '', birthPlace: s.birthPlace,
    nationality: s.nationality, address: s.address, fatherName: s.fatherName, fatherPhone: s.fatherPhone,
    motherName: s.motherName, motherPhone: s.motherPhone, guardianName: s.guardianName, guardianPhone: s.guardianPhone,
    emergencyContact: s.emergencyContact, emergencyPhone: s.emergencyPhone, status: s.status,
    enrollmentDate: s.enrollmentDate, classroom: s.classId ?? '', notes: s.notes ?? '',
  };
}

interface Props {
  /** null = création. */
  student: Student | null;
  /** Classes de l'année active (choix à la création). */
  classes: ClassRoom[];
  onClose: () => void;
  onSaved: (s: Student) => void;
}

export const StudentFormModal: React.FC<Props> = ({ student, classes, onClose, onSaved }) => {
  const toast = useToast();
  const creating = student === null;
  const [v, setV] = useState<StudentFormValues>(() => (student ? studentToForm(student) : emptyStudentForm()));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const set = <K extends keyof StudentFormValues>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setV(prev => ({ ...prev, [k]: e.target.value as StudentFormValues[K] }));

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!PHOTO_TYPES.includes(f.type)) { setPhotoError('Format non autorisé : choisissez une image JPG, PNG ou WebP.'); return; }
    if (f.size > MAX_PHOTO) { setPhotoError('Photo trop volumineuse (5 Mo maximum).'); return; }
    setPhotoError(null);
    setPhoto(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.firstName.trim() || !v.lastName.trim()) { setError('Le prénom et le nom sont obligatoires.'); return; }
    setBusy(true);
    setError(null);
    try {
      const saved = await saveStudent(student?.id ?? null, { ...v, firstName: v.firstName.trim(), lastName: v.lastName.trim() }, photo);
      toast.success(creating ? `Talibé ${saved.fullName} inscrit (matricule ${saved.registrationNumber}).` : 'Dossier mis à jour.');
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const shownPhoto = preview ?? student?.photoUrl ?? null;

  return (
    <Modal
      title={creating ? 'Nouveau talibé' : `Modifier ${student.fullName}`}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="student-form" loading={busy}>{creating ? 'Inscrire le talibé' : 'Enregistrer'}</Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="space-y-6" noValidate>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-ink">Identité</legend>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-slate-50 text-lg font-semibold text-slate-400">
              {shownPhoto ? <img src={shownPhoto} alt="Photo du talibé" className="h-full w-full object-cover" /> : initials(v.firstName, v.lastName)}
            </div>
            <div>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-within:outline focus-within:outline-2 focus-within:outline-brand-500">
                <Camera className="h-4 w-4" aria-hidden />
                {shownPhoto ? 'Changer la photo' : 'Ajouter une photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pickPhoto} />
              </label>
              <p className="mt-1 text-xs text-slate-500">JPG, PNG ou WebP, 5 Mo maximum.</p>
              {photoError && <p role="alert" className="text-xs text-danger">{photoError}</p>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Prénom" required value={v.firstName} onChange={set('firstName')} autoComplete="off" />
            <TextField label="Nom" required value={v.lastName} onChange={set('lastName')} autoComplete="off" />
            <SelectField label="Sexe" required value={v.gender} onChange={set('gender')}>
              <option value="M">Masculin</option>
              <option value="F">Féminin</option>
            </SelectField>
            <TextField label="Date de naissance" type="date" max={today()} value={v.birthDate} onChange={set('birthDate')} />
            <TextField label="Lieu de naissance" value={v.birthPlace} onChange={set('birthPlace')} />
            <TextField label="Nationalité" value={v.nationality} onChange={set('nationality')} />
            <TextField label="Adresse ou localité" className="sm:col-span-2" value={v.address} onChange={set('address')} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-ink">Famille et responsable</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Nom du père" value={v.fatherName} onChange={set('fatherName')} />
            <TextField label="Téléphone du père" type="tel" inputMode="tel" value={v.fatherPhone} onChange={set('fatherPhone')} />
            <TextField label="Nom de la mère" value={v.motherName} onChange={set('motherName')} />
            <TextField label="Téléphone de la mère" type="tel" inputMode="tel" value={v.motherPhone} onChange={set('motherPhone')} />
            <TextField label="Responsable légal (tuteur)" value={v.guardianName} onChange={set('guardianName')} />
            <TextField label="Téléphone du responsable" type="tel" inputMode="tel" value={v.guardianPhone} onChange={set('guardianPhone')} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-ink">Contact d'urgence</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Personne à contacter" value={v.emergencyContact} onChange={set('emergencyContact')} />
            <TextField label="Téléphone d'urgence" type="tel" inputMode="tel" value={v.emergencyPhone} onChange={set('emergencyPhone')} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-ink">Scolarité</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {creating ? (
              <>
                <SelectField label="Statut" value={v.status} onChange={set('status')} hint="Modifiable ensuite par le directeur, avec historique.">
                  <option value="PAYANT">{STATUS_LABEL.PAYANT}</option>
                  <option value="SOCIAL">{STATUS_LABEL.SOCIAL}</option>
                </SelectField>
                <SelectField label="Classe" value={v.classroom} onChange={set('classroom')} hint="Facultative : le talibé peut être affecté plus tard.">
                  <option value="">Aucune classe pour l'instant</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id} disabled={c.enrolledCount >= c.capacity}>
                      {c.name}{c.teacherName ? ` — ${c.teacherName}` : ''} ({c.enrolledCount}/{c.capacity})
                    </option>
                  ))}
                </SelectField>
              </>
            ) : (
              <Field label="Statut et classe" className="sm:col-span-2" hint="Le statut se change depuis la fiche (avec historique), ainsi que la classe.">
                {id => <p id={id} className="text-sm text-slate-700">{STATUS_LABEL[student.status]} — {student.className || 'sans classe'}</p>}
              </Field>
            )}
            <TextField label="Date d'inscription" type="date" value={v.enrollmentDate} onChange={set('enrollmentDate')} />
          </div>
          {/* TODO internat : l'affectation de chambre relève du module Internat. */}
          <TextAreaField label="Observations administratives" value={v.notes} onChange={set('notes')} hint="Interne : jamais visible des parents ni des maîtres." />
        </fieldset>
      </form>
    </Modal>
  );
};
