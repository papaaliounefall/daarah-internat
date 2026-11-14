import React from 'react';
import { TextAreaField } from '../../../../components/ui';
import { LIMITS, type SiteErrors, type SiteForm } from '../siteContentUtils';
import { EditableList } from './EditableList';

export interface SectionProps {
  form: SiteForm;
  errors: SiteErrors;
  set: <K extends keyof SiteForm>(key: K, value: SiteForm[K]) => void;
}

const titled = { title: '', text: '' };
const TITLE_TEXT = [
  { key: 'title', label: 'Intitulé', max: LIMITS.itemTitle },
  { key: 'text', label: 'Description', max: LIMITS.itemText, multiline: true },
] as const;

export const EMPTY_SECTION_HINT = 'Une section laissée vide n\'est pas affichée sur le site.';

/** Enseignements dispensés. */
export const TeachingsSection: React.FC<SectionProps> = ({ form, errors, set }) => (
  <section className="panel space-y-4 p-5">
    <h2 className="text-base font-semibold">Enseignements</h2>
    <EditableList
      legend="Enseignements dispensés"
      hint={EMPTY_SECTION_HINT}
      noun="un enseignement"
      itemLabel="Enseignement"
      items={form.teachings}
      max={LIMITS.teachings}
      empty={titled}
      error={errors.teachings}
      fields={[TITLE_TEXT[0], TITLE_TEXT[1]]}
      onChange={v => set('teachings', v)}
    />
  </section>
);

/** Vie à l'internat : texte d'introduction et services. */
export const BoardingSection: React.FC<SectionProps> = ({ form, errors, set }) => (
  <section className="panel space-y-4 p-5">
    <h2 className="text-base font-semibold">Vie à l'internat</h2>
    <p role="note" className="rounded-md border border-gold-500 bg-gold-100 px-3 py-2 text-sm text-gold-700">
      Ne présentez que les services réellement disponibles.
    </p>
    <TextAreaField
      label="Texte d'introduction"
      rows={4}
      maxLength={LIMITS.boardingIntro}
      value={form.boardingIntro}
      onChange={e => set('boardingIntro', e.target.value)}
      hint={EMPTY_SECTION_HINT}
    />
    <EditableList
      legend="Services et conditions de vie"
      noun="un élément"
      itemLabel="Élément de l'internat"
      items={form.boarding}
      max={LIMITS.boarding}
      empty={titled}
      error={errors.boarding}
      fields={[TITLE_TEXT[0], TITLE_TEXT[1]]}
      onChange={v => set('boarding', v)}
    />
  </section>
);

/** Approche pédagogique : étapes ordonnées. */
export const ApproachSection: React.FC<SectionProps> = ({ form, errors, set }) => (
  <section className="panel space-y-4 p-5">
    <h2 className="text-base font-semibold">Approche pédagogique</h2>
    <EditableList
      legend="Étapes du parcours"
      hint="L'ordre ci-dessous est celui de l'affichage sur le site. Utilisez les flèches pour réordonner."
      emptyHint={`Aucune étape. ${EMPTY_SECTION_HINT}`}
      noun="une étape"
      itemLabel="Étape"
      numbered
      items={form.approach}
      max={LIMITS.approach}
      empty={titled}
      error={errors.approach}
      fields={[TITLE_TEXT[0], TITLE_TEXT[1]]}
      onChange={v => set('approach', v)}
    />
  </section>
);

/** Réseaux sociaux : libellé et adresse http(s). */
export const SocialSection: React.FC<SectionProps> = ({ form, errors, set }) => (
  <section className="panel space-y-4 p-5">
    <h2 className="text-base font-semibold">Réseaux sociaux</h2>
    <EditableList
      legend="Liens"
      hint="Chaque adresse doit commencer par http:// ou https://."
      noun="un lien"
      itemLabel="Lien"
      items={form.socialLinks}
      max={LIMITS.socialLinks}
      empty={{ label: '', url: '' }}
      error={errors.socialLinks}
      fields={[
        { key: 'label', label: 'Libellé', max: LIMITS.itemTitle, hint: 'Ex. Facebook' },
        { key: 'url', label: 'Adresse', max: LIMITS.linkUrl, inputType: 'url', hint: 'Ex. https://www.facebook.com/...' },
      ]}
      onChange={v => set('socialLinks', v)}
    />
  </section>
);

/** Mentions légales et politique de confidentialité. */
export const LegalSection: React.FC<SectionProps> = ({ form, set }) => (
  <section className="panel space-y-4 p-5">
    <h2 className="text-base font-semibold">Mentions légales et confidentialité</h2>
    <p className="text-sm text-slate-500">Textes affichés en bas du site. {EMPTY_SECTION_HINT}</p>
    <TextAreaField label="Mentions légales" rows={6} maxLength={LIMITS.legalText} value={form.legalNotice} onChange={e => set('legalNotice', e.target.value)} />
    <TextAreaField label="Politique de confidentialité" rows={6} maxLength={LIMITS.legalText} value={form.privacyPolicy} onChange={e => set('privacyPolicy', e.target.value)} />
  </section>
);
