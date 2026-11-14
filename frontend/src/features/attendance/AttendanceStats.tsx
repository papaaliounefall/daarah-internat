import React, { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Async, Stat, TableWrap } from '../../components/ops/Async';
import { SelectField, TextField } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { getAttendanceStats, getMonthlyReport } from '../../services/attendance';
import type { ClassRoom } from '../../types';
import type { AttendanceStats as Stats } from '../../types/attendance';
import { dayBars, formatRate, isMonth, monthOf } from './attendanceUtils';

const COLORS = { present: '#1b7f5c', late: '#b08d45', excused: '#7aa5b8', absent: '#b3372f' };
const GRID = '#e6e9e6';
const AXIS = { fontSize: 12, fill: '#64748b' };

/** Présences par jour du mois (barres empilées). */
const DayChart: React.FC<{ stats: Stats }> = ({ stats }) => {
  const data = dayBars(stats.byDay);
  if (data.length === 0) return null;
  return (
    <div role="img" aria-label={`Présences par jour pour ${stats.month}`}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="day" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
          <Tooltip cursor={{ fill: '#f1f5f2' }} labelFormatter={d => `Jour ${d}`} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="present" name="Présents" stackId="a" fill={COLORS.present} />
          <Bar isAnimationActive={false} dataKey="late" name="Retards" stackId="a" fill={COLORS.late} />
          <Bar isAnimationActive={false} dataKey="excused" name="Excusés" stackId="a" fill={COLORS.excused} />
          <Bar isAnimationActive={false} dataKey="absent" name="Absents" stackId="a" fill={COLORS.absent} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Statistiques du mois (par classe) et rapport mensuel par talibé. */
export const AttendanceStatsTab: React.FC<{ classes: ClassRoom[]; canSeeAllClasses: boolean }> = ({ classes, canSeeAllClasses }) => {
  const [month, setMonth] = useState(monthOf());
  const [classId, setClassId] = useState('');
  const validMonth = isMonth(month);
  const stats = useFetch(() => (validMonth ? getAttendanceStats(month, classId || undefined) : Promise.resolve(null)), [month, classId]);
  const report = useFetch(() => (validMonth && classId ? getMonthlyReport(classId, month) : Promise.resolve(null)), [month, classId]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <TextField label="Mois" type="month" value={month} onChange={e => setMonth(e.target.value)} required error={validMonth ? undefined : 'Choisissez un mois.'} />
        <SelectField label="Classe" value={classId} onChange={e => setClassId(e.target.value)}>
          <option value="">{canSeeAllClasses ? 'Toutes les classes' : 'Mes classes'}</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
      </div>

      {!validMonth ? null : (
        <Async state={stats} isEmpty={d => !d || d.total === 0} emptyTitle="Aucun pointage ce mois-ci" emptyHint="Les statistiques apparaissent dès que des présences sont enregistrées.">
          {s => s && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Stat label="Taux de présence" value={formatRate(s.attendanceRate)} tone="success" hint="Retards inclus, excusés au total" />
                <Stat label="Présents" value={s.present} />
                <Stat label="Retards" value={s.late} />
                <Stat label="Excusés" value={s.excused} />
                <Stat label="Absents" value={s.absent} tone={s.absent > 0 ? 'danger' : 'default'} />
              </div>

              <section className="panel p-4" aria-label="Présences par jour">
                <h3 className="mb-2 text-base font-semibold">Présences par jour</h3>
                <DayChart stats={s} />
              </section>

              {s.byClassroom && s.byClassroom.length > 0 && (
                <section aria-label="Par classe">
                  <h3 className="mb-2 text-base font-semibold">Par classe</h3>
                  <TableWrap>
                    <table className="table-base">
                      <thead><tr><th scope="col">Classe</th><th scope="col">Pointages</th><th scope="col">Présents</th><th scope="col">Retards</th><th scope="col">Excusés</th><th scope="col">Absents</th><th scope="col">Taux</th></tr></thead>
                      <tbody>
                        {s.byClassroom.map(c => (
                          <tr key={c.classroom}>
                            <td className="font-medium">{c.className}</td>
                            <td className="tabular-nums">{c.total}</td><td className="tabular-nums">{c.present}</td><td className="tabular-nums">{c.late}</td>
                            <td className="tabular-nums">{c.excused}</td><td className="tabular-nums">{c.absent}</td><td className="tabular-nums">{formatRate(c.attendanceRate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                </section>
              )}
            </div>
          )}
        </Async>
      )}

      {validMonth && classId && (
        <section className="mt-6" aria-label="Rapport mensuel">
          <h3 className="mb-2 text-base font-semibold">Rapport mensuel par talibé</h3>
          <Async state={report} isEmpty={d => !d || d.students.length === 0} emptyTitle="Aucun talibé dans cette classe">
            {r => r && (
              <>
                <p className="mb-2 text-sm text-slate-600">{r.className} · {r.daysRecorded} jour{r.daysRecorded > 1 ? 's' : ''} pointé{r.daysRecorded > 1 ? 's' : ''} · taux de la classe {formatRate(r.totals.attendanceRate)}</p>
                <TableWrap>
                  <table className="table-base">
                    <thead><tr><th scope="col">Talibé</th><th scope="col">Présents</th><th scope="col">Retards</th><th scope="col">Excusés</th><th scope="col">Absents</th><th scope="col">Taux</th></tr></thead>
                    <tbody>
                      {r.students.map(st => (
                        <tr key={st.studentId}>
                          <td className="font-medium">{st.studentName}</td>
                          <td className="tabular-nums">{st.present}</td><td className="tabular-nums">{st.late}</td><td className="tabular-nums">{st.excused}</td>
                          <td className={`tabular-nums ${st.absent > 0 ? 'font-medium text-danger' : ''}`}>{st.absent}</td>
                          <td className="tabular-nums">{formatRate(st.attendanceRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </>
            )}
          </Async>
        </section>
      )}
    </div>
  );
};
