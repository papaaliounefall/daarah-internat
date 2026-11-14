import type { AssistantDashboard, AttendanceToday, ClassCount, DirectorDashboard } from '../../types/dashboard';

/** Pourcentage entier borné à 0–100 ; 0 si le total est nul. */
export const percent = (part: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, Math.round((100 * part) / total))) : 0;

export interface SetupStep { id: string; label: string; hint: string; to?: string; done: boolean }

/** Étapes de mise en route d'une installation vierge (directeur). */
export function directorSetupSteps(d: Pick<DirectorDashboard, 'academicYear' | 'classes' | 'teachersCount' | 'studentsTotal'>): SetupStep[] {
  return [
    { id: 'year', label: 'Créer une année scolaire', hint: "Créez-la puis activez-la dans Paramètres.", to: '/app/parametres', done: d.academicYear !== null },
    { id: 'teachers', label: 'Créer les comptes des maîtres', hint: 'Chaque maître coranique a son propre compte.', to: '/app/utilisateurs', done: d.teachersCount > 0 },
    { id: 'classes', label: 'Créer les classes', hint: 'Nommez les classes et attribuez-leur un maître.', to: '/app/classes', done: d.classes.length > 0 },
    { id: 'students', label: 'Inscrire les talibés', hint: 'Constituez les dossiers et affectez les classes.', to: '/app/talibes', done: d.studentsTotal > 0 },
  ];
}

/** Même logique pour l'assistant, qui ne gère pas les années ni les comptes de maîtres. */
export function assistantSetupSteps(d: Pick<AssistantDashboard, 'academicYear' | 'classes' | 'recentEnrollments' | 'cardsToGenerate' | 'incompleteFilesCount'>): SetupStep[] {
  const hasStudents = d.recentEnrollments.length > 0 || d.cardsToGenerate > 0 || d.incompleteFilesCount > 0;
  return [
    { id: 'year', label: "Attendre l'activation d'une année scolaire", hint: "Le directeur crée et active l'année dans Paramètres.", done: d.academicYear !== null },
    { id: 'classes', label: 'Créer les classes', hint: 'Nommez les classes et fixez leur capacité.', to: '/app/classes', done: d.classes.length > 0 },
    { id: 'students', label: 'Inscrire les talibés', hint: 'Constituez les dossiers et affectez les classes.', to: '/app/talibes', done: hasStudents },
  ];
}

export const pendingSteps = (steps: SetupStep[]) => steps.filter(s => !s.done);

export interface ClassBar { name: string; effectif: number; libres: number; capacity: number }

/** Données du graphique « effectifs par classe » : effectif et places libres (jamais négatives). */
export function classBars(classes: ClassCount[]): ClassBar[] {
  return classes.map(c => ({ name: c.className, effectif: c.count, libres: Math.max(0, c.capacity - c.count), capacity: c.capacity }));
}

export interface AttendanceSlice { key: 'present' | 'late' | 'absent' | 'excused'; label: string; value: number }

export function attendanceSlices(a: AttendanceToday): AttendanceSlice[] {
  return [
    { key: 'present', label: 'Présents', value: a.present },
    { key: 'late', label: 'En retard', value: a.late },
    { key: 'absent', label: 'Absents', value: a.absent },
    { key: 'excused', label: 'Excusés', value: a.excused },
  ];
}

/** Au moins une année avec des inscrits : sinon le graphique d'évolution n'a rien à montrer. */
export const hasEvolution = (e: { count: number }[]) => e.some(p => p.count > 0);
