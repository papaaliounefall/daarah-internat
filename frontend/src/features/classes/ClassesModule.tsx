import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Users } from 'lucide-react';
import { errorMessage, listAll } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../stores/authStore';
import { listClasses, listClassStudents, listEnrollments, listYears, saveClass } from '../../services/academics';
import {
  Badge, Button, EmptyState, ErrorState, Modal, PageHeader, SelectField, Spinner, TextField, useToast,
} from '../../components/ui';
import type { AcademicYear, ClassRoom, Student, User } from '../../types';
import { ClassChangeModal } from '../students/StudentDialogs';
import { percent } from '../dashboard/dashboardUtils';

const FillBar: React.FC<{ count: number; capacity: number }> = ({ count, capacity }) => {
  const pct = percent(count, capacity);
  const full = count >= capacity;
  return (
    <div className="min-w-24">
      <div className="mb-1 text-sm tabular-nums">{count} / {capacity}{full && <span className="ml-1 text-xs text-warn">complète</span>}</div>
      <div className="h-1.5 rounded bg-slate-100" role="img" aria-label={`${pct} % de la capacité`}>
        <div className={`h-1.5 rounded ${full ? 'bg-warn' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const ClassFormModal: React.FC<{
  classroom: ClassRoom | null;
  year: AcademicYear;
  teachers: User[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ classroom, year, teachers, onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState(classroom?.name ?? '');
  const [level, setLevel] = useState(classroom?.level ?? '');
  const [teacher, setTeacher] = useState(classroom?.teacher ?? '');
  const [roomNumber, setRoomNumber] = useState(classroom?.roomNumber ?? '');
  const [capacity, setCapacity] = useState(String(classroom?.capacity ?? 30));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cap = Number(capacity);
    if (!name.trim()) { setError('Le nom de la classe est obligatoire.'); return; }
    if (!Number.isInteger(cap) || cap < 1) { setError('La capacité doit être un nombre entier positif.'); return; }
    if (classroom && cap < classroom.enrolledCount) { setError(`La capacité ne peut pas être inférieure à l'effectif actuel (${classroom.enrolledCount}).`); return; }
    setBusy(true);
    setError(null);
    try {
      await saveClass(classroom?.id ?? null, {
        name: name.trim(), level: level.trim(), academicYear: classroom?.academicYear ?? year.id,
        teacher: teacher || null, roomNumber: roomNumber.trim(), capacity: cap,
      });
      toast.success(classroom ? 'Classe mise à jour.' : 'Classe créée.');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={classroom ? `Modifier ${classroom.name}` : `Nouvelle classe — ${year.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="class-form" loading={busy}>{classroom ? 'Enregistrer' : 'Créer la classe'}</Button>
        </>
      }
    >
      <form id="class-form" onSubmit={submit} className="space-y-3" noValidate>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <TextField label="Nom de la classe" required value={name} onChange={e => setName(e.target.value)} />
        <TextField label="Niveau" value={level} onChange={e => setLevel(e.target.value)} hint="Par exemple : débutants, hifz, révision." />
        <SelectField label="Maître coranique" value={teacher} onChange={e => setTeacher(e.target.value)}
          hint={teachers.length === 0 ? "Aucun maître actif : créez d'abord un compte « Maître coranique » dans Utilisateurs." : undefined}>
          <option value="">Non attribué</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
        </SelectField>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Salle" value={roomNumber} onChange={e => setRoomNumber(e.target.value)} />
          <TextField label="Capacité" type="number" min={1} required value={capacity} onChange={e => setCapacity(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
};

const ClassStudentsModal: React.FC<{
  classroom: ClassRoom;
  year: AcademicYear;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
}> = ({ classroom, year, canWrite, onClose, onChanged }) => {
  const toast = useToast();
  const students = useFetch(() => listClassStudents(classroom.id), [classroom.id]);
  const [moving, setMoving] = useState<{ student: Student; enrollmentId: string } | null>(null);

  const startMove = async (student: Student) => {
    try {
      const list = await listEnrollments({ student: student.id, academicYear: year.id });
      const enr = list[0];
      if (!enr) { toast.error("Inscription introuvable pour cette année."); return; }
      setMoving({ student, enrollmentId: enr.id });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Modal title={`${classroom.name} — élèves`} size="lg" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-500">
        {classroom.teacherName ? `Maître : ${classroom.teacherName}. ` : 'Aucun maître attribué. '}
        Effectif : {classroom.enrolledCount} / {classroom.capacity}.
      </p>
      {students.loading ? <Spinner /> : students.error ? <ErrorState message={students.error} onRetry={students.reload} /> : students.data!.length === 0 ? (
        <EmptyState title="Aucun élève dans cette classe" hint="Affectez des talibés depuis leur fiche ou à l'inscription." />
      ) : (
        <ul className="divide-y divide-line">
          {students.data!.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <Link to={`/app/talibes/${s.id}`} className="text-sm font-medium hover:text-brand-700 hover:underline">{s.fullName}</Link>
                <p className="font-mono text-xs text-slate-500">{s.registrationNumber}</p>
              </div>
              {canWrite && !year.isClosed && <Button variant="ghost" size="sm" onClick={() => startMove(s)}>Changer de classe</Button>}
            </li>
          ))}
        </ul>
      )}
      {moving && (
        <ClassChangeModal
          student={moving.student}
          yearId={year.id}
          enrollmentId={moving.enrollmentId}
          currentClassId={classroom.id}
          onClose={() => setMoving(null)}
          onDone={() => { setMoving(null); students.reload(); onChanged(); }}
        />
      )}
    </Modal>
  );
};

export const ClassesModule: React.FC = () => {
  const user = useAuth(s => s.user)!;
  const canWrite = user.role === 'DIRECTEUR' || user.role === 'ASSISTANT';
  const years = useFetch(() => listYears(), []);
  const [yearId, setYearId] = useState<string>('');

  const year: AcademicYear | undefined =
    years.data?.find(y => y.id === yearId) ?? years.data?.find(y => y.isCurrent) ?? years.data?.[0];

  const classes = useFetch(() => (year ? listClasses(year.id) : Promise.resolve([] as ClassRoom[])), [year?.id]);
  const teachers = useFetch(
    () => (canWrite ? listAll<User>('/users/', { role: 'MAITRE', isActive: true, ordering: 'last_name' }) : Promise.resolve([] as User[])),
    [canWrite],
  );

  const [editing, setEditing] = useState<ClassRoom | 'new' | null>(null);
  const [viewing, setViewing] = useState<ClassRoom | null>(null);

  if (years.loading && !years.data) return <Spinner />;
  if (years.error) return <ErrorState message={years.error} onRetry={years.reload} />;

  const readOnlyYear = !year || year.isClosed;

  return (
    <div>
      <PageHeader
        title="Classes"
        description={user.role === 'MAITRE' ? 'Les classes qui vous sont attribuées.' : 'Classes, maîtres coraniques et effectifs de l\'année scolaire.'}
        actions={canWrite && year && !year.isClosed && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouvelle classe</Button>}
      />

      {!year ? (
        <div className="panel">
          <EmptyState
            title="Aucune année scolaire"
            hint="Les classes appartiennent à une année scolaire. Créez et activez d'abord l'année en cours."
            action={user.role === 'DIRECTEUR' ? <Link to="/app/parametres" className="text-sm font-medium text-brand-700 underline">Ouvrir les paramètres</Link> : undefined}
          />
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {years.data!.length > 1 ? (
              <div className="w-56">
                <label htmlFor="cls-year" className="sr-only">Année scolaire</label>
                <select id="cls-year" className="input" value={year.id} onChange={e => setYearId(e.target.value)}>
                  {years.data!.map(y => <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? ' (en cours)' : ''}{y.isClosed ? ' (clôturée)' : ''}</option>)}
                </select>
              </div>
            ) : <span className="text-sm font-medium">{year.name}</span>}
            {year.isCurrent && <Badge tone="success">Année en cours</Badge>}
            {year.isClosed && <Badge tone="neutral">Clôturée — consultation seule</Badge>}
            {!year.isCurrent && !year.isClosed && <Badge tone="warning">Non activée</Badge>}
          </div>

          <div className="panel">
            {classes.loading && !classes.data ? <Spinner /> : classes.error ? <ErrorState message={classes.error} onRetry={classes.reload} /> : classes.data!.length === 0 ? (
              canWrite && !readOnlyYear ? (
                <EmptyState title="Aucune classe pour cette année" hint="Créez la première classe, puis attribuez-lui un maître coranique."
                  action={<Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouvelle classe</Button>} />
              ) : (
                <EmptyState title={user.role === 'MAITRE' ? 'Aucune classe ne vous est attribuée' : 'Aucune classe pour cette année'}
                  hint={user.role === 'MAITRE' ? 'Le directeur doit vous attribuer une classe.' : undefined} />
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th scope="col">Classe</th>
                      <th scope="col" className="hidden sm:table-cell">Maître coranique</th>
                      <th scope="col" className="hidden md:table-cell">Salle</th>
                      <th scope="col">Effectif</th>
                      <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.data!.map(c => (
                      <tr key={c.id}>
                        <td>
                          <p className="font-medium">{c.name}</p>
                          {c.level && <p className="text-xs text-slate-500">{c.level}</p>}
                          <p className="text-xs text-slate-500 sm:hidden">{c.teacherName || 'Sans maître'}</p>
                        </td>
                        <td className="hidden sm:table-cell">{c.teacherName || <span className="text-slate-400">Non attribué</span>}</td>
                        <td className="hidden md:table-cell">{c.roomNumber || <span className="text-slate-400">—</span>}</td>
                        <td><FillBar count={c.enrolledCount} capacity={c.capacity} /></td>
                        <td>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setViewing(c)}><Users className="h-4 w-4" aria-hidden /> Élèves</Button>
                            {canWrite && !readOnlyYear && (
                              <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Modifier ${c.name}`}><Pencil className="h-4 w-4" aria-hidden /></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {editing && year && (
        <ClassFormModal
          classroom={editing === 'new' ? null : editing}
          year={year}
          teachers={teachers.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); classes.reload(); }}
        />
      )}
      {viewing && year && (
        <ClassStudentsModal
          classroom={classes.data?.find(c => c.id === viewing.id) ?? viewing}
          year={year}
          canWrite={canWrite}
          onClose={() => setViewing(null)}
          onChanged={classes.reload}
        />
      )}
    </div>
  );
};
