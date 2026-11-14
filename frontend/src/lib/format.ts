/** Formats d'affichage français : dates jj/mm/aaaa, montants en FCFA, initiales. */

const nf = new Intl.NumberFormat('fr-FR');

/** « 2025-10-06 » ou ISO complet → « 06/10/2025 ». Vide si la valeur est absente ou invalide. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR');
}

/** Date et heure locales : « 06/10/2025 14:32 ». */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('fr-FR');
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export const formatNumber = (n: number | null | undefined) => nf.format(n ?? 0);

/** Montant entier en francs CFA : « 25 000 FCFA » (espaces insécables normalisés en espaces simples). */
export function formatFcfa(amount: number | null | undefined): string {
  return `${nf.format(Math.round(amount ?? 0)).replace(/[  ]/g, ' ')} FCFA`;
}

/** Initiales (deux lettres max) pour un avatar de repli. */
export function initials(firstName: string, lastName: string): string {
  const a = (firstName || '').trim().charAt(0);
  const b = (lastName || '').trim().charAt(0);
  return (a + b).toUpperCase() || '?';
}

/** Âge en années entières à une date donnée ; null si la naissance est inconnue. */
export function ageFrom(birthDate: string | null | undefined, today: Date = new Date()): number | null {
  const m = birthDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1;
  return age >= 0 ? age : null;
}

/** Déclenche le téléchargement d'un Blob déjà récupéré (avec jeton) par le navigateur. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
