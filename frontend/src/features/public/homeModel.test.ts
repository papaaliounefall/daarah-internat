import type { HomeContent } from './publicApi';
import { DEFAULTS, approachOf, hasBoarding, navLinks, schoolJsonLd, teachingsOf, todayIso } from './homeModel';

const empty: HomeContent = {
  tagline: '', heroText: '', heroImageUrl: null, history: '', mission: '', vision: '', values: [], activities: [], team: [],
  teachings: [], boardingIntro: '', boarding: [], approach: [], socialLinks: [], legalNotice: '', privacyPolicy: '',
  admissionInfo: '', contactPhone: '', contactEmail: '', address: '', latitude: null, longitude: null,
};

describe('contenu de la page d\'accueil', () => {
  it('utilise les textes par défaut tant que le Daara n\'a rien saisi', () => {
    expect(teachingsOf(empty)).toEqual(DEFAULTS.teachings);
    expect(approachOf(empty)).toHaveLength(4);
  });
  it('les textes saisis remplacent les textes par défaut', () => {
    const c = { ...empty, teachings: [{ title: 'Tajwid', text: 'x' }, { title: '  ', text: 'ignoré' }] };
    expect(teachingsOf(c)).toEqual([{ title: 'Tajwid', text: 'x' }]);
  });
  it("la vie à l'internat n'existe que si elle est renseignée", () => {
    expect(hasBoarding(empty)).toBe(false);
    expect(hasBoarding({ ...empty, boarding: [{ title: 'Chambres', text: '' }] })).toBe(true);
    expect(navLinks(empty, false).map(l => l.label)).not.toContain("Vie à l'internat");
    expect(navLinks({ ...empty, boardingIntro: 'Texte' }, true).map(l => l.label)).toEqual(
      ['Accueil', 'Notre Daara', 'Enseignement', "Vie à l'internat", 'Actualités', 'Contact'],
    );
  });
  it('données structurées : uniquement des faits renseignés', () => {
    const ld = schoolJsonLd('Daara', 'Kahone', 'Sénégal', { ...empty, contactPhone: '77 000' });
    expect(ld.telephone).toBe('77 000');
    expect(ld.email).toBeUndefined();
    expect(ld.geo).toBeUndefined();
  });
  it('todayIso est au format AAAA-MM-JJ', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
