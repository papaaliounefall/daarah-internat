import React, { useEffect, useMemo, useState } from 'react';
import { Async } from '../../components/ops/Async';
import { Badge, Button, ConfirmDialog, SelectField, TextField, useToast } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { plainErrorMessage } from '../../lib/apiErrors';
import { listClassStudents } from '../../services/academics';
import { listSlotRecords, saveBulk } from '../../services/attendance';
import type { ClassRoom, Student } from '../../types';
import { PERIOD_LABEL, STATUS_LABEL, type AttendancePeriod, type AttendanceStatus } from '../../types/attendance';
import { buildRecords, countMarks, initialMarks, todayIso, toggleStatus, type Marks } from './attendanceUtils';

const TOGGLES: { status: Exclude<AttendanceStatus, 'PRESENT'>; on: string }[] = [
  { status: 'ABSENT', on: 'border-danger bg-danger text-white' },
  { status: 'RETARD', on: 'border-warn bg-warn text-white' },
  { status: 'EXCUSE', on: 'border-sky-700 bg-sky-700 text-white' },
];

/** Saisie quotidienne : tout le monde présent par défaut, un tap pour absent / retard / excusé, enregistrement en lot. */
export const DailyEntry: React.FC<{ classes: ClassRoom[] }> = ({ classes }) => {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(todayIso);
  const [period, setPeriod] = useState<AttendancePeriod>('MATIN');
  const [marks, setMarks] = useState<Marks>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!classId && classes.length > 0) setClassId(classes[0].id); }, [classes, classId]);

  const slot = useFetch(async () => {
    if (!classId || !date) return { students: [] as Student[], records: [] };
    const [students, records] = await Promise.all([listClassStudents(classId), listSlotRecords(classId, date, period)]);
    return { students: [...students].sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr')), records };
  }, [classId, date, period]);

  const students = slot.data?.students ?? [];
  const ids = useMemo(() => students.map(s => s.id), [students]);

  // Les marques repartent des pointages enregistrés du créneau (sinon tout le monde « présent »).
  useEffect(() => {
    if (slot.data) setMarks(initialMarks(slot.data.students.map(s => s.id), slot.data.records));
  }, [slot.data]);

  const counts = countMarks(marks);
  const alreadyRecorded = (slot.data?.records.length ?? 0) > 0;
  const setStatus = (id: string, clicked: AttendanceStatus) =>
    setMarks(m => ({ ...m, [id]: { ...m[id], status: toggleStatus(m[id].status, clicked), reason: toggleStatus(m[id].status, clicked) === 'PRESENT' ? '' : m[id].reason } }));
  const setReason = (id: string, reason: string) => setMarks(m => ({ ...m, [id]: { ...m[id], reason } }));
  const allPresent = () => setMarks(m => Object.fromEntries(Object.keys(m).map(id => [id, { status: 'PRESENT' as const, reason: '' }])));

  const save = async () => {
    setBusy(true);
    try {
      const res = await saveBulk({ date, period, classroom: classId, records: buildRecords(ids, marks) });
      const parts = [res.created && `${res.created} enregistré${res.created > 1 ? 's' : ''}`, res.updated && `${res.updated} corrigé${res.updated > 1 ? 's' : ''}`, res.unchanged && `${res.unchanged} inchangé${res.unchanged > 1 ? 's' : ''}`].filter(Boolean);
      toast.success(`Présences enregistrées (${parts.join(', ') || 'aucun changement'}).`);
      setConfirm(false);
      slot.reload();
    } catch (e) {
      toast.error(plainErrorMessage(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = () => (counts.absent > 0 ? setConfirm(true) : void save());

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField label="Classe" value={classId} onChange={e => setClassId(e.target.value)}>
          {classes.length === 0 && <option value="">Aucune classe</option>}
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <TextField label="Date" type="date" value={date} max={todayIso()} onChange={e => setDate(e.target.value)} required />
        <div>
          <span className="mb-1 block text-sm font-medium text-ink">Créneau</span>
          <div role="radiogroup" aria-label="Créneau" className="grid grid-cols-2 gap-2">
            {(['MATIN', 'SOIR'] as const).map(p => (
              <button
                key={p} type="button" role="radio" aria-checked={period === p} onClick={() => setPeriod(p)}
                className={`min-h-10 rounded-md border text-sm font-medium ${period === p ? 'border-brand-800 bg-brand-800 text-white' : 'border-line bg-white text-ink hover:bg-brand-50'}`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Async state={slot} isEmpty={d => d.students.length === 0} emptyTitle="Aucun talibé dans cette classe" emptyHint="Les talibés inscrits à la classe apparaissent ici.">
        {() => (
          <>
            {alreadyRecorded && (
              <p role="status" className="mb-3 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
                Ce créneau est déjà pointé : vos modifications corrigeront les pointages existants (les corrections sont tracées).
              </p>
            )}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600" aria-live="polite">
                {counts.present} présent{counts.present > 1 ? 's' : ''} · {counts.absent} absent{counts.absent > 1 ? 's' : ''} · {counts.late} en retard · {counts.excused} excusé{counts.excused > 1 ? 's' : ''}
              </p>
              <Button variant="secondary" size="sm" onClick={allPresent}>Tout le monde présent</Button>
            </div>

            <ul className="panel divide-y divide-line">
              {students.map(s => {
                const m = marks[s.id];
                if (!m) return null;
                return (
                  <li key={s.id} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{s.fullName}</span>
                      {m.status === 'PRESENT' ? <Badge tone="success">Présent</Badge> : <Badge tone={m.status === 'ABSENT' ? 'danger' : m.status === 'RETARD' ? 'warning' : 'info'}>{STATUS_LABEL[m.status]}</Badge>}
                    </div>
                    <div role="group" aria-label={`Statut de ${s.fullName}`} className="mt-2 grid grid-cols-3 gap-2">
                      {TOGGLES.map(t => (
                        <button
                          key={t.status} type="button" aria-pressed={m.status === t.status} onClick={() => setStatus(s.id, t.status)}
                          className={`min-h-10 rounded-md border text-sm font-medium ${m.status === t.status ? t.on : 'border-line bg-white text-ink hover:bg-slate-50'}`}
                        >
                          {STATUS_LABEL[t.status]}
                        </button>
                      ))}
                    </div>
                    {m.status !== 'PRESENT' && (
                      <input
                        className="input mt-2" placeholder="Motif (facultatif)" aria-label={`Motif pour ${s.fullName}`} maxLength={255}
                        value={m.reason} onChange={e => setReason(s.id, e.target.value)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="sticky bottom-0 z-10 -mx-4 mt-3 border-t border-line bg-white px-4 py-3 sm:mx-0 sm:rounded-md sm:border">
              <Button className="w-full sm:w-auto" loading={busy} onClick={onSubmit} disabled={ids.length === 0}>
                Enregistrer les présences ({ids.length} talibés)
              </Button>
            </div>
          </>
        )}
      </Async>

      {confirm && (
        <ConfirmDialog
          title="Enregistrer les présences"
          confirmLabel="Enregistrer"
          loading={busy}
          onConfirm={save}
          onCancel={() => setConfirm(false)}
          message={<>
            {counts.absent} absence{counts.absent > 1 ? 's' : ''} non excusée{counts.absent > 1 ? 's' : ''} : les parents concernés seront prévenus par notification.
          </>}
        />
      )}
    </div>
  );
};
