import { describe, expect, it } from 'vitest';
import type { EvaluationCriterion, Lesson, QualityLevel, TimelineEntry } from '../../types/memorization';
import {
  evaluationBody, formatScore, groupByDate, hasErrors, lessonBody, nextStart, parseDecimal, qualityTone, scoresValid, suggestStart, todayIso,
  validateRange, validateScores,
} from './memorizationUtils';

describe('validation de la plage de versets', () => {
  const ok = { surah: '112', ayahStart: '1', ayahEnd: '4' };
  it('accepte une plage valide', () => {
    expect(hasErrors(validateRange(ok, 4))).toBe(false);
    expect(hasErrors(validateRange({ ...ok, ayahEnd: '1' }, 4))).toBe(false);
  });
  it('exige une sourate et des numéros entiers ≥ 1', () => {
    expect(validateRange({ ...ok, surah: '' }, null).surah).toBeTruthy();
    expect(validateRange({ ...ok, ayahStart: '0' }, 4).ayahStart).toBeTruthy();
    expect(validateRange({ ...ok, ayahEnd: '' }, 4).ayahEnd).toBeTruthy();
    expect(validateRange({ ...ok, ayahStart: '1.5' }, 4).ayahStart).toBeTruthy();
  });
  it('refuse une fin avant le début', () => {
    expect(validateRange({ ...ok, ayahStart: '3', ayahEnd: '2' }, 4).ayahEnd).toMatch(/supérieur/);
  });
  it('refuse un verset au-delà du nombre de versets de la sourate', () => {
    const e = validateRange({ ...ok, ayahEnd: '5' }, 4);
    expect(e.ayahEnd).toMatch(/4 versets/);
    expect(e.ayahStart).toBeUndefined();
    expect(validateRange({ ...ok, ayahStart: '9', ayahEnd: '9' }, 4).ayahStart).toMatch(/4 versets/);
  });
  it('ne contrôle pas le maximum tant que le nombre de versets est inconnu', () => {
    expect(hasErrors(validateRange({ ...ok, ayahEnd: '500' }, null))).toBe(false);
  });
  it('propose le verset suivant sauf en fin de sourate', () => {
    expect(nextStart(4, 7)).toBe(5);
    expect(nextStart(7, 7)).toBeNull();
  });
});

describe('suggestion de départ', () => {
  const count = (n: number) => (n === 112 ? 4 : null);
  it('propose le verset suivant de la même sourate', () => {
    expect(suggestStart(112, 2, count)).toEqual({ surah: '112', ayahStart: '3' });
  });
  it('ne propose pas de verset au-delà de la fin ni sans progression', () => {
    expect(suggestStart(112, 4, count)).toEqual({ surah: '112', ayahStart: '' });
    expect(suggestStart(null, null, count)).toEqual({ surah: '', ayahStart: '' });
  });
});

describe('notes', () => {
  const criteria: EvaluationCriterion[] = [
    { id: 'a', name: 'Exactitude', maxScore: '20.00', weight: '1.00', order: 1, isActive: true },
    { id: 'b', name: 'Fluidité', maxScore: '10.00', weight: '1.00', order: 2, isActive: true },
  ];
  it('lit les décimaux avec virgule ou point', () => {
    expect(parseDecimal('16,5')).toBe(16.5);
    expect(parseDecimal('16.50')).toBe(16.5);
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
    expect(formatScore('16.50')).toBe('16,5');
    expect(formatScore(null)).toBe('');
  });
  it('exige au moins un critère noté', () => {
    expect(validateScores({}, criteria).global).toBeTruthy();
    expect(scoresValid(validateScores({ a: '' }, criteria))).toBe(false);
    expect(scoresValid(validateScores({ a: '15' }, criteria))).toBe(true);
  });
  it('borne chaque note à la note maximale du critère', () => {
    const e = validateScores({ a: '15', b: '11' }, criteria);
    expect(e.byCriterion.b).toMatch(/entre 0 et 10/);
    expect(e.byCriterion.a).toBeUndefined();
    expect(scoresValid(validateScores({ a: '-1' }, criteria))).toBe(false);
    expect(validateScores({ a: 'x' }, criteria).byCriterion.a).toBeTruthy();
  });
  it("n'envoie que les critères notés", () => {
    const body = evaluationBody({ scope: ' Juz 30 ', appreciation: '', internalNotes: '', date: '2026-11-07', scores: { a: '15,5', b: '' } }, criteria);
    expect(body.scores).toEqual([{ criterion: 'a', score: 15.5 }]);
    expect(body.scope).toBe('Juz 30');
  });
});

describe('corps de requête leçon', () => {
  it('convertit en nombres et nettoie les textes', () => {
    const b = lessonBody({ surah: '112', ayahStart: '1', ayahEnd: '4', quality: 'JAYYID', appreciation: ' Bien ', observations: '', date: '2026-11-07' });
    expect(b).toMatchObject({ surah: 112, ayahStart: 1, ayahEnd: 4, appreciation: 'Bien' });
    expect(Object.keys(b)).not.toContain('juz');
  });
  it('date du jour au format ISO', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('chronologie', () => {
  const mk = (id: string, date: string): TimelineEntry => ({ type: 'LESSON', id, date } as unknown as Lesson & { type: 'LESSON' });
  it('regroupe par date en gardant l\'ordre', () => {
    const groups = groupByDate([mk('1', '2026-11-07'), mk('2', '2026-11-07'), mk('3', '2026-11-05')]);
    expect(groups.map(g => [g.date, g.entries.length])).toEqual([['2026-11-07', 2], ['2026-11-05', 1]]);
    expect(groupByDate([])).toEqual([]);
  });
  it('ton de qualité selon le rang', () => {
    const lv = ['A', 'B', 'C', 'D', 'E'].map((code, rank) => ({ id: code, code, label: code, labelAr: '', rank, isActive: true })) as QualityLevel[];
    expect(qualityTone('A', lv)).toBe('success');
    expect(qualityTone('C', lv)).toBe('info');
    expect(qualityTone('E', lv)).toBe('warning');
    expect(qualityTone('Z', lv)).toBe('neutral');
  });
});
