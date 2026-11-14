import React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatFcfa } from '../../lib/format';
import type { AttendanceToday, ClassCount } from '../../types/dashboard';
import { attendanceSlices, classBars, percent } from './dashboardUtils';

// Palette sobre, alignée sur l'identité (vert institutionnel, or discret, neutres).
const BRAND = '#1b7f5c';
const BRAND_DARK = '#114232';
const GOLD = '#b08d45';
const NEUTRAL = '#cbd5d0';
const DANGER = '#b3372f';
const GRID = '#e6e9e6';
const AXIS = { fontSize: 12, fill: '#64748b' };

const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 });

/** Effectif et places libres par classe (barres empilées horizontales). */
export const ClassBarChart: React.FC<{ classes: ClassCount[] }> = ({ classes }) => {
  const data = classBars(classes);
  const height = Math.max(180, data.length * 42 + 50);
  return (
    <div role="img" aria-label={`Effectifs par classe : ${data.map(d => `${d.name} ${d.effectif} sur ${d.capacity}`).join(', ')}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={90} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: '#f1f5f2' }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="effectif" name="Effectif" stackId="a" fill={BRAND} radius={[0, 0, 0, 0]} />
          <Bar dataKey="libres" name="Places libres" stackId="a" fill={NEUTRAL} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Répartition payants / sociaux. */
export const StatusDonut: React.FC<{ payant: number; social: number }> = ({ payant, social }) => {
  const data = [
    { name: 'Payants', value: payant, color: BRAND },
    { name: 'Sociaux', value: social, color: GOLD },
  ];
  const total = payant + social;
  return (
    <div role="img" aria-label={`Répartition : ${payant} payants, ${social} sociaux`}>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={total > 0 && payant > 0 && social > 0 ? 2 : 0} stroke="none">
              {data.map(d => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{total}</span>
          <span className="text-xs text-slate-500">talibés</span>
        </div>
      </div>
      <ul className="mt-2 flex justify-center gap-5 text-sm">
        {data.map(d => (
          <li key={d.name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} aria-hidden />
            {d.name} : <strong className="tabular-nums">{d.value}</strong> <span className="text-slate-500">({percent(d.value, total)} %)</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Nombre d'inscrits par année scolaire. */
export const EvolutionChart: React.FC<{ data: { year: string; count: number }[] }> = ({ data }) => (
  <div role="img" aria-label={`Évolution des effectifs : ${data.map(d => `${d.year} ${d.count}`).join(', ')}`}>
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="year" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={32} />
        <Tooltip cursor={{ fill: '#f1f5f2' }} />
        <Bar dataKey="count" name="Inscrits" fill={BRAND_DARK} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const ATT_COLOR = { present: BRAND, late: GOLD, absent: DANGER, excused: NEUTRAL } as const;

/** Présences saisies aujourd'hui. */
export const AttendanceChart: React.FC<{ attendance: AttendanceToday }> = ({ attendance }) => {
  const data = attendanceSlices(attendance);
  return (
    <div>
      <p className="mb-2 text-sm">
        Taux de présence : <strong className="tabular-nums">{attendance.rate === null ? '—' : `${String(attendance.rate).replace('.', ',')} %`}</strong>
        <span className="text-slate-500"> sur {attendance.recorded} pointage{attendance.recorded > 1 ? 's' : ''}</span>
      </p>
      <div role="img" aria-label={`Présences du jour : ${data.map(d => `${d.label} ${d.value}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
            <Tooltip cursor={{ fill: '#f1f5f2' }} />
            <Bar dataKey="value" name="Talibés" maxBarSize={44}>
              {data.map(d => <Cell key={d.key} fill={ATT_COLOR[d.key]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/** Recettes et dépenses du mois. */
export const FinanceChart: React.FC<{ revenue: number; expenses: number }> = ({ revenue, expenses }) => {
  const data = [
    { name: 'Recettes', value: revenue, color: BRAND },
    { name: 'Dépenses', value: expenses, color: GOLD },
  ];
  return (
    <div role="img" aria-label={`Finances du mois : recettes ${formatFcfa(revenue)}, dépenses ${formatFcfa(expenses)}`}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip cursor={{ fill: '#f1f5f2' }} formatter={(v) => formatFcfa(Number(v))} />
          <Bar dataKey="value" name="Montant" maxBarSize={56}>
            {data.map(d => <Cell key={d.name} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Occupation de l'internat : jauge simple. */
export const OccupancyBar: React.FC<{ occupied: number; capacity: number }> = ({ occupied, capacity }) => {
  const pct = percent(occupied, capacity);
  return (
    <div>
      <p className="text-sm"><strong className="text-lg tabular-nums">{occupied}</strong> <span className="text-slate-500">/ {capacity} places occupées ({pct} %)</span></p>
      <div className="mt-2 h-2.5 rounded bg-slate-100" role="img" aria-label={`Internat occupé à ${pct} %`}>
        <div className="h-2.5 rounded bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{Math.max(0, capacity - occupied)} place{capacity - occupied > 1 ? 's' : ''} libre{capacity - occupied > 1 ? 's' : ''}</p>
    </div>
  );
};
