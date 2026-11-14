import React from 'react';
import { Field } from '../../components/ui';
import type { RangeValues } from '../../types/memorization';
import type { Surah } from '../../types/quran';
import { validateRange } from './memorizationUtils';

interface Props {
  values: RangeValues;
  onChange: (patch: Partial<RangeValues>) => void;
  surahs: Surah[];
  /** Affiche les erreurs de validation (après une tentative d'envoi ou une saisie). */
  showErrors: boolean;
}

/** Sourate + verset de début + verset de fin, validés par le nombre de versets de la sourate (fourni par l'API). */
export const SurahRangeFields: React.FC<Props> = ({ values, onChange, surahs, showErrors }) => {
  const surah = surahs.find(s => String(s.number) === values.surah) ?? null;
  const errors = validateRange(values, surah?.versesCount ?? null);
  const e = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr]">
      <Field label="Sourate" required error={e('surah')} className="col-span-2 sm:col-span-1">
        {id => (
          <select
            id={id} aria-invalid={!!e('surah')} className="input" required
            value={values.surah} onChange={ev => onChange({ surah: ev.target.value })}
          >
            <option value="">Choisir une sourate</option>
            {surahs.map(s => <option key={s.number} value={s.number}>{s.number}. {s.nameSimple} ({s.versesCount} versets)</option>)}
          </select>
        )}
      </Field>
      <Field label="Du verset" required error={e('ayahStart')} hint={surah ? `1 à ${surah.versesCount}` : undefined}>
        {id => (
          <input
            id={id} type="number" inputMode="numeric" min={1} max={surah?.versesCount} className="input" required
            aria-invalid={!!e('ayahStart')} value={values.ayahStart}
            onChange={ev => onChange({ ayahStart: ev.target.value, ayahEnd: values.ayahEnd === '' || values.ayahEnd === values.ayahStart ? ev.target.value : values.ayahEnd })}
          />
        )}
      </Field>
      <Field label="Au verset" required error={e('ayahEnd')}>
        {id => (
          <input
            id={id} type="number" inputMode="numeric" min={1} max={surah?.versesCount} className="input" required
            aria-invalid={!!e('ayahEnd')} value={values.ayahEnd} onChange={ev => onChange({ ayahEnd: ev.target.value })}
          />
        )}
      </Field>
    </div>
  );
};
