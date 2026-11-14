import type { AssistantDashboard, DirectorDashboard } from '../../types/dashboard';
import { assistantSetupSteps, attendanceSlices, classBars, directorSetupSteps, hasEvolution, pendingSteps, percent } from './dashboardUtils';

describe('dashboardUtils', () => {
  it('calcule un pourcentage borné', () => {
    expect(percent(5, 20)).toBe(25);
    expect(percent(30, 20)).toBe(100);
    expect(percent(3, 0)).toBe(0);
  });

  it("guide une installation vierge pas à pas", () => {
    const empty = { academicYear: null, classes: [], teachersCount: 0, studentsTotal: 0 } as Pick<DirectorDashboard, 'academicYear' | 'classes' | 'teachersCount' | 'studentsTotal'>;
    expect(pendingSteps(directorSetupSteps(empty)).map(s => s.id)).toEqual(['year', 'teachers', 'classes', 'students']);

    const ready = {
      academicYear: { id: 'y', name: '2025-2026' },
      classes: [{ classId: 'c', className: 'A', count: 1, capacity: 20, teacherName: '' }],
      teachersCount: 1, studentsTotal: 1,
    };
    expect(pendingSteps(directorSetupSteps(ready))).toEqual([]);
  });

  it("détecte l'absence de talibés pour l'assistant", () => {
    const base = { academicYear: { id: 'y', name: 'A' }, classes: [], recentEnrollments: [], cardsToGenerate: 0, incompleteFilesCount: 0 } as Pick<AssistantDashboard, 'academicYear' | 'classes' | 'recentEnrollments' | 'cardsToGenerate' | 'incompleteFilesCount'>;
    expect(pendingSteps(assistantSetupSteps(base)).map(s => s.id)).toEqual(['classes', 'students']);
    expect(pendingSteps(assistantSetupSteps({ ...base, cardsToGenerate: 3 })).map(s => s.id)).toEqual(['classes']);
  });

  it('prépare les données de graphiques', () => {
    expect(classBars([{ classId: '1', className: 'A', count: 25, capacity: 20, teacherName: '' }])).toEqual([{ name: 'A', effectif: 25, libres: 0, capacity: 20 }]);
    const slices = attendanceSlices({ present: 10, absent: 2, late: 1, excused: 0, recorded: 13, rate: 84.6 });
    expect(slices.map(s => s.value)).toEqual([10, 1, 2, 0]);
    expect(hasEvolution([{ count: 0 }])).toBe(false);
    expect(hasEvolution([{ count: 0 }, { count: 4 }])).toBe(true);
  });
});
