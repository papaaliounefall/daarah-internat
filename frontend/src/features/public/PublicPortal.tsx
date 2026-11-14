import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck, LogIn, Mail, MapPin, Menu, Phone, ShieldCheck, X } from 'lucide-react';
import { useFetch } from '../../hooks/useFetch';
import { Button, ErrorState, Modal, Spinner } from '../../components/ui';
import { BrandPanel, Logo } from '../../components/ui/Brand';
import { Approach, Boarding, Gallery, News, Presentation, SectionTitle, Teachings } from './HomeSections';
import { ContactForm } from './ContactForm';
import { VisitForm } from './VisitForm';
import { getHome, type HomeContent, type HomeData } from './publicApi';
import { DEFAULTS, hasBoarding, navLinks, schoolJsonLd } from './homeModel';
import { hasText, osmUrl, telHref, textProps, toCoord } from './portalUtils';

/** Page d'accueil publique : une seule page, alimentée par l'API, sans aucune donnée de talibé. */
export const PublicPortal: React.FC = () => {
  const home = useFetch<HomeData>(getHome, []);
  const data = home.data;

  useEffect(() => {
    if (!data) return;
    const { establishment: est, content: c } = data;
    document.title = `${est.name} — ${est.city || 'Sénégal'}`;
    const desc = hasText(c.heroText) ? c.heroText : DEFAULTS.heroText;
    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', est.name);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', 'website');
    setMeta('property', 'og:locale', 'fr_FR');
    if (c.heroImageUrl) setMeta('property', 'og:image', c.heroImageUrl);
    // Données structurées « école » (référencement local) : uniquement des faits renseignés.
    let ld = document.getElementById('ld-school');
    if (!ld) { ld = document.createElement('script'); ld.id = 'ld-school'; (ld as HTMLScriptElement).type = 'application/ld+json'; document.head.appendChild(ld); }
    ld.textContent = JSON.stringify(schoolJsonLd(est.name, est.city, est.country, c));
  }, [data]);

  if (home.error && !data) {
    return <div className="mx-auto max-w-xl px-4 py-24"><ErrorState message={home.error} onRetry={home.reload} /></div>;
  }
  if (!data) return <Spinner label="Chargement…" />;
  return <Home data={data} />;
};

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', value);
}

// ---------------------------------------------------------------------------------------------------
const Home: React.FC<{ data: HomeData }> = ({ data }) => {
  const { establishment: est, content: c, news, gallery } = data;
  const [legal, setLegal] = useState<'legal' | 'privacy' | null>(null);
  const place = [est.city, est.country].filter(Boolean).join(', ');

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <Navbar name={est.name} c={c} hasNews={news.length > 0} />

      <main id="accueil">
        <Hero name={est.name} place={place} c={c} />
        <Facts c={c} place={place} />
        <Presentation c={c} />
        <Teachings c={c} />
        {hasBoarding(c) && <Boarding c={c} />}
        <Approach c={c} />
        {news.length > 0 && <News news={news} />}
        {gallery.some(g => g.imageUrl) && <Gallery items={gallery} />}
        <ParentSpace />
        <VisitSection c={c} />
        <ContactSection c={c} />
      </main>

      <Footer name={est.name} place={place} c={c} onLegal={setLegal} />

      {legal === 'legal' && <Modal title="Mentions légales" size="lg" onClose={() => setLegal(null)}><LegalText text={c.legalNotice} /></Modal>}
      {legal === 'privacy' && <Modal title="Politique de confidentialité" size="lg" onClose={() => setLegal(null)}><LegalText text={c.privacyPolicy} /></Modal>}
    </div>
  );
};

const LegalText: React.FC<{ text: string }> = ({ text }) => <p {...textProps(text, 'whitespace-pre-line text-sm leading-relaxed text-slate-700')}>{text}</p>;

// --- Section 1 : navigation ---------------------------------------------------------------------
const Navbar: React.FC<{ name: string; c: HomeContent; hasNews: boolean }> = ({ name, c, hasNews }) => {
  const [open, setOpen] = useState(false);
  const links = navLinks(c, hasNews);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <a href="#accueil" className="flex shrink-0 items-center gap-3" aria-label="Accueil">
          <Logo className="h-11 w-auto shrink-0" />
          <span className="hidden leading-tight sm:block">
            <span className="block whitespace-nowrap text-sm font-semibold text-brand-800 lg:text-base">
              <span className="2xl:hidden">Shaykh Aliou Fatima</span><span className="hidden 2xl:inline">{name}</span>
            </span>
            <span className="font-arabic hidden truncate text-sm text-gold-700 2xl:block" lang="ar" dir="rtl">مدرسة الشيخ علي فاطمة الداخلية</span>
          </span>
        </a>

        <nav aria-label="Navigation du site" className="hidden items-center gap-5 whitespace-nowrap text-sm lg:flex">
          {links.map(l => <a key={l.href} href={l.href} className="text-slate-600 hover:text-brand-800">{l.label}</a>)}
        </nav>

        <div className="flex items-center gap-2">
          <a href="#visite" className="hidden min-h-10 items-center gap-2 whitespace-nowrap rounded-md border border-brand-800 px-3.5 text-sm font-medium text-brand-800 hover:bg-brand-50 xl:inline-flex">
            <CalendarCheck className="h-4 w-4" aria-hidden /> Demander une visite
          </a>
          <Link to="/connexion" className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-brand-800 px-3.5 text-sm font-medium text-white hover:bg-brand-900">
            <LogIn className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Espace Parent</span><span className="sm:hidden">Connexion</span>
          </Link>
          <button onClick={() => setOpen(o => !o)} className="rounded-md p-2 text-slate-700 hover:bg-slate-100 lg:hidden" aria-expanded={open} aria-controls="menu-mobile" aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}>
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="menu-mobile" aria-label="Menu mobile" className="border-t border-line bg-white px-4 pb-4 lg:hidden">
          <ul className="divide-y divide-line">
            {links.map(l => (
              <li key={l.href}><a href={l.href} onClick={() => setOpen(false)} className="block py-3 text-base text-ink">{l.label}</a></li>
            ))}
          </ul>
          <a href="#visite" onClick={() => setOpen(false)} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-md border border-brand-800 text-sm font-medium text-brand-800">
            <CalendarCheck className="h-4 w-4" aria-hidden /> Demander une visite
          </a>
        </nav>
      )}
    </header>
  );
};

// --- Section 2 : hero ---------------------------------------------------------------------------
const Hero: React.FC<{ name: string; place: string; c: HomeContent }> = ({ name, place, c }) => {
  const image = c.heroImageUrl;
  const inner = (
    <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-gold-100 sm:text-sm">{DEFAULTS.kicker}</p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
          {hasText(c.tagline) ? c.tagline : DEFAULTS.tagline}
        </h1>
        <p className="font-arabic mt-3 text-2xl text-gold-100" lang="ar" dir="rtl" style={{ textAlign: 'left' }}>مدرسة الشيخ علي فاطمة الداخلية لتحفيظ القرآن</p>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-50 sm:text-lg">{hasText(c.heroText) ? c.heroText : DEFAULTS.heroText}</p>
        <p className="sr-only">{name}, {place}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#daara" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gold-500 px-5 py-2.5 text-sm font-semibold text-brand-900 hover:bg-gold-100 sm:w-auto">
            Découvrir le Daara <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
          <a href="#visite" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-white/50 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10 sm:w-auto">
            <CalendarCheck className="h-4 w-4" aria-hidden /> Demander une visite
          </a>
        </div>
      </div>
      {!image && <div className="hidden justify-center md:flex"><Logo className="h-56 w-auto lg:h-64" /></div>}
    </div>
  );

  if (image) {
    // Photo authentique + voile vert foncé uniforme pour garantir la lisibilité du texte.
    return (
      <section className="relative text-white" aria-label="Présentation">
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-brand-900/75" aria-hidden />
        <div className="relative pb-24 pt-14 sm:pt-20 md:pb-32">{inner}</div>
      </section>
    );
  }
  return <BrandPanel className="pb-24 pt-12 sm:pt-16 md:pb-32">{inner}</BrandPanel>;
};

// Coordonnées sous le hero
const Facts: React.FC<{ c: HomeContent; place: string }> = ({ c, place }) => {
  const lat = toCoord(c.latitude);
  const lng = toCoord(c.longitude);
  const items: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [];
  if (hasText(c.address) || place) {
    items.push({
      icon: <MapPin className="h-5 w-5" aria-hidden />, label: 'Adresse',
      value: (<>
        <span className="whitespace-pre-line">{hasText(c.address) ? c.address : place}</span>
        {lat !== null && lng !== null && <a href={osmUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className="mt-1 block text-brand-700 hover:underline">Voir sur la carte</a>}
      </>),
    });
  }
  if (hasText(c.contactPhone)) items.push({ icon: <Phone className="h-5 w-5" aria-hidden />, label: 'Téléphone', value: <a href={telHref(c.contactPhone)} className="hover:underline">{c.contactPhone}</a> });
  if (hasText(c.contactEmail)) items.push({ icon: <Mail className="h-5 w-5" aria-hidden />, label: 'E-mail', value: <a href={`mailto:${c.contactEmail}`} className="break-all hover:underline">{c.contactEmail}</a> });
  if (!items.length) return null;
  const cols = ({ 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' } as Record<number, string>)[Math.min(items.length, 3)];
  return (
    <div className="relative z-10 mx-auto -mt-14 max-w-6xl px-4 md:-mt-16">
      <ul className={`grid gap-px overflow-hidden rounded-md border border-line bg-line ${cols}`}>
        {items.map((f, i) => (
          <li key={i} className="flex items-start gap-3 bg-white p-4">
            <span className="mt-0.5 text-gold-700">{f.icon}</span>
            <div className="min-w-0 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{f.label}</p>
              <div className="mt-0.5 font-medium text-ink">{f.value}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

// --- Section 8 : espace parents -----------------------------------------------------------------
const ParentSpace: React.FC = () => (
  <BrandPanel className="py-14 sm:py-16">
    <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gold-100">Espace parents</p>
        <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">Restez informé du parcours de votre enfant.</h2>
        <p className="mt-3 max-w-xl leading-relaxed text-brand-50">
          Suivez les progrès de votre enfant, consultez ses évaluations, ses présences et les informations importantes communiquées par le Daara.
        </p>
      </div>
      <div className="md:text-right">
        <Link to="/connexion" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-gold-500 px-5 py-2.5 text-sm font-semibold text-brand-900 hover:bg-gold-100 sm:w-auto">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Accéder à l'espace parent
        </Link>
      </div>
    </div>
  </BrandPanel>
);

// --- Section 9 : visite et inscription ----------------------------------------------------------
const VisitSection: React.FC<{ c: HomeContent }> = ({ c }) => {
  const [info, setInfo] = useState(false);
  return (
    <section id="visite" aria-labelledby="visite-t" className="scroll-mt-16 bg-white py-14 sm:py-16">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle kicker="Visite et inscription" title="Vous souhaitez découvrir notre Daara ?" id="visite-t" />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-5">
            <p className="text-lg leading-relaxed text-slate-700">
              Nous vous invitons à venir découvrir notre établissement, rencontrer notre équipe et échanger avec notre administration.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#visite-form" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-800 px-4 text-sm font-medium text-white hover:bg-brand-900">
                <CalendarCheck className="h-4 w-4" aria-hidden /> Demander une visite
              </a>
              <Button variant="secondary" className="min-h-11" onClick={() => setInfo(v => !v)} aria-expanded={info}>Se renseigner sur les inscriptions</Button>
            </div>
            {info && (
              <div className="rounded-md border border-line bg-paper p-4 text-sm leading-relaxed text-slate-700">
                {hasText(c.admissionInfo)
                  ? <p {...textProps(c.admissionInfo, 'whitespace-pre-line')}>{c.admissionInfo}</p>
                  : <p>Pour connaître les conditions d'inscription, contactez l'administration par téléphone ou avec le formulaire de contact ci-dessous.</p>}
                <a href="#contact" onClick={() => setInfo(false)} className="mt-2 inline-block font-medium text-brand-700 hover:underline">Nous écrire</a>
              </div>
            )}
          </div>
          <div id="visite-form" className="scroll-mt-20 rounded-md border border-line bg-paper p-5"><VisitForm /></div>
        </div>
      </div>
    </section>
  );
};

const ContactSection: React.FC<{ c: HomeContent }> = ({ c }) => (
  <section id="contact" aria-labelledby="contact-t" className="scroll-mt-16 py-14 sm:py-16">
    <div className="mx-auto max-w-6xl px-4">
      <SectionTitle kicker="Contact" title="Une question ? Écrivez-nous" id="contact-t" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3 text-slate-700">
          <p>Une question sur l'établissement ou l'admission d'un enfant ? Écrivez-nous avec le formulaire, ou appelez-nous directement.</p>
          {hasText(c.contactPhone) && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gold-700" aria-hidden /><a className="hover:underline" href={telHref(c.contactPhone)}>{c.contactPhone}</a></p>}
          {hasText(c.contactEmail) && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-gold-700" aria-hidden /><a className="break-all hover:underline" href={`mailto:${c.contactEmail}`}>{c.contactEmail}</a></p>}
        </div>
        <div className="rounded-md border border-line bg-white p-5"><ContactForm /></div>
      </div>
    </div>
  </section>
);

// --- Section 10 : pied de page ------------------------------------------------------------------
const Footer: React.FC<{ name: string; place: string; c: HomeContent; onLegal: (k: 'legal' | 'privacy') => void }> = ({ name, place, c, onLegal }) => (
  <footer className="bg-brand-900 text-brand-100">
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
      <div>
        <div className="flex items-center gap-3">
          <Logo className="h-14 w-auto" />
          <p className="font-semibold leading-tight text-white">{name}</p>
        </div>
        <p className="mt-3 max-w-sm text-sm leading-relaxed">Établissement d'enseignement coranique et internat de mémorisation du Saint Coran.</p>
        {c.socialLinks.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-3 text-sm">
            {c.socialLinks.map((l, i) => <li key={i}><a href={l.url} target="_blank" rel="noopener noreferrer" className="text-white underline-offset-4 hover:underline">{l.label}</a></li>)}
          </ul>
        )}
      </div>
      <div className="text-sm">
        <h3 className="mb-2 font-semibold text-white">Nous trouver</h3>
        <p>{hasText(c.address) ? c.address : place}</p>
        {hasText(c.contactPhone) && <p className="mt-1"><a href={telHref(c.contactPhone)} className="hover:underline">{c.contactPhone}</a></p>}
        {hasText(c.contactEmail) && <p className="mt-1 break-all"><a href={`mailto:${c.contactEmail}`} className="hover:underline">{c.contactEmail}</a></p>}
      </div>
      <div className="text-sm">
        <h3 className="mb-2 font-semibold text-white">Liens</h3>
        <ul className="space-y-1">
          <li><a href="#daara" className="hover:underline">Notre Daara</a></li>
          <li><a href="#visite" className="hover:underline">Demander une visite</a></li>
          <li><Link to="/connexion" className="hover:underline">Espace parent</Link></li>
          {hasText(c.legalNotice) && <li><button onClick={() => onLegal('legal')} className="hover:underline">Mentions légales</button></li>}
          {hasText(c.privacyPolicy) && <li><button onClick={() => onLegal('privacy')} className="hover:underline">Politique de confidentialité</button></li>}
        </ul>
      </div>
    </div>
    <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-brand-100/80">© {new Date().getFullYear()} {name}</div>
  </footer>
);
