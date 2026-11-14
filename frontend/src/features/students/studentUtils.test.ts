import type { Enrollment } from '../../types';
import { enrollmentForYear, quranLink } from './studentUtils';

describe('quranLink', () => {
  it('construit le lien du lecteur avec sourate, verset et nom encodé', () => {
    expect(quranLink(18, 10, 'Aïssatou Fall')).toBe('/app/coran?surah=18&ayah=10&student=A%C3%AFssatou+Fall');
  });
  it('omet le verset absent', () => {
    expect(quranLink(2, null, '')).toBe('/app/coran?surah=2');
  });
});

describe('enrollmentForYear', () => {
  const e = (id: string, year: string) => ({ id, academicYear: year }) as unknown as Enrollment;
  it("retrouve l'inscription de l'année", () => {
    const list = [e('a', 'y1'), e('b', 'y2')];
    expect(enrollmentForYear(list, 'y2')?.id).toBe('b');
    expect(enrollmentForYear(list, 'y3')).toBeUndefined();
    expect(enrollmentForYear(list, undefined)).toBeUndefined();
  });
});
