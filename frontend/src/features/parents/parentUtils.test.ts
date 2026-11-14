import { describe, expect, it } from 'vitest';
import { attendanceTotal, daysAgoIso, feeKindLabel, methodLabel, presenceRate, versesLabel } from './parentUtils';

describe('espace parent', () => {
  it('calcule la date de début de la fenêtre de 30 jours', () => {
    expect(daysAgoIso(30, new Date(2026, 10, 7))).toBe('2026-10-08');
    expect(daysAgoIso(30, new Date(2026, 0, 10))).toBe('2025-12-11');
  });
  it('taux de présence : retards comptés présents, excusés au dénominateur', () => {
    const a = { present: 16, absent: 2, late: 2, excused: 2 };
    expect(attendanceTotal(a)).toBe(22);
    expect(presenceRate(a)).toBe(81.8);
    expect(presenceRate({ present: 0, absent: 0, late: 0, excused: 0 })).toBeNull();
  });
  it('libellés', () => {
    expect(methodLabel('ORANGE_MONEY')).toBe('Orange Money');
    expect(methodLabel('X')).toBe('X');
    expect(feeKindLabel('MENSUALITE')).toBe('Mensualité');
    expect(versesLabel(4, 4)).toBe('verset 4');
    expect(versesLabel(1, 6)).toBe('versets 1 à 6');
  });
});
