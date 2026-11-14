import { isValidReason, plainErrorMessage } from './apiErrors';

const apiError = (status: number, data: unknown) => ({ response: { status, data } });

describe('plainErrorMessage', () => {
  it('retire les noms de champs techniques', () => {
    expect(plainErrorMessage(apiError(400, { room: ['La chambre est complète (4 places).'] })))
      .toBe('La chambre est complète (4 places).');
  });
  it('utilise detail et non_field_errors', () => {
    expect(plainErrorMessage(apiError(400, { detail: 'Déjà affecté.' }))).toBe('Déjà affecté.');
    expect(plainErrorMessage(apiError(400, { nonFieldErrors: ['Lit déjà pris.'], student: ['Talibé archivé.'] })))
      .toBe('Lit déjà pris. Talibé archivé.');
  });
  it('retombe sur le message générique sans réponse', () => {
    expect(plainErrorMessage({})).toMatch(/Impossible de joindre/);
  });
});

describe('isValidReason', () => {
  it('exige 3 caractères utiles', () => {
    expect(isValidReason('  a ')).toBe(false);
    expect(isValidReason('Erreur de saisie')).toBe(true);
  });
});
