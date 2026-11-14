import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, TextAreaField, TextField } from '../../../../components/ui';
import { moveItem } from '../siteContentUtils';

export interface FieldSpec<T> {
  key: keyof T & string;
  label: string;
  max: number;
  multiline?: boolean;
  hint?: string;
  inputType?: string;
}

interface Props<T extends Record<string, string>> {
  legend: string;
  hint?: string;
  /** Texte affiché quand la liste est vide. */
  emptyHint?: string;
  /** Nom singulier avec article : « un enseignement ». */
  noun: string;
  /** Libellé d'un élément pour les lecteurs d'écran : « Enseignement ». */
  itemLabel: string;
  items: T[];
  fields: [FieldSpec<T>, FieldSpec<T>];
  max: number;
  empty: T;
  error?: string;
  /** Affiche un numéro d'ordre (étapes d'un parcours). */
  numbered?: boolean;
  onChange: (items: T[]) => void;
}

/** Liste éditable d'éléments à deux champs : ajouter, modifier, réordonner, retirer. */
export function EditableList<T extends Record<string, string>>({
  legend, hint, emptyHint, noun, itemLabel, items, fields, max, empty, error, numbered, onChange,
}: Props<T>) {
  const update = (i: number, key: string, value: string) =>
    onChange(items.map((it, n) => (n === i ? { ...it, [key]: value } : it)));
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {items.length === 0 && (
        <p className="text-sm text-slate-500">{emptyHint ?? 'Aucun élément : cette section ne sera pas affichée sur le site.'}</p>
      )}
      {items.map((it, i) => (
        <div key={i} className="rounded-md border border-line p-3">
          {numbered && <p className="mb-2 text-xs font-medium text-slate-500">Étape {i + 1}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map(f => (
              f.multiline ? (
                <TextAreaField key={f.key} label={f.label} rows={2} maxLength={f.max} hint={f.hint} value={it[f.key]} onChange={e => update(i, f.key, e.target.value)} />
              ) : (
                <TextField key={f.key} label={f.label} maxLength={f.max} hint={f.hint} type={f.inputType} value={it[f.key]} onChange={e => update(i, f.key, e.target.value)} />
              )
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => onChange(moveItem(items, i, -1))} aria-label={`Monter : ${itemLabel} ${i + 1}`}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
            <Button variant="ghost" size="sm" disabled={i === items.length - 1} onClick={() => onChange(moveItem(items, i, 1))} aria-label={`Descendre : ${itemLabel} ${i + 1}`}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(items.filter((_, n) => n !== i))} aria-label={`Retirer : ${itemLabel} ${i + 1}`}><Trash2 className="h-4 w-4" aria-hidden /> Retirer</Button>
          </div>
        </div>
      ))}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <Button variant="secondary" size="sm" disabled={items.length >= max} onClick={() => onChange([...items, { ...empty }])}>
        <Plus className="h-4 w-4" aria-hidden /> Ajouter {noun}
      </Button>
      {items.length >= max && <p className="text-xs text-slate-500">Maximum atteint ({max}).</p>}
    </fieldset>
  );
}
