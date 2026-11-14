import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { plainErrorMessage } from '../../../lib/apiErrors';
import { useFetch } from '../../../hooks/useFetch';
import { getSiteContent, saveSiteContent } from '../../../services/site';
import { Button, ErrorState, Spinner, TextAreaField, TextField, useToast } from '../../../components/ui';
import {
  LIMITS, buildSitePatch, toSiteForm, validateSite, type SiteErrors, type SiteForm,
} from './siteContentUtils';
import { EditableList } from './site/EditableList';
import { HeroImageSection } from './site/HeroImageSection';
import {
  ApproachSection, BoardingSection, EMPTY_SECTION_HINT, LegalSection, SocialSection, TeachingsSection,
} from './site/HomeSections';

/** Portail public : rédaction du contenu de la page d'accueil et des pages institutionnelles (directeur). */
export const PublicSiteTab: React.FC = () => {
  const toast = useToast();
  const content = useFetch(getSiteContent, []);
  const [form, setForm] = useState<SiteForm | null>(null);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<SiteErrors>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (content.data) {
      setForm(toSiteForm(content.data));
      setHeroUrl(content.data.heroImageUrl ?? null);
    }
  }, [content.data]);

  if (content.error && !content.data) return <ErrorState message={content.error} onRetry={content.reload} />;
  if (!content.data || !form) return <Spinner />;

  const initial = toSiteForm(content.data);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = <K extends keyof SiteForm>(k: K, v: SiteForm[K]) => setForm(f => (f ? { ...f, [k]: v } : f));
  const text = (k: keyof SiteForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value as never);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateSite(form);
    setErrors(found);
    if (Object.keys(found).length > 0) { setServerError('Corrigez les champs signalés avant d\'enregistrer.'); return; }
    setBusy(true);
    setServerError(null);
    try {
      const saved = await saveSiteContent(buildSitePatch(form));
      content.setData(saved);
      toast.success('Contenu du site enregistré.');
    } catch (err) {
      setServerError(plainErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const section = { form, errors, set };

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-xl text-sm text-slate-600">
          {EMPTY_SECTION_HINT} Ne saisissez jamais de données sur les talibés ou leurs familles.
        </p>
        <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
          Voir le site <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>
      {serverError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</p>}

      <section className="panel space-y-4 p-5">
        <h2 className="text-base font-semibold">Page d'accueil</h2>
        <HeroImageSection url={heroUrl} onChange={setHeroUrl} />
        <TextField label="Phrase d'accroche" maxLength={LIMITS.tagline} value={form.tagline} onChange={text('tagline')} />
        <TextAreaField
          label="Description d'accueil"
          rows={3}
          maxLength={LIMITS.heroText}
          value={form.heroText}
          onChange={text('heroText')}
          hint={`Quelques lignes sous la phrase d'accroche (${form.heroText.length}/${LIMITS.heroText} caractères).`}
        />
      </section>

      <section className="panel space-y-4 p-5">
        <h2 className="text-base font-semibold">Présentation</h2>
        <TextAreaField label="Histoire" rows={5} maxLength={LIMITS.longText} value={form.history} onChange={text('history')} />
        <TextAreaField label="Mission" rows={4} maxLength={LIMITS.longText} value={form.mission} onChange={text('mission')} />
        <TextAreaField label="Vision" rows={4} maxLength={LIMITS.longText} value={form.vision} onChange={text('vision')} />
        <TextAreaField label="Conditions et procédure d'admission" rows={5} maxLength={LIMITS.longText} value={form.admissionInfo} onChange={text('admissionInfo')} />
      </section>

      <TeachingsSection {...section} />
      <BoardingSection {...section} />
      <ApproachSection {...section} />

      <section className="panel space-y-6 p-5">
        <h2 className="text-base font-semibold">Valeurs, activités et équipe</h2>
        <EditableList
          legend="Valeurs"
          noun="une valeur"
          itemLabel="Valeur"
          items={form.values}
          max={LIMITS.values}
          empty={{ title: '', text: '' }}
          error={errors.values}
          fields={[
            { key: 'title', label: 'Intitulé', max: LIMITS.itemTitle },
            { key: 'text', label: 'Description', max: LIMITS.itemText, multiline: true },
          ]}
          onChange={v => set('values', v)}
        />
        <EditableList
          legend="Activités"
          noun="une activité"
          itemLabel="Activité"
          items={form.activities}
          max={LIMITS.activities}
          empty={{ title: '', text: '' }}
          error={errors.activities}
          fields={[
            { key: 'title', label: 'Intitulé', max: LIMITS.itemTitle },
            { key: 'text', label: 'Description', max: LIMITS.itemText, multiline: true },
          ]}
          onChange={v => set('activities', v)}
        />
        <EditableList
          legend="Équipe"
          hint="Publiez uniquement les noms et fonctions que les personnes concernées ont acceptés de rendre publics."
          noun="un membre"
          itemLabel="Membre"
          items={form.team}
          max={LIMITS.team}
          empty={{ name: '', role: '' }}
          error={errors.team}
          fields={[
            { key: 'name', label: 'Nom', max: LIMITS.itemTitle },
            { key: 'role', label: 'Fonction', max: LIMITS.itemText },
          ]}
          onChange={v => set('team', v)}
        />
      </section>

      <SocialSection {...section} />

      <section className="panel space-y-4 p-5">
        <h2 className="text-base font-semibold">Coordonnées et localisation</h2>
        <p className="text-sm text-slate-500">Les champs laissés vides reprennent les coordonnées de l'établissement (onglet « Établissement »).</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Téléphone public" type="tel" maxLength={80} value={form.contactPhone} onChange={text('contactPhone')} />
          <TextField label="E-mail public" type="email" value={form.contactEmail} onChange={text('contactEmail')} error={errors.contactEmail} />
        </div>
        <TextField label="Adresse" maxLength={LIMITS.address} value={form.address} onChange={text('address')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Latitude" inputMode="decimal" value={form.latitude} onChange={text('latitude')} error={errors.latitude} hint="Ex. 14.123456" />
          <TextField label="Longitude" inputMode="decimal" value={form.longitude} onChange={text('longitude')} error={errors.longitude} hint="Ex. -16.123456" />
        </div>
        <p className="text-xs text-slate-500">Si la latitude et la longitude sont vides, aucun lien de localisation n'est affiché.</p>
      </section>

      <LegalSection {...section} />

      <div className="sticky bottom-0 -mx-1 flex gap-2 border-t border-line bg-paper px-1 py-3">
        <Button type="submit" loading={busy} disabled={!dirty}>Enregistrer le contenu</Button>
        <Button variant="secondary" disabled={!dirty || busy} onClick={() => { setForm(initial); setErrors({}); setServerError(null); }}>
          Annuler les modifications
        </Button>
      </div>
    </form>
  );
};
