import type { InventoryItem, MovementKind } from '../../types/inventory';

export type StockLevel = 'out' | 'low' | 'ok';

/** Rupture (0), stock bas (au seuil ou en dessous) ou normal. */
export function stockLevel(item: Pick<InventoryItem, 'quantity' | 'minThreshold'>): StockLevel {
  if (item.quantity <= 0) return 'out';
  return item.quantity <= item.minThreshold ? 'low' : 'ok';
}

export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = { out: 'Rupture', low: 'Stock bas', ok: 'Normal' };

const qf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** « 12,5 kg » (espaces insécables remplacés par des espaces simples). */
export function formatQuantity(n: number | null | undefined, unit = ''): string {
  const s = qf.format(n ?? 0).replace(/[  ]/g, ' ');
  return unit ? `${s} ${unit}` : s;
}

/** Quantité saisie (virgule ou point) → nombre à 2 décimales max ; NaN si invalide. */
export function parseQuantity(raw: string): number {
  const s = raw.trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return Number.NaN;
  return Number(s);
}

/** Stock après mouvement : une entrée ajoute, une sortie retire, un ajustement fixe la quantité comptée. */
export function quantityAfter(kind: MovementKind, current: number, quantity: number): number {
  if (kind === 'ENTREE') return Math.round((current + quantity) * 100) / 100;
  if (kind === 'SORTIE') return Math.round((current - quantity) * 100) / 100;
  return quantity;
}

/** Contrôle d'un mouvement avant envoi (le serveur refait les mêmes vérifications). */
export function movementError(kind: MovementKind, quantity: number, current: number, reason: string, unit: string): string | null {
  if (Number.isNaN(quantity)) return 'Saisissez une quantité valide (deux décimales au plus).';
  if (kind !== 'AJUSTEMENT' && quantity <= 0) return 'La quantité doit être supérieure à 0.';
  if (kind === 'SORTIE' && quantity > current) return `Stock insuffisant : ${formatQuantity(current, unit)} disponible.`;
  if (kind === 'AJUSTEMENT' && reason.trim().length < 3) return "Le motif de l'ajustement est obligatoire.";
  return null;
}
