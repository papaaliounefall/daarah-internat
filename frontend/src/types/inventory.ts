/** Stocks : quantités décimales (2 décimales), identifiants UUID. */

export type MovementKind = 'ENTREE' | 'SORTIE' | 'AJUSTEMENT';

export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = {
  ENTREE: 'Entrée',
  SORTIE: 'Sortie',
  AJUSTEMENT: 'Ajustement (inventaire)',
};

export interface InventoryCategory { id: string; name: string; itemsCount: number }
export interface Supplier { id: string; name: string; phone: string; address: string }

export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  categoryName: string;
  unit: string;
  quantity: number;
  minThreshold: number;
  isLow: boolean;
  defaultSupplier: string | null;
  supplierName: string;
  lastRestocked: string | null;
  isActive: boolean;
}

export interface StockMovement {
  id: string;
  item: string;
  itemName: string;
  unit: string;
  kind: MovementKind;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  date: string;
  supplier: string | null;
  supplierName: string;
  reason: string;
  recordedByName: string;
  createdAt: string;
}

export interface InventorySummary {
  totalItems: number;
  activeItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  categories: { id: string; name: string; items: number; lowItems: number }[];
  last30Days: { since: string; entries: number; exits: number; adjustments: number; quantityIn: number; quantityOut: number };
  recentMovements: StockMovement[];
  generatedOn: string;
}

export interface AlertsResponse { count: number; results: InventoryItem[] }
