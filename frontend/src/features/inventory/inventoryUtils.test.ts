import { formatQuantity, movementError, parseQuantity, quantityAfter, stockLevel } from './inventoryUtils';

describe('niveau de stock', () => {
  it('distingue rupture, stock bas et normal', () => {
    expect(stockLevel({ quantity: 0, minThreshold: 5 })).toBe('out');
    expect(stockLevel({ quantity: 5, minThreshold: 5 })).toBe('low');
    expect(stockLevel({ quantity: 5.5, minThreshold: 5 })).toBe('ok');
  });
});

describe('quantités', () => {
  it('formate avec unité', () => {
    expect(formatQuantity(12.5, 'kg')).toBe('12,5 kg');
    expect(formatQuantity(1200)).toBe('1 200');
  });
  it('lit une saisie avec virgule', () => {
    expect(parseQuantity('2,5')).toBe(2.5);
    expect(parseQuantity('10')).toBe(10);
    expect(parseQuantity('1,234')).toBeNaN();
    expect(parseQuantity('abc')).toBeNaN();
    expect(parseQuantity('-3')).toBeNaN();
  });
  it('prévoit le stock après mouvement', () => {
    expect(quantityAfter('ENTREE', 10, 2.5)).toBe(12.5);
    expect(quantityAfter('SORTIE', 10, 4)).toBe(6);
    expect(quantityAfter('AJUSTEMENT', 10, 7)).toBe(7);
    expect(quantityAfter('ENTREE', 0.1, 0.2)).toBe(0.3);
  });
});

describe('contrôle des mouvements', () => {
  it('refuse une sortie supérieure au stock', () => {
    expect(movementError('SORTIE', 12, 10, '', 'kg')).toBe('Stock insuffisant : 10 kg disponible.');
  });
  it('exige une quantité positive sauf pour un ajustement', () => {
    expect(movementError('ENTREE', 0, 10, '', 'kg')).toMatch(/supérieure à 0/);
    expect(movementError('AJUSTEMENT', 0, 10, 'Inventaire annuel', 'kg')).toBeNull();
  });
  it("exige un motif pour un ajustement", () => {
    expect(movementError('AJUSTEMENT', 4, 10, ' ', 'kg')).toMatch(/motif/);
    expect(movementError('AJUSTEMENT', 4, 10, 'Comptage', 'kg')).toBeNull();
  });
  it('refuse une quantité invalide', () => {
    expect(movementError('ENTREE', Number.NaN, 10, '', 'kg')).toMatch(/valide/);
  });
});
