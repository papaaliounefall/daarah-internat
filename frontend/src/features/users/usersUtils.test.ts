import { canEditUser, creatableRoles, generatePassword, suggestUsername } from './usersUtils';

describe('droits de gestion des comptes', () => {
  it("limite l'assistant aux parents", () => {
    expect(creatableRoles('ASSISTANT')).toEqual(['PARENT']);
    expect(creatableRoles('DIRECTEUR')).toContain('MAITRE');
    expect(creatableRoles('MAITRE')).toEqual([]);
    expect(canEditUser('ASSISTANT', 'PARENT')).toBe(true);
    expect(canEditUser('ASSISTANT', 'MAITRE')).toBe(false);
    expect(canEditUser('DIRECTEUR', 'ASSISTANT')).toBe(true);
  });
});

describe('generatePassword', () => {
  it('produit 12 caractères avec chiffre et caractère spécial, sans caractères ambigus', () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[!?#%+=]/);
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
  it('est déterministe avec un générateur injecté', () => {
    expect(generatePassword(12, () => 0)).toBe(generatePassword(12, () => 0));
  });
});

describe('suggestUsername', () => {
  it('retire accents et espaces', () => {
    expect(suggestUsername('Aïssatou', 'Ndiaye Fall')).toBe('aissatou.ndiayefall');
    expect(suggestUsername('', 'Diop')).toBe('diop');
    expect(suggestUsername('', '')).toBe('');
  });
});
