import type { Enrollment } from '../../types';
import { closeConfirmed, skipReason, studentsToReenroll, suggestYearName, yearState } from './yearUtils';

const enr = (student: string, status: Enrollment['status'] = 'TERMINEE') => ({ student, status }) as Enrollment;

describe('yearUtils', () => {
  it("détermine l'état d'une année", () => {
    expect(yearState({ isCurrent: true, isClosed: false })).toBe('CURRENT');
    expect(yearState({ isCurrent: false, isClosed: true })).toBe('CLOSED');
    expect(yearState({ isCurrent: false, isClosed: false })).toBe('UPCOMING');
  });

  it("propose un nom d'année à partir des dates", () => {
    expect(suggestYearName('2025-10-01', '2026-07-15')).toBe('2025-2026');
    expect(suggestYearName('2025-01-01', '2025-12-31')).toBe('2025');
    expect(suggestYearName('', '2026-07-15')).toBe('');
    expect(suggestYearName('2026-10-01', '2025-07-01')).toBe('');
  });

  it('liste les talibés à réinscrire sans les retirés ni ceux déjà inscrits', () => {
    const prev = [enr('a'), enr('b'), enr('c', 'RETIREE'), enr('a'), enr('d', 'ACTIVE')];
    const target = [enr('b', 'ACTIVE')];
    expect(studentsToReenroll(prev, target).map(e => e.student)).toEqual(['a', 'd']);
  });

  it("exige le nom exact de l'année pour clôturer", () => {
    expect(closeConfirmed(' 2025-2026 ', { name: '2025-2026' })).toBe(true);
    expect(closeConfirmed('2025', { name: '2025-2026' })).toBe(false);
  });

  it('met en forme les raisons de rejet', () => {
    expect(skipReason({ classroom: ['La classe est complète.'] })).toBe('La classe est complète.');
    expect(skipReason(['A', 'B'])).toBe('A B');
    expect(skipReason(undefined)).toBe('Raison inconnue.');
  });
});
