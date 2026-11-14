import { http } from '../lib/api';
import { getAll, getPage } from './params';
import type {
  AlertsResponse, InventoryCategory, InventoryItem, InventorySummary, MovementKind, StockMovement, Supplier,
} from '../types/inventory';

export const getInventorySummary = () => http.get<InventorySummary>('/inventory/summary/').then(r => r.data);
export const getAlerts = () => http.get<AlertsResponse>('/inventory/alerts/').then(r => r.data);

/* --- Catégories et fournisseurs --- */
export const listCategories = () => getAll<InventoryCategory>('/inventory/categories/', { ordering: 'name' });
export const saveCategory = (id: string | null, name: string) =>
  (id ? http.patch<InventoryCategory>(`/inventory/categories/${id}/`, { name }) : http.post<InventoryCategory>('/inventory/categories/', { name })).then(r => r.data);

export const listSuppliers = () => getAll<Supplier>('/inventory/suppliers/', { ordering: 'name' });
export interface SupplierInput { name: string; phone: string; address: string }
export const saveSupplier = (id: string | null, input: SupplierInput) =>
  (id ? http.patch<Supplier>(`/inventory/suppliers/${id}/`, input) : http.post<Supplier>('/inventory/suppliers/', input)).then(r => r.data);

/* --- Articles --- */
export interface ItemQuery { page?: number; pageSize?: number; search?: string; category?: string; low?: string; isActive?: string }
export const listItems = (q: ItemQuery) => getPage<InventoryItem>('/inventory/items/', { ordering: 'name', ...q });
export const listActiveItems = () => getAll<InventoryItem>('/inventory/items/', { isActive: 'true', ordering: 'name' });

export interface ItemInput {
  name: string; category: string | null; unit: string; minThreshold: number; defaultSupplier: string | null;
  isActive?: boolean; initialQuantity?: number;
}
export const saveItem = (id: string | null, input: ItemInput) =>
  (id ? http.patch<InventoryItem>(`/inventory/items/${id}/`, input) : http.post<InventoryItem>('/inventory/items/', input)).then(r => r.data);

/* --- Mouvements --- */
export interface MovementQuery { page?: number; pageSize?: number; item?: string; kind?: string; dateFrom?: string; dateTo?: string; search?: string }
export const listStockMovements = (q: MovementQuery) => getPage<StockMovement>('/inventory/movements/', { ordering: '-date,-created_at', ...q });

export interface MovementInput { item: string; kind: MovementKind; quantity: number; date: string; supplier: string | null; reason: string }
export const createStockMovement = (input: MovementInput) => http.post<StockMovement>('/inventory/movements/', input).then(r => r.data);
