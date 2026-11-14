/** Conversion des clés snake_case (API Django) ↔ camelCase (React). */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;

const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (s: string) => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);

function convert(value: unknown, fn: (k: string) => string): unknown {
  if (Array.isArray(value)) return value.map(v => convert(v, fn));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[fn(k)] = convert(v, fn);
    return out;
  }
  return value; // FormData, File, Blob, Date, primitives : inchangés
}

export const camelize = <T = unknown>(v: unknown): T => convert(v, toCamel) as T;
export const snakeize = <T = unknown>(v: unknown): T => convert(v, toSnake) as T;

/** Construit un FormData (snake_case) à partir d'un objet ; ignore undefined/null. */
export function toFormData(obj: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    fd.append(toSnake(k), v instanceof Blob ? v : String(v));
  }
  return fd;
}
