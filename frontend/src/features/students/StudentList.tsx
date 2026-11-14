import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Download, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuth } from '../../stores/authStore';
import { currentYearOf, listClasses, listYears } from '../../services/academics';
import {
  archiveStudent, exportStudentsCsv, listStudents, unarchiveStudent, type ArchiveFilter, type StudentQuery,
} from '../../services/students';
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Spinner, useToast,
} from '../../components/ui';
import { Pagination } from '../../components/ui/Pagination';
import { initials } from '../../lib/format';
import type { Student } from '../../types';
import { StudentFormModal } from './StudentForm';

const PAGE_SIZE = 20;

export const StudentList: React.FC = () => {
  const user = useAuth(s => s.user)!;
  const toast = useToast();
  const navigate = useNavigate();
  const canWrite = user.role === 'DIRECTEUR' || user.role === 'ASSISTANT';

  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [classroom, setClassroom] = useState('');
  const [status, setStatus] = useState<StudentQuery['status']>('');
  const [boarding, setBoarding] = useState<StudentQuery['boarding']>('');
  const [archive, setArchive] = useState<ArchiveFilter>('active');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Student | 'new' | null>(null);
  const [toArchive, setToArchive] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Retour à la première page quand un filtre change.
  useEffect(() => { setPage(1); }, [debounced, classroom, status, boarding, archive]);

  const ref = useFetch(async () => {
    const years = await listYears();
    const year = currentYearOf(years);
    const classes = year ? await listClasses(year.id) : [];
    return { year, classes };
  }, []);

  const query: StudentQuery = { page, pageSize: PAGE_SIZE, search: debounced, classroom, status, boarding, archive };
  const list = useFetch(() => listStudents(query), [page, debounced, classroom, status, boarding, archive]);

  const classes = ref.data?.classes ?? [];
  const noYear = ref.data !== undefined && !ref.data.year;
  const hasFilter = Boolean(debounced || classroom || status || boarding || archive !== 'active');

  const confirmArchive = async () => {
    if (!toArchive) return;
    setBusy(true);
    try {
      await archiveStudent(toArchive.id);
      toast.success(`Le dossier de ${toArchive.fullName} est archivé.`);
      setToArchive(null);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (s: Student) => {
    try {
      await unarchiveStudent(s.id);
      toast.success(`Le dossier de ${s.fullName} est restauré.`);
      list.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const doExport = async () => {
    setExporting(true);
    try {
      await exportStudentsCsv(query);
      toast.success('Export téléchargé.');
    } catch (e) {
      toast.error(errorMessage(e, "L'export n'a pas pu être généré."));
    } finally {
      setExporting(false);
    }
  };

  const reset = () => { setSearch(''); setClassroom(''); setStatus(''); setBoarding(''); setArchive('active'); };

  const count = list.data?.count ?? 0;

  return (
    <div>
      <PageHeader
        title="Talibés"
        description={user.role === 'MAITRE' ? 'Les talibés de vos classes.' : 'Dossiers permanents des talibés.'}
        actions={canWrite && (
          <>
            <Button variant="secondary" onClick={doExport} loading={exporting}><Download className="h-4 w-4" aria-hidden /> Exporter (CSV)</Button>
            <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouveau talibé</Button>
          </>
        )}
      />

      {canWrite && noYear && (
        <p role="status" className="mb-4 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
          Aucune année scolaire n'est active : l'inscription d'un talibé est impossible.{' '}
          {user.role === 'DIRECTEUR'
            ? <Link to="/app/parametres" className="font-medium underline">Créer ou activer une année scolaire</Link>
            : "Demandez au directeur d'activer une année scolaire."}
        </p>
      )}

      <div className="panel">
        <div className="grid gap-3 border-b border-line p-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
          <div className="relative">
            <label htmlFor="stu-search" className="sr-only">Rechercher un talibé</label>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input
              id="stu-search" type="search" className="input pl-9" placeholder="Nom, prénom ou matricule"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="stu-class" className="sr-only">Classe</label>
            <select id="stu-class" className="input" value={classroom} onChange={e => setClassroom(e.target.value)}>
              <option value="">Toutes les classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="stu-status" className="sr-only">Statut</label>
            <select id="stu-status" className="input" value={status} onChange={e => setStatus(e.target.value as StudentQuery['status'])}>
              <option value="">Tous les statuts</option>
              <option value="PAYANT">Payants</option>
              <option value="SOCIAL">Sociaux</option>
            </select>
          </div>
          <div>
            <label htmlFor="stu-boarding" className="sr-only">Internat</label>
            <select id="stu-boarding" className="input" value={boarding} onChange={e => setBoarding(e.target.value as StudentQuery['boarding'])}>
              <option value="">Internes et externes</option>
              <option value="true">Internes</option>
              <option value="false">Externes</option>
            </select>
          </div>
          {canWrite && (
            <div>
              <label htmlFor="stu-archive" className="sr-only">Dossiers</label>
              <select id="stu-archive" className="input" value={archive} onChange={e => setArchive(e.target.value as ArchiveFilter)}>
                <option value="active">Dossiers actifs</option>
                <option value="archived">Dossiers archivés</option>
                <option value="all">Tous les dossiers</option>
              </select>
            </div>
          )}
        </div>

        {list.loading && !list.data ? (
          <Spinner />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : count === 0 ? (
          hasFilter ? (
            <EmptyState title="Aucun talibé ne correspond" hint="Modifiez la recherche ou les filtres." action={<Button variant="secondary" size="sm" onClick={reset}>Réinitialiser les filtres</Button>} />
          ) : canWrite ? (
            <EmptyState
              title="Aucun talibé enregistré"
              hint={noYear ? "Commencez par créer l'année scolaire, puis inscrivez les premiers talibés." : 'Inscrivez le premier talibé pour constituer les dossiers.'}
              action={noYear ? undefined : <Button size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Nouveau talibé</Button>}
            />
          ) : (
            <EmptyState title="Aucun talibé dans vos classes" hint="Les talibés apparaîtront ici lorsqu'une classe vous sera attribuée et remplie." />
          )
        ) : (
          <>
            <div className={`overflow-x-auto ${list.loading ? 'opacity-60' : ''}`}>
              <table className="table-base">
                <thead>
                  <tr>
                    <th scope="col">Talibé</th>
                    <th scope="col" className="hidden sm:table-cell">Matricule</th>
                    <th scope="col">Classe</th>
                    <th scope="col" className="hidden md:table-cell">Statut</th>
                    <th scope="col" className="hidden lg:table-cell">Internat</th>
                    {canWrite && <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {list.data!.results.map(s => (
                    <tr key={s.id} className={s.isArchived ? 'text-slate-500' : ''}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                            {s.photoUrl ? <img src={s.photoUrl} alt="" className="h-full w-full object-cover" /> : initials(s.firstName, s.lastName)}
                          </div>
                          <div className="min-w-0">
                            <Link to={`/app/talibes/${s.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">{s.fullName}</Link>
                            <div className="text-xs text-slate-500 sm:hidden">{s.registrationNumber}</div>
                          </div>
                          {s.isArchived && <Badge tone="neutral">Archivé</Badge>}
                        </div>
                      </td>
                      <td className="hidden font-mono text-xs sm:table-cell">{s.registrationNumber}</td>
                      <td>{s.className || <span className="text-slate-400">Sans classe</span>}</td>
                      <td className="hidden md:table-cell"><Badge tone={s.status === 'SOCIAL' ? 'gold' : 'neutral'}>{s.status === 'SOCIAL' ? 'Social' : 'Payant'}</Badge></td>
                      <td className="hidden lg:table-cell">{s.isBoarding ? <Badge tone="info">Interne{s.roomName ? ` — ${s.roomName}` : ''}</Badge> : <span className="text-slate-400">Externe</span>}</td>
                      {canWrite && (
                        <td>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/app/talibes/${s.id}`)}>Fiche</Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label={`Modifier ${s.fullName}`}><Pencil className="h-4 w-4" aria-hidden /></Button>
                            {s.isArchived
                              ? <Button variant="ghost" size="sm" onClick={() => restore(s)} aria-label={`Restaurer ${s.fullName}`}><RotateCcw className="h-4 w-4" aria-hidden /></Button>
                              : <Button variant="ghost" size="sm" onClick={() => setToArchive(s)} aria-label={`Archiver ${s.fullName}`}><Archive className="h-4 w-4" aria-hidden /></Button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
          </>
        )}
      </div>

      {editing && (
        <StudentFormModal
          student={editing === 'new' ? null : editing}
          classes={classes}
          onClose={() => setEditing(null)}
          onSaved={saved => {
            const wasNew = editing === 'new';
            setEditing(null);
            if (wasNew) navigate(`/app/talibes/${saved.id}`);
            else list.reload();
          }}
        />
      )}

      {toArchive && (
        <ConfirmDialog
          title="Archiver ce dossier ?"
          confirmLabel="Archiver"
          danger
          loading={busy}
          onConfirm={confirmArchive}
          onCancel={() => setToArchive(null)}
          message={
            <>
              <p>Le dossier de <strong>{toArchive.fullName}</strong> ne figurera plus dans les listes courantes.</p>
              <p className="mt-2 text-slate-500">Rien n'est supprimé : l'historique est conservé et le dossier pourra être restauré depuis le filtre « Dossiers archivés ».</p>
            </>
          }
        />
      )}
    </div>
  );
};
