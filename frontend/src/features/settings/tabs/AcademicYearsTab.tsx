import React, { useState } from 'react';
import { CheckCircle2, Lock, Plus, Repeat } from 'lucide-react';
import { errorMessage } from '../../../lib/api';
import { useFetch } from '../../../hooks/useFetch';
import { activateYear, closeYear, createYear, listYears } from '../../../services/academics';
import {
  Badge, Button, ConfirmDialog, EmptyState, ErrorState, Modal, Spinner, TextField, useToast,
} from '../../../components/ui';
import { formatDate } from '../../../lib/format';
import type { AcademicYear } from '../../../types';
import { YEAR_STATE_LABEL, closeConfirmed, suggestYearName, yearState } from '../yearUtils';
import { ReenrollModal } from './ReenrollModal';

const STATE_TONE = { CURRENT: 'success', CLOSED: 'neutral', UPCOMING: 'warning' } as const;

const YearFormModal: React.FC<{ onClose: () => void; onSaved: () => void }> = ({ onClose, onSaved }) => {
  const toast = useToast();
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDates = (s: string, e: string) => {
    setStartDate(s); setEndDate(e);
    if (!nameTouched) setName(suggestYearName(s, e));
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim() || !startDate || !endDate) { setError("Renseignez le nom et les dates de début et de fin."); return; }
    if (endDate <= startDate) { setError('La date de fin doit suivre la date de début.'); return; }
    setBusy(true);
    setError(null);
    try {
      await createYear({ name: name.trim(), startDate, endDate });
      toast.success(`Année ${name.trim()} créée. Activez-la pour commencer à y inscrire des talibés.`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Nouvelle année scolaire"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="year-form" loading={busy}>Créer l'année</Button>
        </>
      }
    >
      <form id="year-form" onSubmit={submit} className="space-y-3" noValidate>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Début" type="date" required value={startDate} onChange={e => setDates(e.target.value, endDate)} />
          <TextField label="Fin" type="date" required value={endDate} min={startDate || undefined} onChange={e => setDates(startDate, e.target.value)} />
        </div>
        <TextField label="Nom de l'année" required value={name} onChange={e => { setName(e.target.value); setNameTouched(true); }} hint="Par exemple : 2025-2026." />
      </form>
    </Modal>
  );
};

/** Clôture : irréversible, donc le directeur doit retaper le nom de l'année. */
const CloseYearModal: React.FC<{ year: AcademicYear; onClose: () => void; onDone: () => void }> = ({ year, onClose, onDone }) => {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeConfirmed(typed, year)) return;
    setBusy(true);
    setError(null);
    try {
      await closeYear(year.id);
      toast.success(`L'année ${year.name} est clôturée.`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Clôturer l'année ${year.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="close-year-form" variant="danger" loading={busy} disabled={!closeConfirmed(typed, year)}>Clôturer définitivement</Button>
        </>
      }
    >
      <form id="close-year-form" onSubmit={submit} className="space-y-3">
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Les inscriptions en cours de cette année passent à « année terminée ».</li>
          <li>L'année ne pourra plus être réactivée, ni ses classes modifiées ou ses affectations changées.</li>
          <li>Tout l'historique (inscriptions, évaluations, présences) reste consultable.</li>
        </ul>
        <TextField label={`Pour confirmer, saisissez « ${year.name} »`} value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
      </form>
    </Modal>
  );
};

export const AcademicYearsTab: React.FC = () => {
  const toast = useToast();
  const years = useFetch(() => listYears(), []);
  const [creating, setCreating] = useState(false);
  const [toActivate, setToActivate] = useState<AcademicYear | null>(null);
  const [toClose, setToClose] = useState<AcademicYear | null>(null);
  const [reenrollTarget, setReenrollTarget] = useState<AcademicYear | null>(null);
  const [busy, setBusy] = useState(false);

  const activate = async () => {
    if (!toActivate) return;
    setBusy(true);
    try {
      await activateYear(toActivate.id);
      toast.success(`L'année ${toActivate.name} est maintenant l'année en cours.`);
      setToActivate(null);
      years.reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (years.loading && !years.data) return <Spinner />;
  if (years.error) return <ErrorState message={years.error} onRetry={years.reload} />;
  const list = years.data ?? [];
  const current = list.find(y => y.isCurrent);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Années scolaires</h2>
          <p className="text-sm text-slate-500">Une seule année est « en cours » à la fois. Les talibés gardent leur dossier d'une année à l'autre : seules leurs inscriptions changent.</p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Nouvelle année</Button>
      </div>

      {list.length > 0 && !current && (
        <p role="status" className="mb-4 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
          Aucune année n'est en cours. Activez-en une pour pouvoir inscrire des talibés et créer des classes.
        </p>
      )}

      <div className="panel">
        {list.length === 0 ? (
          <EmptyState
            title="Aucune année scolaire"
            hint="Créez la première année, activez-la, puis créez les classes et inscrivez les talibés."
            action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" aria-hidden /> Créer une année</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Année</th>
                  <th scope="col" className="hidden sm:table-cell">Période</th>
                  <th scope="col">État</th>
                  <th scope="col" className="text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map(y => {
                  const st = yearState(y);
                  return (
                    <tr key={y.id}>
                      <td>
                        <p className="font-medium">{y.name}</p>
                        <p className="text-xs text-slate-500 sm:hidden">{formatDate(y.startDate)} – {formatDate(y.endDate)}</p>
                      </td>
                      <td className="hidden sm:table-cell">{formatDate(y.startDate)} – {formatDate(y.endDate)}</td>
                      <td><Badge tone={STATE_TONE[st]}>{YEAR_STATE_LABEL[st]}</Badge></td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-1">
                          {!y.isClosed && (
                            <Button variant="ghost" size="sm" onClick={() => setReenrollTarget(y)}><Repeat className="h-4 w-4" aria-hidden /> Réinscrire</Button>
                          )}
                          {!y.isClosed && !y.isCurrent && (
                            <Button variant="ghost" size="sm" onClick={() => setToActivate(y)}><CheckCircle2 className="h-4 w-4" aria-hidden /> Activer</Button>
                          )}
                          {!y.isClosed && (
                            <Button variant="ghost" size="sm" onClick={() => setToClose(y)}><Lock className="h-4 w-4" aria-hidden /> Clôturer</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <YearFormModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); years.reload(); }} />}
      {toClose && <CloseYearModal year={toClose} onClose={() => setToClose(null)} onDone={() => { setToClose(null); years.reload(); }} />}
      {reenrollTarget && <ReenrollModal target={reenrollTarget} years={list} onClose={() => setReenrollTarget(null)} onDone={years.reload} />}
      {toActivate && (
        <ConfirmDialog
          title={`Activer l'année ${toActivate.name} ?`}
          confirmLabel="Activer"
          loading={busy}
          onConfirm={activate}
          onCancel={() => setToActivate(null)}
          message={
            <p>
              {current ? <>L'année <strong>{current.name}</strong> ne sera plus l'année en cours (elle n'est pas clôturée pour autant). </> : ''}
              Les nouvelles inscriptions, les classes et les présences se rapporteront à <strong>{toActivate.name}</strong>.
            </p>
          }
        />
      )}
    </div>
  );
};
