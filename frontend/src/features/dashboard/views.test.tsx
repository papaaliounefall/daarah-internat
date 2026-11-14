import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AssistantDashboard, DirectorDashboard, TeacherDashboard } from '../../types/dashboard';
import { AssistantView, DirectorView, TeacherView } from './views';

const att = { present: 0, absent: 0, late: 0, excused: 0, recorded: 0, rate: null };
const wrap = (el: React.ReactElement) => renderToString(<MemoryRouter>{el}</MemoryRouter>);

const emptyDirector: DirectorDashboard = {
  role: 'DIRECTEUR', today: '2026-11-07', academicYear: null,
  studentsTotal: 0, studentsByStatus: { PAYANT: 0, SOCIAL: 0 }, classes: [], teachersCount: 0, attendanceToday: att,
  enrollmentEvolution: [], boarding: { capacity: 0, occupied: 0 }, visitsPending: 0,
  alerts: { lowStockItems: 0, incompleteFiles: 0 },
};

describe('tableaux de bord : rendu sur installation vierge', () => {
  it('guide le directeur sans erreur et sans bloc finance', () => {
    const html = wrap(<DirectorView d={emptyDirector} />);
    expect(html).toContain('Pour démarrer');
    expect(html).toContain('Créer une année scolaire');
    expect(html).toContain('Aucun talibé inscrit');
    expect(html).not.toContain('Finances du mois');
  });

  it('affiche le bloc finance seulement si la clé est présente', () => {
    const d: DirectorDashboard = {
      ...emptyDirector,
      finance: { monthRevenue: 0, monthExpenses: 0, monthBalance: 0, arrearsTotal: 0, pendingExpenses: 0 },
    };
    expect(wrap(<DirectorView d={d} />)).toContain('Finances du mois');
  });

  it('masque le guide quand tout est en place', () => {
    const d: DirectorDashboard = {
      ...emptyDirector, academicYear: { id: 'y', name: '2025-2026' }, studentsTotal: 3, teachersCount: 1,
      studentsByStatus: { PAYANT: 2, SOCIAL: 1 },
      classes: [{ classId: 'c', className: 'Hifz 1', count: 3, capacity: 20, teacherName: 'M. Diop' }],
      enrollmentEvolution: [{ year: '2025-2026', count: 3 }],
    };
    const html = wrap(<DirectorView d={d} />);
    expect(html).not.toContain('Pour démarrer');
    expect(html).toContain('Effectifs par classe');
  });

  it("rend l'assistant et le maître sans données", () => {
    const a: AssistantDashboard = {
      role: 'ASSISTANT', today: '2026-11-07', academicYear: null, recentEnrollments: [], renewalsCount: 0,
      incompleteFiles: [], incompleteFilesCount: 0, classes: [], cardsToGenerate: 0, visitsPending: 0,
    };
    expect(wrap(<AssistantView d={a} />)).toContain('Aucune inscription récente');
    const t: TeacherDashboard = {
      role: 'MAITRE', today: '2026-11-07', academicYear: null, classes: [], studentsCount: 0, recentLessons: [],
      recentRevisions: [], toEvaluate: [], toEvaluateCount: 0, attendanceToday: att,
    };
    expect(wrap(<TeacherView d={t} />)).toContain('Aucune classe ne vous est attribuée');
  });
});
