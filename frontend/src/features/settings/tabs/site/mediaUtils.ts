export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Contrôle côté client d'une image à téléverser (le serveur revalide) : type image et taille ≤ 5 Mo. */
export function validateImageFile(file: { name: string; type: string; size: number }): string | null {
  if (!file.type.startsWith('image/')) return `« ${file.name} » n'est pas une image.`;
  if (file.size === 0) return `« ${file.name} » est vide.`;
  if (file.size > MAX_IMAGE_BYTES) return `« ${file.name} » dépasse 5 Mo.`;
  return null;
}

export interface Ordered { id: string; order: number }

/** Tri stable par rang croissant (égalité : ordre d'origine conservé). */
export const sortByOrder = <T extends Ordered>(items: T[]): T[] =>
  items.map((it, i) => ({ it, i })).sort((a, b) => a.it.order - b.it.order || a.i - b.i).map(x => x.it);

/**
 * Déplace l'élément `index` (liste triée) d'un cran et renvoie les seuls changements de rang à enregistrer.
 * Les rangs sont renumérotés 0, 1, 2… pour lever les égalités.
 */
export function reorderUpdates(sorted: Ordered[], index: number, delta: -1 | 1): { id: string; order: number }[] {
  const to = index + delta;
  if (index < 0 || index >= sorted.length || to < 0 || to >= sorted.length) return [];
  const next = [...sorted];
  [next[index], next[to]] = [next[to], next[index]];
  return next.flatMap((it, i) => (it.order === i ? [] : [{ id: it.id, order: i }]));
}
