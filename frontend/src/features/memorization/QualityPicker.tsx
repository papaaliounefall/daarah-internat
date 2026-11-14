import React from 'react';
import type { QualityLevel } from '../../types/memorization';

interface Props {
  levels: QualityLevel[];
  value: string;
  onChange: (code: string) => void;
  error?: string;
  label?: string;
}

/** Choix de la qualité en un tap : boutons larges, niveaux issus de la configuration de l'établissement. */
export const QualityPicker: React.FC<Props> = ({ levels, value, onChange, error, label = 'Qualité' }) => (
  <fieldset>
    <legend className="mb-1 text-sm font-medium text-ink">{label}<span className="text-danger" aria-hidden> *</span></legend>
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {levels.map(l => {
        const on = l.code === value;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(l.code)}
            className={`min-h-11 rounded-md border px-3 py-2 text-sm font-medium ${
              on ? 'border-brand-800 bg-brand-800 text-white' : 'border-line bg-white text-ink hover:bg-brand-50'
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
    {levels.length === 0 && <p className="text-sm text-slate-500">Aucun niveau de qualité n'est configuré. Le directeur peut les définir dans les paramètres.</p>}
    {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
  </fieldset>
);
