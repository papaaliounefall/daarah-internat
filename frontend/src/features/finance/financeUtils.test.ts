import { formatFcfa } from '../../lib/format';
import {
  compactFcfa, isoDate, monthLabel, monthShort, monthToDate, parseAmount, paymentAmountError, payableDues,
  periodError, remainingBalance, sharePercent, yearToDate,
} from './financeUtils';
import type { Due } from '../../types/finance';

const due = (over: Partial<Due>): Due => ({
  id: 'd', student: 's', studentName: 'A', registrationNumber: 'R', academicYear: 'y', feeSchedule: null, kind: 'MENSUALITE',
  label: 'Mensualité', period: '', dueDate: '2026-01-05', amount: 10000, paidAmount: 0, balance: 10000, status: 'IMPAYEE',
  isOverdue: false, isCancelled: false, ...over,
});

describe('solde restant', () => {
  it("se calcule à partir du montant et des paiements non annulés", () => {
    expect(remainingBalance({ amount: 10000, paidAmount: 4000, isCancelled: false })).toBe(6000);
    expect(remainingBalance({ amount: 10000, paidAmount: 10000, isCancelled: false })).toBe(0);
  });
  it('ne devient jamais négatif et vaut 0 pour une échéance annulée', () => {
    expect(remainingBalance({ amount: 10000, paidAmount: 12000, isCancelled: false })).toBe(0);
    expect(remainingBalance({ amount: 10000, paidAmount: 0, isCancelled: true })).toBe(0);
  });
  it('filtre les échéances encaissables', () => {
    const list = [due({ id: '1' }), due({ id: '2', paidAmount: 10000 }), due({ id: '3', isCancelled: true })];
    expect(payableDues(list).map(d => d.id)).toEqual(['1']);
  });
});

describe('contrôle du montant de paiement', () => {
  it("refuse un montant nul, négatif ou décimal", () => {
    expect(paymentAmountError(0, null, formatFcfa)).toMatch(/supérieur à 0/);
    expect(paymentAmountError(-5, null, formatFcfa)).toMatch(/supérieur à 0/);
    expect(paymentAmountError(10.5, null, formatFcfa)).toMatch(/entier/);
    expect(paymentAmountError(Number.NaN, null, formatFcfa)).toMatch(/entier/);
  });
  it('refuse un montant supérieur au solde restant', () => {
    expect(paymentAmountError(7000, 6000, formatFcfa)).toBe("Le montant dépasse le solde restant de l'échéance (6 000 FCFA).");
  });
  it('accepte un paiement partiel, soldé ou libre', () => {
    expect(paymentAmountError(2000, 6000, formatFcfa)).toBeNull();
    expect(paymentAmountError(6000, 6000, formatFcfa)).toBeNull();
    expect(paymentAmountError(50000, null, formatFcfa)).toBeNull();
  });
  it('lit un montant saisi avec espaces', () => {
    expect(parseAmount('25 000')).toBe(25000);
    expect(parseAmount('25 000')).toBe(25000);
    expect(parseAmount('12,5')).toBeNaN();
    expect(parseAmount('')).toBeNaN();
  });
});

describe('périodes et libellés', () => {
  it('formate les dates locales', () => {
    expect(isoDate(new Date(2026, 10, 7))).toBe('2026-11-07');
    expect(yearToDate(new Date(2026, 10, 7))).toEqual({ from: '2026-01-01', to: '2026-11-07' });
    expect(monthToDate(new Date(2026, 10, 7))).toEqual({ from: '2026-11-01', to: '2026-11-07' });
  });
  it('valide la période du rapport', () => {
    expect(periodError('2026-01-01', '2026-12-31')).toBeNull();
    expect(periodError('2026-05-01', '2026-01-01')).toMatch(/précéder/);
    expect(periodError('2020-01-01', '2026-01-01')).toMatch(/60 mois/);
    expect(periodError('', '2026-01-01')).toMatch(/deux dates/);
  });
  it('libelle les mois', () => {
    expect(monthLabel('2026-03')).toBe('mars 2026');
    expect(monthShort('2026-02')).toBe('févr. 26');
    expect(monthShort('2026-05')).toBe('mai 26');
  });
  it('abrège les montants des axes', () => {
    expect(compactFcfa(1_250_000)).toBe('1,25 M');
    expect(compactFcfa(45_000)).toBe('45 k');
    expect(compactFcfa(800)).toBe('800');
  });
  it('calcule une part en pourcentage', () => {
    expect(sharePercent(25, 100)).toBe(25);
    expect(sharePercent(5, 0)).toBe(0);
  });
});
