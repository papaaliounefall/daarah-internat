import React from 'react';
import { http } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { CalendarCheck, ClipboardList, CreditCard, IdCard, Megaphone, UserPlus } from 'lucide-react';
import { ErrorState, Spinner } from '../../components/ui';
import { useAuth } from '../../stores/authStore';
import { WelcomeBanner, type QuickAction } from './widgets';
import type { AssistantDashboard, Dashboard, DirectorDashboard, TeacherDashboard } from '../../types/dashboard';
import { AssistantView, DirectorView, TeacherView } from './views';

/** « samedi 7 novembre 2026 » à partir de la date ISO du serveur. */
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function actionsFor(role: string, canFinance: boolean): QuickAction[] {
  if (role === 'DIRECTEUR') {
    return [
      { label: 'Inscrire un talibé', to: '/app/talibes', icon: UserPlus },
      { label: 'Enregistrer un paiement', to: '/app/finances', icon: CreditCard },
      { label: 'Publier une information', to: '/app/notifications', icon: Megaphone },
    ];
  }
  if (role === 'ASSISTANT') {
    const list: QuickAction[] = [
      { label: 'Inscrire un talibé', to: '/app/talibes', icon: UserPlus },
      { label: 'Cartes talibé', to: '/app/cartes', icon: IdCard },
    ];
    if (canFinance) list.push({ label: 'Enregistrer un paiement', to: '/app/finances', icon: CreditCard });
    return list;
  }
  if (role === 'MAITRE') {
    return [
      { label: 'Saisir une leçon', to: '/app/suivi', icon: ClipboardList },
      { label: "Faire l'appel", to: '/app/presences', icon: CalendarCheck },
    ];
  }
  return [];
}

/** Tableau de bord du directeur, de l'assistant et du maître (le parent a sa propre page). */
export const DashboardPage: React.FC = () => {
  const user = useAuth(s => s.user);
  const { data, loading, error, reload } = useFetch(() => http.get<Dashboard>('/dashboard/').then(r => r.data), []);

  if (loading && !data) return <Spinner label="Chargement du tableau de bord…" />;
  if (error || !data) return <ErrorState message={error ?? 'Tableau de bord indisponible.'} onRetry={reload} />;

  const description = [longDate(data.today), data.academicYear ? `Année scolaire ${data.academicYear.name}` : 'Aucune année scolaire active']
    .filter(Boolean).join(' — ');

  return (
    <div>
      <WelcomeBanner name={user?.firstName || user?.fullName || ''} subtitle={description} actions={actionsFor(data.role, user?.canViewFinance ?? false)} />
      {data.role === 'DIRECTEUR' && <DirectorView d={data as DirectorDashboard} />}
      {data.role === 'ASSISTANT' && <AssistantView d={data as AssistantDashboard} />}
      {data.role === 'MAITRE' && <TeacherView d={data as TeacherDashboard} />}
    </div>
  );
};
