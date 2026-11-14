import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Async } from '../../components/ops/Async';
import { PageHeader } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { getParentDashboard, listMyChildren } from '../../services/parent';
import { useAuth } from '../../stores/authStore';
import { StudentTimeline } from '../memorization/StudentTimeline';
import { ChildAttendance } from './ChildAttendance';
import { ChildPayments } from './ChildPayments';
import { ChildProfile } from './ChildProfile';
import { ParentNotifications } from './ParentNotifications';

/** Espace parent (/app et /app/mes-enfants) : suivi de chaque enfant lié au compte. Données issues uniquement de l'API. */
export const ParentPortal: React.FC = () => {
  const user = useAuth(s => s.user)!;
  const [params, setParams] = useSearchParams();
  const children = useFetch(listMyChildren, []);
  const dashboard = useFetch(getParentDashboard, []);
  const [showTimeline, setShowTimeline] = useState(false);

  const selectedId = params.get('enfant');
  const list = children.data ?? [];
  const student = useMemo(() => list.find(s => s.id === selectedId) ?? list[0] ?? null, [list, selectedId]);
  const summary = dashboard.data?.children.find(c => c.studentId === student?.id) ?? null;

  return (
    <div>
      <PageHeader
        title="Mes enfants"
        description={`Bonjour ${user.firstName || user.fullName}. Retrouvez ici le suivi de vos enfants au Daara.`}
        actions={
          <Link to="/app/visites" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-ink hover:bg-slate-50">
            <Clock className="h-4 w-4" aria-hidden /> Demander une visite
          </Link>
        }
      />

      <ParentNotifications />

      <Async
        state={children}
        isEmpty={d => d.length === 0}
        emptyTitle="Aucun enfant n'est lié à votre compte"
        emptyHint="Contactez la direction du Daara pour associer vos enfants à votre compte."
      >
        {() => student && (
          <div>
            {list.length > 1 && (
              <div role="tablist" aria-label="Choisir un enfant" className="mb-4 flex gap-2 overflow-x-auto pb-1">
                {list.map(s => {
                  const on = s.id === student.id;
                  return (
                    <button
                      key={s.id} role="tab" aria-selected={on} type="button"
                      onClick={() => { setParams({ enfant: s.id }, { replace: true }); setShowTimeline(false); }}
                      className={`min-h-11 shrink-0 rounded-md border px-4 text-sm font-medium ${on ? 'border-brand-800 bg-brand-800 text-white' : 'border-line bg-white text-ink hover:bg-brand-50'}`}
                    >
                      {s.firstName || s.fullName}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChildProfile student={student} summary={summary} />
              <div className="space-y-4">
                <ChildAttendance studentId={student.id} summary={summary?.attendance30Days} />
                <ChildPayments studentId={student.id} />
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowTimeline(v => !v)}
                aria-expanded={showTimeline}
                className="flex min-h-11 w-full items-center justify-between rounded-md border border-line bg-white px-4 text-left text-sm font-medium text-ink hover:bg-slate-50"
              >
                Historique du suivi coranique
                {showTimeline ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
              </button>
              {showTimeline && <div className="mt-3"><StudentTimeline studentId={student.id} /></div>}
            </div>
          </div>
        )}
      </Async>

      {/* Si les enfants sont chargés mais pas le tableau de bord, le reste de la page reste utilisable. */}
      {dashboard.error && children.data && children.data.length > 0 && (
        <p role="status" className="mt-3 text-xs text-slate-500">Certains résumés n'ont pas pu être chargés : {dashboard.error}</p>
      )}
    </div>
  );
};

export default ParentPortal;
