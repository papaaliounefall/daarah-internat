import type { Due, DueStatus, ExpenseStatus } from '../../types/finance';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Date locale au format AAAA-MM-JJ (valeur d'un champ `type="date"`). */
export function isoDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Période par défaut du rapport : du 1er janvier à aujourd'hui. */
export function yearToDate(today: Date = new Date()): { from: string; to: string } {
  return { from: `${today.getFullYear()}-01-01`, to: isoDate(today) };
}

/** Mois en cours : du 1er du mois à aujourd'hui. */
export function monthToDate(today: Date = new Date()): { from: string; to: string } {
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: isoDate(first), to: isoDate(today) };
}

/** Message d'erreur si la période est incohérente ou dépasse 60 mois (limite du rapport), sinon null. */
export function periodError(from: string, to: string): string | null {
  if (!from || !to) return 'Indiquez les deux dates de la période.';
  if (from > to) return 'La date de début doit précéder la date de fin.';
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if ((ty - fy) * 12 + (tm - fm) + 1 > 60) return 'La période ne peut pas dépasser 60 mois.';
  return null;
}

/** « 2026-03 » → « mars 2026 ». */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** « 2026-03 » → « mars 26 » (axe de graphique). */
export function monthShort(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const name = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${name.length > 4 ? `${name.slice(0, 4)}.` : name} ${m[1].slice(2)}`;
}

/** Montant compact pour un axe : 1 250 000 → « 1,25 M », 45 000 → « 45 k ». */
export function compactFcfa(n: number): string {
  const abs = Math.abs(n);
  const fmt = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
  if (abs >= 1_000_000) return `${fmt(n / 1_000_000)} M`;
  if (abs >= 1_000) return `${fmt(n / 1_000)} k`;
  return String(n);
}

/** Solde restant d'une échéance : jamais négatif, nul si elle est annulée. */
export function remainingBalance(due: Pick<Due, 'amount' | 'paidAmount' | 'isCancelled'>): number {
  if (due.isCancelled) return 0;
  return Math.max(0, due.amount - due.paidAmount);
}

/** Échéances encore encaissables (non annulées, solde > 0). */
export const payableDues = (dues: Due[]) => dues.filter(d => remainingBalance(d) > 0);

/**
 * Contrôle d'un montant de paiement avant envoi (le serveur refait la même vérification).
 * `balance` = solde restant de l'échéance choisie, null pour un paiement libre.
 */
export function paymentAmountError(amount: number, balance: number | null, format: (n: number) => string): string | null {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return 'Saisissez un montant entier supérieur à 0.';
  if (balance !== null && amount > balance) return `Le montant dépasse le solde restant de l'échéance (${format(balance)}).`;
  return null;
}

/** Montant saisi (« 25 000 », « 25000 ») → nombre ; NaN si invalide. */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[\s  ]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

export const dueStatusTone = (s: DueStatus): 'danger' | 'warning' | 'success' | 'neutral' =>
  s === 'IMPAYEE' ? 'danger' : s === 'PARTIELLE' ? 'warning' : s === 'PAYEE' ? 'success' : 'neutral';

export const expenseStatusTone = (s: ExpenseStatus): 'warning' | 'success' | 'danger' | 'neutral' =>
  s === 'EN_ATTENTE' ? 'warning' : s === 'VALIDEE' ? 'success' : s === 'REFUSEE' ? 'danger' : 'neutral';

/** Part d'une valeur dans un total, en pourcentage entier (0 si total nul). */
export const sharePercent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
