import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, BedDouble, BookMarked, CalendarCheck, Clock, IdCard, Receipt, TrendingDown, TrendingUp, UserCheck, Users, Wallet } from 'lucide-react';
import { Badge } from '../../components/ui';
import { formatDate, formatFcfa } from '../../lib/format';
import type { AssistantDashboard, ClassCount, DirectorDashboard, FinanceBlock, TeacherDashboard } from '../../types/dashboard';
import { AttendanceChart, ClassBarChart, EvolutionChart, FinanceChart, OccupancyBar, StatusDonut } from './charts';
import { assistantSetupSteps, directorSetupSteps, hasEvolution, pendingSteps } from './dashboardUtils';
import { BlockEmpty, ChartCard, SetupChecklist, StatTile } from './widgets';

const rate = (r: number | null) => (r === null ? '—' : `${String(r).replace('.', ',')} %`);

const ClassesBlock: React.FC<{ classes: ClassCount[]; hasYear: boolean; canCreate: boolean; className?: string }> = ({ classes, hasYear, canCreate, className }) => (
  <ChartCard title="Effectifs par classe" to="/app/classes" linkLabel="Classes" className={className}>
    {classes.length > 0 ? <ClassBarChart classes={classes} /> : !hasYear ? (
      <BlockEmpty title="Aucune année scolaire active" hint="Les classes appartiennent à une année scolaire." />
    ) : (
      <BlockEmpty title="Aucune classe pour cette année" hint={canCreate ? 'Créez les classes et attribuez-leur un maître.' : undefined} to={canCreate ? '/app/classes' : undefined} action="Créer une classe" />
    )}
  </ChartCard>
);

const AttendanceBlock: React.FC<{ data: DirectorDashboard['attendanceToday'] }> = ({ data }) => (
  <ChartCard title="Présences du jour" to="/app/presences" linkLabel="Présences">
    {data.recorded > 0 ? <AttendanceChart attendance={data} /> : (
      <BlockEmpty title="Aucune présence saisie aujourd'hui" hint="Les maîtres font l'appel de leur classe." to="/app/presences" action="Ouvrir les présences" />
    )}
  </ChartCard>
);

const FinanceView: React.FC<{ finance: FinanceBlock }> = ({ finance }) => (
  <section aria-label="Finances du mois" className="mt-6">
    <h2 className="mb-3 text-sm font-semibold text-ink">Finances du mois</h2>
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Recettes et dépenses" to="/app/finances" linkLabel="Finances">
        {finance.monthRevenue === 0 && finance.monthExpenses === 0
          ? <BlockEmpty title="Aucune opération ce mois-ci" hint="Les paiements et dépenses validés apparaîtront ici." to="/app/finances" action="Ouvrir les finances" />
          : <FinanceChart revenue={finance.monthRevenue} expenses={finance.monthExpenses} />}
      </ChartCard>
      <div className="grid grid-cols-2 content-start gap-4 lg:col-span-2 lg:grid-cols-4">
        <StatTile icon={TrendingUp} label="Recettes du mois" value={formatFcfa(finance.monthRevenue)} to="/app/finances" />
        <StatTile icon={TrendingDown} label="Dépenses du mois" value={formatFcfa(finance.monthExpenses)} to="/app/finances" />
        <StatTile icon={Wallet} label="Solde du mois" value={formatFcfa(finance.monthBalance)} to="/app/finances" tone={finance.monthBalance < 0 ? 'danger' : 'default'} />
        <StatTile icon={Receipt} label="Impayés échus" value={formatFcfa(finance.arrearsTotal)} to="/app/finances" tone={finance.arrearsTotal > 0 ? 'warn' : 'default'} hint={finance.pendingExpenses > 0 ? `${finance.pendingExpenses} dépense(s) à valider` : undefined} />
      </div>
    </div>
  </section>
);

export const DirectorView: React.FC<{ d: DirectorDashboard }> = ({ d }) => {
  const steps = directorSetupSteps(d);
  const pending = pendingSteps(steps);
  const alerts: { label: string; to: string }[] = [];
  if (d.alerts.incompleteFiles > 0) alerts.push({ label: `${d.alerts.incompleteFiles} dossier(s) de talibé incomplet(s)`, to: '/app/talibes' });
  if (d.alerts.lowStockItems > 0) alerts.push({ label: `${d.alerts.lowStockItems} article(s) en stock bas`, to: '/app/stocks' });
  if (d.finance && d.finance.pendingExpenses > 0) alerts.push({ label: `${d.finance.pendingExpenses} dépense(s) en attente de validation`, to: '/app/finances' });
  if (d.finance && d.finance.arrearsTotal > 0) alerts.push({ label: `${formatFcfa(d.finance.arrearsTotal)} d'impayés échus`, to: '/app/finances' });

  return (
    <div>
      {pending.length > 0 && <SetupChecklist steps={steps} />}
      {alerts.length > 0 && <AlertList alerts={alerts} />}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile icon={Users} label="Talibés" value={d.studentsTotal} to="/app/talibes" hint="dossiers actifs" />
        <StatTile icon={BookMarked} label="Maîtres coraniques" value={d.teachersCount} to="/app/utilisateurs" />
        <StatTile icon={CalendarCheck} label="Présences du jour" value={d.attendanceToday.recorded > 0 ? rate(d.attendanceToday.rate) : '—'} to="/app/presences" hint={d.attendanceToday.recorded > 0 ? `${d.attendanceToday.absent} absent(s)` : 'pas encore saisies'} />
        <StatTile icon={BedDouble} label="Internat" value={`${d.boarding.occupied} / ${d.boarding.capacity}`} to="/app/internat" hint="places occupées" />
        <StatTile icon={Clock} label="Visites en attente" value={d.visitsPending} to="/app/visites" tone={d.visitsPending > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ClassesBlock classes={d.classes} hasYear={d.academicYear !== null} canCreate className="lg:col-span-2" />
        <ChartCard title="Talibés payants et sociaux" to="/app/talibes" linkLabel="Talibés">
          {d.studentsTotal > 0 ? <StatusDonut payant={d.studentsByStatus.PAYANT} social={d.studentsByStatus.SOCIAL} /> : (
            <BlockEmpty title="Aucun talibé inscrit" hint="La répartition apparaîtra avec les premières inscriptions." to="/app/talibes" action="Inscrire un talibé" />
          )}
        </ChartCard>
        <ChartCard title="Évolution des effectifs" to="/app/parametres" linkLabel="Années scolaires" className="lg:col-span-2">
          {hasEvolution(d.enrollmentEvolution) ? <EvolutionChart data={d.enrollmentEvolution} /> : (
            <BlockEmpty title="Pas encore d'historique" hint="Le nombre d'inscrits par année s'affichera après les premières inscriptions." />
          )}
        </ChartCard>
        <AttendanceBlock data={d.attendanceToday} />
        <ChartCard title="Occupation de l'internat" to="/app/internat" linkLabel="Internat">
          {d.boarding.capacity > 0 ? <OccupancyBar occupied={d.boarding.occupied} capacity={d.boarding.capacity} /> : (
            <BlockEmpty title="Aucune chambre configurée" hint="Ajoutez les bâtiments et les chambres de l'internat." to="/app/internat" action="Ouvrir l'internat" />
          )}
        </ChartCard>
      </div>

      {d.finance && <FinanceView finance={d.finance} />}
    </div>
  );
};

const AlertList: React.FC<{ alerts: { label: string; to: string }[] }> = ({ alerts }) => (
  <section aria-label="Alertes" className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
    <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle className="h-4 w-4" aria-hidden /> À traiter</h2>
    <ul className="space-y-0.5 text-sm">
      {alerts.map(a => <li key={a.label}><Link to={a.to} className="text-amber-900 underline hover:no-underline">{a.label}</Link></li>)}
    </ul>
  </section>
);

export const AssistantView: React.FC<{ d: AssistantDashboard }> = ({ d }) => {
  const steps = assistantSetupSteps(d);
  const pending = pendingSteps(steps);
  return (
    <div>
      {pending.length > 0 && <SetupChecklist steps={steps} />}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile icon={UserCheck} label="Réinscriptions" value={d.renewalsCount} to="/app/talibes" hint="cette année" />
        <StatTile icon={AlertTriangle} label="Dossiers incomplets" value={d.incompleteFilesCount} to="/app/talibes" tone={d.incompleteFilesCount > 0 ? 'warn' : 'default'} />
        <StatTile icon={IdCard} label="Cartes à générer" value={d.cardsToGenerate} to="/app/cartes" />
        <StatTile icon={Clock} label="Visites en attente" value={d.visitsPending} to="/app/visites" tone={d.visitsPending > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Inscriptions récentes" to="/app/talibes" linkLabel="Talibés">
          {d.recentEnrollments.length === 0 ? (
            <BlockEmpty title="Aucune inscription récente" hint="Les dernières inscriptions de l'année apparaîtront ici." to="/app/talibes" action="Inscrire un talibé" />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentEnrollments.map(e => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Link to={`/app/talibes/${e.studentId}`} className="font-medium hover:text-brand-700 hover:underline">{e.studentName}</Link>
                    <p className="text-xs text-slate-500">{e.className || 'Sans classe'} — {formatDate(e.enrolledOn)}</p>
                  </div>
                  <Badge tone={e.kind === 'REINSCRIPTION' ? 'info' : 'success'}>{e.kind === 'REINSCRIPTION' ? 'Réinscription' : 'Inscription'}</Badge>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Dossiers à compléter" to="/app/talibes" linkLabel="Talibés">
          {d.incompleteFiles.length === 0 ? (
            <BlockEmpty title="Aucun dossier incomplet" hint="Photo, naissance, téléphone et parents sont renseignés." />
          ) : (
            <ul className="divide-y divide-line">
              {d.incompleteFiles.slice(0, 8).map(f => (
                <li key={f.studentId} className="py-2 text-sm">
                  <Link to={`/app/talibes/${f.studentId}`} className="font-medium hover:text-brand-700 hover:underline">{f.studentName}</Link>
                  <p className="text-xs text-slate-500">Manque : {f.missing.join(', ')}</p>
                </li>
              ))}
              {d.incompleteFilesCount > 8 && <li className="pt-2 text-xs text-slate-500">et {d.incompleteFilesCount - 8} autre(s)…</li>}
            </ul>
          )}
        </ChartCard>

        <ClassesBlock classes={d.classes} hasYear={d.academicYear !== null} canCreate className="lg:col-span-2" />
      </div>

      {d.finance && <FinanceView finance={d.finance} />}
    </div>
  );
};

export const TeacherView: React.FC<{ d: TeacherDashboard }> = ({ d }) => {
  const noClass = d.classes.length === 0;
  return (
    <div>
      {noClass && (
        <p role="status" className="mb-6 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
          Aucune classe ne vous est attribuée pour l'instant. Le directeur doit vous en confier une.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatTile icon={Users} label="Mes talibés" value={d.studentsCount} to="/app/talibes" />
        <StatTile icon={BookMarked} label="À évaluer" value={d.toEvaluateCount} to="/app/suivi" hint="sans évaluation depuis 30 jours" tone={d.toEvaluateCount > 0 ? 'warn' : 'default'} />
        <StatTile label="Présences du jour" value={d.attendanceToday.recorded > 0 ? rate(d.attendanceToday.rate) : '—'} to="/app/presences" hint={d.attendanceToday.recorded > 0 ? `${d.attendanceToday.absent} absent(s)` : 'appel à faire'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {!noClass && <ClassesBlock classes={d.classes} hasYear canCreate={false} />}
        <AttendanceBlock data={d.attendanceToday} />

        <ChartCard title="Leçons récentes" to="/app/suivi" linkLabel="Suivi coranique">
          {d.recentLessons.length === 0 ? (
            <BlockEmpty title="Aucune leçon enregistrée" hint="Saisissez les leçons de vos talibés dans le suivi coranique." to="/app/suivi" action="Ouvrir le suivi" />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentLessons.map(l => (
                <li key={l.id} className="py-2 text-sm">
                  <Link to={`/app/talibes/${l.studentId}`} className="font-medium hover:text-brand-700 hover:underline">{l.studentName}</Link>
                  <p className="text-xs text-slate-500">{l.surahName} {l.ayahStart}–{l.ayahEnd} — {formatDate(l.date)}</p>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Révisions récentes" to="/app/suivi" linkLabel="Suivi coranique">
          {d.recentRevisions.length === 0 ? (
            <BlockEmpty title="Aucune révision enregistrée" />
          ) : (
            <ul className="divide-y divide-line">
              {d.recentRevisions.map(r => (
                <li key={r.id} className="py-2 text-sm">
                  <Link to={`/app/talibes/${r.studentId}`} className="font-medium hover:text-brand-700 hover:underline">{r.studentName}</Link>
                  <p className="text-xs text-slate-500">{r.surahName} {r.ayahStart}–{r.ayahEnd} — {formatDate(r.date)}</p>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard title="Talibés à évaluer" to="/app/suivi" linkLabel="Suivi coranique" className="lg:col-span-2">
          {d.toEvaluate.length === 0 ? (
            <BlockEmpty title="Aucune évaluation en retard" hint={d.studentsCount === 0 ? "Vous n'avez pas encore de talibés dans vos classes." : 'Tous vos talibés ont été évalués ces 30 derniers jours.'} />
          ) : (
            <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {d.toEvaluate.map(s => (
                <li key={s.studentId} className="border-b border-line py-2 text-sm">
                  <Link to={`/app/talibes/${s.studentId}`} className="hover:text-brand-700 hover:underline">{s.studentName}</Link>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
};
