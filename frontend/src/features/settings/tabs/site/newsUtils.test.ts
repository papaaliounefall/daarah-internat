import { describe, expect, it } from 'vitest';
import { emptyNewsForm, todayIso, validateNews } from './newsUtils';

describe('newsUtils', () => {
  it('formate la date du jour', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('exige un titre et une date valide', () => {
    const f = emptyNewsForm(new Date(2026, 10, 7));
    expect(validateNews(f).title).toBeDefined();
    expect(validateNews({ ...f, title: 'Rentrée' })).toEqual({});
    expect(validateNews({ ...f, title: 'x', publishedOn: '' }).publishedOn).toBeDefined();
  });
  it('limite les longueurs', () => {
    const f = { ...emptyNewsForm(), title: 'x', summary: 'y'.repeat(301) };
    expect(validateNews(f).summary).toMatch(/300/);
  });
});
