import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, reorderUpdates, sortByOrder, validateImageFile } from './mediaUtils';

describe('validateImageFile', () => {
  it('accepte une image de taille raisonnable', () => {
    expect(validateImageFile({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateImageFile({ name: 'a.png', type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
  });
  it('refuse un fichier trop lourd, vide ou qui n\'est pas une image', () => {
    expect(validateImageFile({ name: 'a.jpg', type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 })).toMatch(/5 Mo/);
    expect(validateImageFile({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toMatch(/pas une image/);
    expect(validateImageFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 })).toMatch(/vide/);
  });
});

describe('sortByOrder', () => {
  it('trie par rang et conserve l\'ordre d\'origine en cas d\'égalité', () => {
    const items = [{ id: 'c', order: 2 }, { id: 'a', order: 0 }, { id: 'b', order: 0 }];
    expect(sortByOrder(items).map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('reorderUpdates', () => {
  const items = [{ id: 'a', order: 0 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }];
  it('n\'écrit que les deux rangs échangés', () => {
    expect(reorderUpdates(items, 1, -1)).toEqual([{ id: 'b', order: 0 }, { id: 'a', order: 1 }]);
    expect(reorderUpdates(items, 1, 1)).toEqual([{ id: 'c', order: 1 }, { id: 'b', order: 2 }]);
  });
  it('renumérote quand les rangs sont égaux', () => {
    const same = [{ id: 'a', order: 0 }, { id: 'b', order: 0 }, { id: 'c', order: 0 }];
    expect(reorderUpdates(same, 2, -1)).toEqual([{ id: 'c', order: 1 }, { id: 'b', order: 2 }]);
  });
  it('ne fait rien aux bornes', () => {
    expect(reorderUpdates(items, 0, -1)).toEqual([]);
    expect(reorderUpdates(items, 2, 1)).toEqual([]);
  });
});
