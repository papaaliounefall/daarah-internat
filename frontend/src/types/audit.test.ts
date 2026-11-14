import { displayValue, fieldLabel, parseChanges } from './audit';

describe('journal : lecture des modifications', () => {
  it('distingue anciennes/nouvelles valeurs et valeurs simples', () => {
    const entries = parseChanges({ status: { old: 'PAYANT', new: 'SOCIAL' }, Detail: '3 lignes' });
    expect(entries[0]).toMatchObject({ field: 'status', old: 'PAYANT', new: 'SOCIAL', diff: true });
    expect(entries[1]).toMatchObject({ field: 'Detail', value: '3 lignes', diff: false });
  });

  it("tolère l'absence de modifications", () => {
    expect(parseChanges(null)).toEqual([]);
    expect(parseChanges({})).toEqual([]);
  });

  it('formate les valeurs et les libellés de champ', () => {
    expect(displayValue(null)).toBe('—');
    expect(displayValue('')).toBe('—');
    expect(displayValue(true)).toBe('Oui');
    expect(displayValue(12)).toBe('12');
    expect(fieldLabel('birthDate')).toBe('Date de naissance');
    expect(fieldLabel('someUnknownField')).toBe('some unknown field');
  });
});
