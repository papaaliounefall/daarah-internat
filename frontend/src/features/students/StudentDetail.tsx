import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, ExternalLink, FileText, Pencil, Plus, Archive, RotateCcw } from 'lucide-react';
import { errorMessage } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../stores/authStore';
import { archiveStudent, getStudent, listDocuments, statusHistory, unarchiveStudent } from '../../services/students';
import { currentYearOf, listEnrollments, listYears } from '../../services/academics';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, Spinner, useToast } from '../../components/ui';
import { ageFrom, formatDate, initials } from '../../lib/format';
import type { Student } from '../../types';
import { DOCUMENT_KIND_LABEL, STATUS_LABEL } from '../../types/students';
import { StudentTimeline } from '../memorization/StudentTimeline';
import { StudentCardPanel } from '../carte/StudentCardPanel';
import { StudentFormModal } from './StudentForm';
import { ClassChangeModal, DocumentModal, StatusChangeModal } from './StudentDialogs';
import { ENROLLMENT_KIND_LABEL, ENROLLMENT_STATUS_LABEL, enrollmentForYear, quranLink } from './studentUtils';

const Section: React.FC<{ title: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, actions, children }) => (
  <section className="panel">
    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {actions}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

const Info: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="text-xs text-slate-500">{label}</dt>
    <dd className="text-sm text-ink">{value || <span className="text-slate-400">Non renseigné</span>}</dd>
  </div>
);

const Phone: React.FC<{ value: string }> = ({ value }) =>
  value ? <a href={`tel:${value.replace(/\s/g, '')}`} className="text-brand-700 hover:underline">{value}</a> : null;

export const StudentDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useAuth(s => s.user)!;
  const isDirector = user.role === 'DIRECTEUR';
  const canWrite = isDirector || user.role === 'ASSISTANT';

  const main = useFetch(async () => {
    const [student, years, enrollments] = await Promise.all([getStudent(id), listYears(), listEnrollments({ student: id })]);
    return { student, years, enrollments: [...enrollments].sort((a, b) => b.enrolledOn.localeCompare(a.enrolledOn)) };
  }, [id]);
  const history = useFetch(() => (canWrite ? statusHistory(id) : Promise.resolve([])), [id, canWrite]);
  const docs = useFetch(() => (canWrite ? listDocuments(id) : Promise.resolve([])), [id, canWrite]);

  const [editing, setEditing] = useState(false);
  const [classDialog, setClassDialog] = useState(false);
  const [statusDialog, setStatusDialog] = useState(false);
  const [docDialog, setDocDialog] = useState(false);
  const [archiveDialog, setArchiveDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  if (main.loading && !main.data) return <Spinner />;
  if (main.error || !main.data) {
    return (
      <div>
        <Link to="/app/talibes" className="mb-3 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> Retour aux talibés</Link>
        <ErrorState message={main.error ?? 'Dossier introuvable.'} onRetry={main.reload} />
      </div>
    );
  }

  const { student: s, years, enrollments } = main.data;
  const year = currentYearOf(years);
  const currentEnrollment = enrollmentForYear(enrollments, year?.id);
  const canChangeClass = canWrite && year && !year.isClosed && !s.isArchived;
  const age = ageFrom(s.birthDate);

  const reloadAll = () => { main.reload(); history.reload(); docs.reload(); };

  const toggleArchive = async () => {
    setBusy(true);
    try {
      if (s.isArchived) { await unarchiveStudent(s.id); toast.success('Dossier restauré.'); }
      else { await archiveStudent(s.id); toast.success('Dossier archivé.'); }
      setArchiveDialog(false);
      main.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Link to="/app/talibes" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Retour aux talibés
      </Link>

      <div className="panel mb-4 flex flex-wrap items-start gap-4 p-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-slate-50 text-2xl font-semibold text-slate-400">
          {s.photoUrl ? <img src={s.photoUrl} alt={`Photo de ${s.fullName}`} className="h-full w-full object-cover" /> : initials(s.firstName, s.lastName)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-ink">{s.fullName}</h1>
          <p className="font-mono text-xs text-slate-500">{s.registrationNumber}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={s.status === 'SOCIAL' ? 'gold' : 'neutral'}>{STATUS_LABEL[s.status]}</Badge>
            {s.isBoarding && <Badge tone="info">Interne</Badge>}
            {s.isArchived && <Badge tone="danger">Dossier archivé</Badge>}
            {s.className && <Badge tone="success">{s.className}</Badge>}
          </div>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" aria-hidden /> Modifier</Button>
            <Button variant="secondary" onClick={() => setArchiveDialog(true)}>
              {s.isArchived ? <><RotateCcw className="h-4 w-4" aria-hidden /> Restaurer</> : <><Archive className="h-4 w-4" aria-hidden /> Archiver</>}
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Identité">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Info label="Sexe" value={s.gender === 'F' ? 'Féminin' : 'Masculin'} />
            <Info label="Date de naissance" value={s.birthDate ? `${formatDate(s.birthDate)}${age !== null ? ` (${age} ans)` : ''}` : ''} />
            <Info label="Lieu de naissance" value={s.birthPlace} />
            <Info label="Nationalité" value={s.nationality} />
            <Info label="Adresse ou localité" value={s.address} />
            <Info label="Inscrit depuis le" value={formatDate(s.enrollmentDate)} />
          </dl>
        </Section>

        <Section title="Famille et contacts">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Info label="Père" value={s.fatherName} />
            <Info label="Téléphone du père" value={<Phone value={s.fatherPhone} />} />
            <Info label="Mère" value={s.motherName} />
            <Info label="Téléphone de la mère" value={<Phone value={s.motherPhone} />} />
            <Info label="Responsable légal" value={s.guardianName} />
            <Info label="Téléphone du responsable" value={<Phone value={s.guardianPhone} />} />
            <Info label="Contact d'urgence" value={s.emergencyContact} />
            <Info label="Téléphone d'urgence" value={<Phone value={s.emergencyPhone} />} />
          </dl>
          {canWrite && s.notes && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="text-xs text-slate-500">Observations administratives (internes)</p>
              <p className="whitespace-pre-line text-sm">{s.notes}</p>
            </div>
          )}
        </Section>

        <Section
          title="Scolarité"
          actions={canChangeClass && (
            <Button variant="ghost" size="sm" onClick={() => setClassDialog(true)}>
              {currentEnrollment ? 'Changer de classe' : `Inscrire en ${year!.name}`}
            </Button>
          )}
        >
          <dl className="mb-4 grid gap-3 sm:grid-cols-2">
            <Info label="Année en cours" value={year?.name} />
            <Info label="Classe" value={currentEnrollment?.className || s.className} />
            <Info label="Maître coranique" value={s.teacherName} />
            <Info label="Internat" value={s.isBoarding ? [s.roomName, s.bedNumber && `lit ${s.bedNumber}`].filter(Boolean).join(', ') || 'Interne' : 'Externe'} />
          </dl>
          {!year && <p className="mb-3 text-sm text-slate-500">Aucune année scolaire active.</p>}
          {year && !currentEnrollment && <p className="mb-3 text-sm text-slate-500">Ce talibé n'est pas inscrit pour l'année {year.name}.</p>}

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Inscriptions et historique des classes</h3>
          {enrollments.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune inscription enregistrée.</p>
          ) : (
            <ul className="space-y-3">
              {enrollments.map(e => (
                <li key={e.id} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{e.academicYearName} <span className="font-normal text-slate-500">— {ENROLLMENT_KIND_LABEL[e.kind]} du {formatDate(e.enrolledOn)}</span></p>
                    <Badge tone={e.status === 'ACTIVE' ? 'success' : 'neutral'}>{ENROLLMENT_STATUS_LABEL[e.status]}</Badge>
                  </div>
                  {e.assignments.length > 0 && (
                    <ol className="mt-2 space-y-1 border-l-2 border-line pl-3 text-sm">
                      {e.assignments.map(a => (
                        <li key={a.id}>
                          <span className="font-medium">{a.classroomName}</span>{' '}
                          <span className="text-slate-500">
                            du {formatDate(a.startDate)}{a.endDate ? ` au ${formatDate(a.endDate)}` : ' (actuelle)'}
                            {a.reason ? ` — ${a.reason}` : ''}{a.changedByName ? ` (${a.changedByName})` : ''}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Progression coranique">
          {s.currentSurahNumber ? (
            <div className="space-y-3">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Info label="Sourate en cours" value={`${s.currentSurahNumber}. ${s.currentSurahName}`} />
                <Info label="Dernier verset" value={s.currentAyah ? `Verset ${s.currentAyah}` : ''} />
                <Info label="Juz" value={s.currentJuz ?? ''} />
                <Info label="Hizb" value={s.currentHizb ?? ''} />
                <Info label="Dernière leçon le" value={formatDate(s.lastProgressDate)} />
              </dl>
              <Button variant="secondary" onClick={() => navigate(quranLink(s.currentSurahNumber!, s.currentAyah, s.fullName))}>
                <BookOpen className="h-4 w-4" aria-hidden /> Lire la sourate
              </Button>
            </div>
          ) : (
            <EmptyState title="Aucune leçon enregistrée" hint="La progression apparaîtra ici dès la première leçon saisie dans le suivi coranique." />
          )}
        </Section>

        {canWrite && (
          <Section
            title="Statut social ou payant"
            actions={isDirector && !s.isArchived && <Button variant="ghost" size="sm" onClick={() => setStatusDialog(true)}>Changer le statut</Button>}
          >
            <p className="mb-3 text-sm">Statut actuel : <strong>{STATUS_LABEL[s.status]}</strong></p>
            {!isDirector && <p className="mb-3 text-xs text-slate-500">Seul le directeur peut modifier le statut.</p>}
            {history.loading ? <Spinner /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : history.data!.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun changement de statut depuis l'inscription.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {history.data!.map(h => (
                  <li key={h.id} className="rounded-md border border-line p-2.5">
                    <p><span className="font-medium">{STATUS_LABEL[h.fromStatus]} → {STATUS_LABEL[h.toStatus]}</span> <span className="text-slate-500">le {formatDate(h.effectiveDate)}{h.changedByName ? ` par ${h.changedByName}` : ''}</span></p>
                    {h.reason && <p className="text-slate-600">{h.reason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Historique coranique">
          <StudentTimeline studentId={s.id} />
        </Section>

        {canWrite && (
          <Section title="Carte talibé">
            <StudentCardPanel studentId={s.id} />
          </Section>
        )}

        {canWrite && (
          <Section title="Documents" actions={<Button variant="ghost" size="sm" onClick={() => setDocDialog(true)}><Plus className="h-4 w-4" aria-hidden /> Ajouter</Button>}>
            {docs.loading ? <Spinner /> : docs.error ? <ErrorState message={docs.error} onRetry={docs.reload} /> : docs.data!.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun document dans le dossier (extrait de naissance, justificatifs…).</p>
            ) : (
              <ul className="divide-y divide-line">
                {docs.data!.map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{d.title}</p>
                        <p className="text-xs text-slate-500">{DOCUMENT_KIND_LABEL[d.kind]} — ajouté le {formatDate(d.createdAt)}</p>
                      </div>
                    </div>
                    {d.fileUrl && (
                      <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-brand-700 hover:underline">
                        Ouvrir <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}
      </div>

      {editing && (
        <StudentFormModal
          student={s as Student}
          classes={[]}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); main.reload(); }}
        />
      )}
      {classDialog && year && (
        <ClassChangeModal
          student={s}
          yearId={year.id}
          enrollmentId={currentEnrollment?.id ?? null}
          currentClassId={currentEnrollment?.classroom ?? null}
          onClose={() => setClassDialog(false)}
          onDone={() => { setClassDialog(false); reloadAll(); }}
        />
      )}
      {statusDialog && <StatusChangeModal student={s} onClose={() => setStatusDialog(false)} onDone={() => { setStatusDialog(false); reloadAll(); }} />}
      {docDialog && <DocumentModal student={s} onClose={() => setDocDialog(false)} onDone={() => { setDocDialog(false); docs.reload(); }} />}
      {archiveDialog && (
        <ConfirmDialog
          title={s.isArchived ? 'Restaurer ce dossier ?' : 'Archiver ce dossier ?'}
          confirmLabel={s.isArchived ? 'Restaurer' : 'Archiver'}
          danger={!s.isArchived}
          loading={busy}
          onConfirm={toggleArchive}
          onCancel={() => setArchiveDialog(false)}
          message={s.isArchived
            ? <p>Le dossier de <strong>{s.fullName}</strong> réapparaîtra dans les listes courantes.</p>
            : <p>Le dossier de <strong>{s.fullName}</strong> ne figurera plus dans les listes courantes. Rien n'est supprimé : l'historique est conservé.</p>}
        />
      )}
    </div>
  );
};
