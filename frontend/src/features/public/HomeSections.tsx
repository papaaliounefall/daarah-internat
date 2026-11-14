import React, { useState } from 'react';
import { BookOpenCheck, ClipboardCheck, GraduationCap, HeartHandshake, Newspaper, ScrollText } from 'lucide-react';
import { Button } from '../../components/ui';
import type { GalleryItem, HomeContent, NewsItem, TextItem } from './publicApi';
import { DEFAULTS, approachOf, boardingOf, longDate, teachingsOf } from './homeModel';
import { hasText, textProps } from './portalUtils';

const Prose: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <p {...textProps(text, `whitespace-pre-line text-slate-700 ${className}`)}>{text}</p>
);

export const SectionTitle: React.FC<{ kicker?: string; title: string; id?: string; light?: boolean }> = ({ kicker, title, id, light }) => (
  <div className="mb-8 max-w-2xl">
    {kicker && <p className={`text-xs font-semibold uppercase tracking-widest ${light ? 'text-gold-100' : 'text-gold-700'}`}>{kicker}</p>}
    <h2 id={id} className={`mt-1 text-2xl font-semibold sm:text-3xl ${light ? 'text-white' : 'text-brand-800'}`}>{title}</h2>
    <span className="mt-3 block h-0.5 w-12 bg-gold-500" aria-hidden />
  </div>
);

const Band: React.FC<{ id: string; tone?: 'paper' | 'white'; children: React.ReactNode }> = ({ id, tone = 'paper', children }) => (
  <section id={id} aria-labelledby={`${id}-t`} className={`scroll-mt-16 py-14 sm:py-16 ${tone === 'white' ? 'bg-white' : ''}`}>
    <div className="mx-auto max-w-6xl px-4">{children}</div>
  </section>
);

const ICONS = [BookOpenCheck, ScrollText, ClipboardCheck, GraduationCap];

/** Section 3 — Présentation. Texte par défaut de la direction, enrichi par l'histoire, la vision et les valeurs saisies. */
export const Presentation: React.FC<{ c: HomeContent }> = ({ c }) => {
  const blocks = [
    { label: 'Notre histoire', text: c.history },
    { label: 'Notre mission', text: c.mission },
    { label: 'Notre vision', text: c.vision },
  ].filter(b => hasText(b.text));
  const values = c.values.filter(v => hasText(v.title));
  return (
    <Band id="daara" tone="white">
      <SectionTitle kicker="Notre Daara" title={DEFAULTS.presentationTitle} id="daara-t" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Prose text={DEFAULTS.presentation} className="text-lg leading-relaxed" />
        {blocks.length > 0 && (
          <div className="space-y-5">
            {blocks.map(b => (
              <div key={b.label} className="border-l-2 border-gold-500 pl-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-800">{b.label}</h3>
                <Prose text={b.text} className="mt-1" />
              </div>
            ))}
          </div>
        )}
      </div>
      {values.length > 0 && (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((v, i) => (
            <li key={i} className="rounded-md border border-line bg-paper p-5">
              <HeartHandshake className="h-5 w-5 text-gold-700" aria-hidden />
              <p {...textProps(v.title, 'mt-2 font-semibold text-ink')}>{v.title}</p>
              {hasText(v.text) && <p {...textProps(v.text, 'mt-1 text-sm text-slate-600')}>{v.text}</p>}
            </li>
          ))}
        </ul>
      )}
    </Band>
  );
};

/** Section 4 — Nos enseignements. */
export const Teachings: React.FC<{ c: HomeContent }> = ({ c }) => (
  <Band id="enseignement">
    <SectionTitle kicker="Nos enseignements" title="Ce que les apprenants reçoivent au Daara" id="enseignement-t" />
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {teachingsOf(c).map((t, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
          <li key={i} className="flex flex-col rounded-md border border-line bg-white p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-50 text-brand-800"><Icon className="h-5 w-5" aria-hidden /></span>
            <h3 {...textProps(t.title, 'mt-4 font-semibold text-ink')}>{t.title}</h3>
            {hasText(t.text) && <p {...textProps(t.text, 'mt-1 text-sm leading-relaxed text-slate-600')}>{t.text}</p>}
          </li>
        );
      })}
    </ul>
  </Band>
);

/** Section 5 — Vie à l'internat : affichée seulement si le Daara a renseigné ses services réels. */
export const Boarding: React.FC<{ c: HomeContent }> = ({ c }) => (
  <Band id="internat" tone="white">
    <SectionTitle kicker="La vie à l'internat" title="Un environnement de vie adapté aux apprenants" id="internat-t" />
    {hasText(c.boardingIntro) && <Prose text={c.boardingIntro} className="mb-8 max-w-3xl text-lg leading-relaxed" />}
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {boardingOf(c).map((b: TextItem, i) => (
        <li key={i} className="rounded-md border border-line bg-paper p-5">
          <h3 {...textProps(b.title, 'font-semibold text-ink')}>{b.title}</h3>
          {hasText(b.text) && <p {...textProps(b.text, 'mt-1 text-sm leading-relaxed text-slate-600')}>{b.text}</p>}
        </li>
      ))}
    </ul>
  </Band>
);

/** Section 6 — Approche pédagogique : parcours en étapes numérotées. */
export const Approach: React.FC<{ c: HomeContent }> = ({ c }) => (
  <Band id="approche">
    <SectionTitle kicker="Notre approche pédagogique" title="Le parcours d'un apprenant" id="approche-t" />
    <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {approachOf(c).map((s, i) => (
        <li key={i} className="relative border-t-2 border-gold-500 pt-4">
          <span className="text-3xl font-semibold text-brand-200" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
          <h3 {...textProps(s.title, 'mt-1 font-semibold text-ink')}><span className="sr-only">Étape {i + 1} : </span>{s.title}</h3>
          {hasText(s.text) && <p {...textProps(s.text, 'mt-1 text-sm leading-relaxed text-slate-600')}>{s.text}</p>}
        </li>
      ))}
    </ol>
  </Band>
);

/** Section 7 — Actualités. « Voir toutes les actualités » déplie la liste sur place (pas de page séparée). */
export const News: React.FC<{ news: NewsItem[] }> = ({ news }) => {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const shown = all ? news : news.slice(0, 3);
  return (
    <Band id="actualites" tone="white">
      <SectionTitle kicker="Actualités et événements" title="La vie du Daara" id="actualites-t" />
      <ul className="grid gap-6 md:grid-cols-3">
        {shown.map(n => {
          const expanded = open === n.id;
          return (
            <li key={n.id} className="flex flex-col overflow-hidden rounded-md border border-line bg-white">
              {n.imageUrl ? (
                <img src={n.imageUrl} alt="" loading="lazy" className="h-44 w-full object-cover" />
              ) : (
                <div className="flex h-24 items-center justify-center bg-brand-50 text-brand-200"><Newspaper className="h-8 w-8" aria-hidden /></div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <time dateTime={n.publishedOn} className="text-xs font-medium uppercase tracking-wide text-gold-700">{longDate(n.publishedOn)}</time>
                <h3 {...textProps(n.title, 'mt-1 text-lg font-semibold text-ink')}>{n.title}</h3>
                {hasText(n.summary) && <p {...textProps(n.summary, 'mt-1 text-sm text-slate-600')}>{n.summary}</p>}
                {expanded && hasText(n.body) && <Prose text={n.body} className="mt-3 text-sm" />}
                {hasText(n.body) && (
                  <button onClick={() => setOpen(expanded ? null : n.id)} aria-expanded={expanded}
                    className="mt-auto pt-3 text-left text-sm font-medium text-brand-700 hover:underline">
                    {expanded ? 'Réduire' : 'Lire la suite'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {news.length > 3 && (
        <div className="mt-8 text-center">
          <Button variant="secondary" onClick={() => { setAll(a => !a); setOpen(null); }}>{all ? 'Voir moins' : 'Voir toutes les actualités'}</Button>
        </div>
      )}
    </Band>
  );
};

/** Galerie : photos gérées depuis l'administration. */
export const Gallery: React.FC<{ items: GalleryItem[] }> = ({ items }) => (
  <Band id="galerie">
    <SectionTitle kicker="Galerie" title="Le Daara en images" id="galerie-t" />
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {items.filter(i => i.imageUrl).map(i => (
        <li key={i.id} className="overflow-hidden rounded-md border border-line bg-white">
          <img src={i.imageUrl!} alt={i.caption || 'Photo du Daara'} loading="lazy" className="aspect-[4/3] w-full object-cover" />
          {hasText(i.caption) && <p className="px-3 py-2 text-xs text-slate-600">{i.caption}</p>}
        </li>
      ))}
    </ul>
  </Band>
);
