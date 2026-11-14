import { ageFrom, formatDate, formatFcfa, initials } from './format';

describe('format', () => {
  it('formate les dates en jj/mm/aaaa sans décalage de fuseau', () => {
    expect(formatDate('2025-10-06')).toBe('06/10/2025');
    expect(formatDate('2025-01-31T23:30:00Z')).toBe('31/01/2025');
    expect(formatDate(null)).toBe('');
    expect(formatDate('n/importe quoi')).toBe('');
  });

  it('formate les montants en FCFA', () => {
    expect(formatFcfa(25000)).toBe('25 000 FCFA');
    expect(formatFcfa(0)).toBe('0 FCFA');
    expect(formatFcfa(undefined)).toBe('0 FCFA');
  });

  it('calcule les initiales', () => {
    expect(initials('Ibrahima', 'Fall')).toBe('IF');
    expect(initials('', '')).toBe('?');
  });

  it("calcule l'âge selon l'anniversaire", () => {
    const today = new Date(2026, 5, 15); // 15 juin 2026
    expect(ageFrom('2016-06-15', today)).toBe(10);
    expect(ageFrom('2016-06-16', today)).toBe(9);
    expect(ageFrom(null, today)).toBeNull();
  });
});
