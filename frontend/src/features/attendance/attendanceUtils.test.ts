import { describe, expect, it } from 'vitest';
import type { AttendanceRecord } from '../../types/attendance';
import { buildRecords, countMarks, dayBars, formatRate, initialMarks, isMonth, monthOf, toggleStatus, todayIso } from './attendanceUtils';

const rec = (studentId: string, status: AttendanceRecord['status'], reason = ''): AttendanceRecord => ({ studentId, student: studentId, status, reason } as AttendanceRecord);

describe('saisie rapide des présences', () => {
  it('tout le monde est présent par défaut, sauf pointage déjà enregistré', () => {
    const marks = initialMarks(['a', 'b', 'c'], [rec('b', 'ABSENT', 'Maladie')]);
    expect(marks.a).toEqual({ status: 'PRESENT', reason: '' });
    expect(marks.b).toEqual({ status: 'ABSENT', reason: 'Maladie' });
    expect(Object.keys(marks)).toHaveLength(3);
  });
  it('un tap sur le statut actif revient à présent', () => {
    expect(toggleStatus('PRESENT', 'ABSENT')).toBe('ABSENT');
    expect(toggleStatus('ABSENT', 'ABSENT')).toBe('PRESENT');
    expect(toggleStatus('ABSENT', 'RETARD')).toBe('RETARD');
  });
  it('compte chaque statut', () => {
    const c = countMarks({ a: { status: 'PRESENT', reason: '' }, b: { status: 'ABSENT', reason: '' }, c: { status: 'RETARD', reason: '' }, d: { status: 'EXCUSE', reason: '' }, e: { status: 'PRESENT', reason: '' } });
    expect(c).toEqual({ present: 2, absent: 1, late: 1, excused: 1 });
  });
  it("n'envoie le motif que pour un statut autre que présent", () => {
    const records = buildRecords(['a', 'b'], { a: { status: 'PRESENT', reason: 'oublié' }, b: { status: 'ABSENT', reason: '  Maladie ' } });
    expect(records).toEqual([{ student: 'a', status: 'PRESENT' }, { student: 'b', status: 'ABSENT', reason: 'Maladie' }]);
  });
});

describe('statistiques', () => {
  it('formate les taux', () => {
    expect(formatRate(84.5)).toBe('84,5 %');
    expect(formatRate(null)).toBe('—');
    expect(formatRate(100)).toBe('100 %');
  });
  it('trie les jours et utilise le jour du mois', () => {
    const bars = dayBars([
      { date: '2026-03-10', present: 1, absent: 0, late: 0, excused: 0, attendanceRate: 100 },
      { date: '2026-03-02', present: 0, absent: 1, late: 0, excused: 0, attendanceRate: 0 },
    ]);
    expect(bars.map(b => b.day)).toEqual(['2', '10']);
  });
  it('dates et mois', () => {
    expect(todayIso(new Date(2026, 2, 5))).toBe('2026-03-05');
    expect(monthOf('2026-11-07')).toBe('2026-11');
    expect(monthOf(undefined, new Date(2026, 4, 1))).toBe('2026-05');
    expect(isMonth('2026-13')).toBe(false);
    expect(isMonth('2026-12')).toBe(true);
  });
});
