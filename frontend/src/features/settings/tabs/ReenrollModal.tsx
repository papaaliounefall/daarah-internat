import React, { useEffect, useMemo, useState } from 'react';
import { errorMessage, listAll } from '../../../lib/api';
import { listClasses, reenroll, type ReenrollResult } from '../../../services/academics';
import { Button, Modal, SelectField, Spinner, useToast } from '../../../components/ui';
import type { AcademicYear, ClassRoom, Enrollment } from '../../../types';
import { skipReason, studentsToReenroll } from '../yearUtils';

/** Réinscription en masse des talibés d'une année précédente vers l'année cible. */
export const ReenrollModal: React.FC<{
  target: AcademicYear;
  years: AcademicYear[];
  onClose: () => void;
  onDone: () => void;
}> = ({ target, years, onClose, onDone }) => {
  const toast = useToast();
  const sources = years.filter(y => y.id !== target.id && y.startDate < target.startDate);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const [classroom, setClassroom] = useState('');
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [candidates, setCandidates] = useState<Enrollment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ res: ReenrollResult; names: Record<string, string> } | null>(null);

  useEffect(() => { listClasses(target.id).then(setClasses).catch(() => setClasses([])); }, [target.id]);

  useEffect(() => {
    if (!sourceId) { setCandidates([]); setSelected(new Set()); return; }
    let live = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      listAll<Enrollment>('/enrollments/', { academicYear: sourceId }),
      listAll<Enrollment>('/enrollments/', { academicYear: target.id }),
    ])
      .then(([prev, cur]) => {
        if (!live) return;
        const list = studentsToReenroll(prev, cur).sort((a, b) => a.studentName.localeCompare(b.studentName, 'fr'));
        setCandidates(list);
        setSelected(new Set(list.map(e => e.student)));
      })
      .catch(e => { if (live) setLoadError(errorMessage(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [sourceId, target.id]);

  const names = useMemo(() => Object.fromEntries(candidates.map(e => [e.student, e.studentName])), [candidates]);
  const allSelected = candidates.length > 0 && selected.size === candidates.length;

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await reenroll(target.id, [...selected], classroom || null);
      setResult({ res, names });
      toast.success(`${res.enrolled.length} talibé${res.enrolled.length > 1 ? 's' : ''} réinscrit${res.enrolled.length > 1 ? 's' : ''}.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Résultat de la réinscription" onClose={onClose} footer={<Button onClick={onClose}>Fermer</Button>}>
        <p className="text-sm"><strong>{result.res.enrolled.length}</strong> talibé(s) réinscrit(s) en {target.name}.</p>
        {result.res.skipped.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-danger">{result.res.skipped.length} non réinscrit(s) :</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {result.res.skipped.map(s => <li key={s.student}>{result.names[s.student] ?? s.student} — {skipReason(s.error)}</li>)}
            </ul>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title={`Réinscrire pour ${target.name}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="reenroll-form" loading={busy} disabled={selected.size === 0}>
            Réinscrire {selected.size} talibé{selected.size > 1 ? 's' : ''}
          </Button>
        </>
      }
    >
      <form id="reenroll-form" onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {sources.length === 0 ? (
          <p className="text-sm text-slate-600">Aucune année antérieure : il n'y a personne à réinscrire. Les nouveaux talibés s'inscrivent depuis la page Talibés.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Depuis l'année" value={sourceId} onChange={e => setSourceId(e.target.value)}>
                {sources.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}
              </SelectField>
              <SelectField label="Classe d'accueil" value={classroom} onChange={e => setClassroom(e.target.value)} hint="Facultative : appliquée à tous les talibés sélectionnés.">
                <option value="">Sans classe pour l'instant</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.enrolledCount}/{c.capacity})</option>)}
              </SelectField>
            </div>
            {loading ? <Spinner /> : loadError ? <p role="alert" className="text-sm text-danger">{loadError}</p> : candidates.length === 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Tous les talibés de cette année sont déjà inscrits en {target.name}, ou aucun n'y était inscrit.</p>
            ) : (
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(candidates.map(c => c.student)))} />
                  Tout sélectionner ({candidates.length})
                </label>
                <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line">
                  {candidates.map(c => (
                    <li key={c.student}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-brand-50/50">
                        <input type="checkbox" checked={selected.has(c.student)} onChange={() => toggle(c.student)} />
                        <span className="flex-1">{c.studentName}</span>
                        <span className="text-xs text-slate-500">{c.className || 'sans classe'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
};
