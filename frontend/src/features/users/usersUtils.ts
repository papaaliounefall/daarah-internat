import type { Role } from '../../types';

/** Rôles que l'acteur peut attribuer (le serveur l'impose aussi : l'assistant ne crée que des parents). */
export function creatableRoles(actor: Role): Role[] {
  if (actor === 'DIRECTEUR') return ['MAITRE', 'ASSISTANT', 'PARENT', 'DIRECTEUR'];
  if (actor === 'ASSISTANT') return ['PARENT'];
  return [];
}

/** L'assistant ne modifie que les comptes parents ; le directeur modifie tout. */
export function canEditUser(actor: Role, target: Role): boolean {
  return actor === 'DIRECTEUR' || (actor === 'ASSISTANT' && target === 'PARENT');
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const SPECIAL = '!?#%+=';

/** Mot de passe initial lisible (sans caractères ambigus 0/O, 1/l/I), 12 caractères dont au moins un chiffre et un spécial. */
export function generatePassword(length = 12, rand: (n: number) => number = secureRandomInt): string {
  const chars: string[] = [];
  for (let i = 0; i < length - 2; i++) chars.push(ALPHABET[rand(ALPHABET.length)]);
  chars.push('23456789'[rand(8)]);
  chars.push(SPECIAL[rand(SPECIAL.length)]);
  // mélange de Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function secureRandomInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max; // évite le biais du modulo
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

/** Identifiant proposé à partir du prénom et du nom : « Awa Diop » → « awa.diop ». */
export function suggestUsername(firstName: string, lastName: string): string {
  const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  return [clean(firstName), clean(lastName)].filter(Boolean).join('.');
}
