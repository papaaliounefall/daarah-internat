import { describe, expect, it } from 'vitest';
import {
  buildSitePatch, headerLines, isHttpUrl, moveItem, normalizeNameAr, toSiteForm, validateSite, validateSocialLinks, type SiteForm,
} from './siteContentUtils';
import type { SiteContent } from '../../../types/site';

const server: SiteContent = {
  tagline: '', history: 'H', mission: '', vision: '', values: [{ title: 'Foi', text: '' }], activities: [],
  team: [], admissionInfo: '', contactPhone: '77', contactEmail: 'a@b.sn', address: '', latitude: '14.123400', longitude: null,
  heroImageUrl: null, heroText: '', teachings: [], boardingIntro: '', boarding: [], approach: [], socialLinks: [], legalNotice: '', privacyPolicy: '',
};

describe('toSiteForm', () => {
  it('convertit les coordonnées décimales en saisie', () => {
    const f = toSiteForm(server);
    expect(f.latitude).toBe('14.123400');
    expect(f.longitude).toBe('');
  });
});

describe('validateSite', () => {
  const base = toSiteForm(server);
  const withCoords = (latitude: string, longitude: string): SiteForm => ({ ...base, latitude, longitude });
  it('exige les deux coordonnées ou aucune', () => {
    expect(validateSite(base).longitude).toMatch(/les deux vides/);
    expect(validateSite(withCoords('', '')).latitude).toBeUndefined();
  });
  it('contrôle les bornes', () => {
    expect(validateSite(withCoords('95', '10')).latitude).toMatch(/entre -90 et 90/);
    expect(validateSite(withCoords('10', '-200')).longitude).toMatch(/entre -180 et 180/);
    expect(validateSite(withCoords('abc', '10')).latitude).toBe('Latitude invalide.');
  });
  it('accepte la virgule décimale', () => {
    expect(validateSite(withCoords('14,69', '-16,07'))).toEqual({});
  });
  it('contrôle l\'e-mail', () => {
    expect(validateSite({ ...base, latitude: '', contactEmail: 'x' }).contactEmail).toBeDefined();
  });
});

describe('buildSitePatch', () => {
  it('retire les lignes sans titre et formate les coordonnées', () => {
    const f: SiteForm = {
      ...toSiteForm(server), values: [{ title: ' Foi ', text: ' x ' }, { title: '  ', text: 'orphelin' }],
      team: [{ name: '', role: 'Directeur' }], latitude: '14,5', longitude: '-16.07',
    };
    const p = buildSitePatch(f);
    expect(p.values).toEqual([{ title: 'Foi', text: 'x' }]);
    expect(p.team).toEqual([]);
    expect(p.latitude).toBe('14.500000');
    expect(p.longitude).toBe('-16.070000');
  });
  it('envoie null quand les coordonnées sont vides', () => {
    const p = buildSitePatch({ ...toSiteForm(server), latitude: '', longitude: '' });
    expect(p.latitude).toBeNull();
    expect(p.longitude).toBeNull();
  });
});

describe('moveItem', () => {
  it('échange deux éléments voisins', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });
  it('ne sort pas des bornes', () => {
    const l = ['a', 'b'];
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 1, 1)).toBe(l);
  });
});

describe('en-tête arabe', () => {
  it('une ligne par ligne d\'en-tête, lignes vides ignorées', () => {
    expect(headerLines('  سطر 1 \r\n\n سطر 2 ')).toEqual(['سطر 1', 'سطر 2']);
    expect(normalizeNameAr('a\n\n b ')).toBe('a\nb');
  });
});

describe('isHttpUrl', () => {
  it('accepte http et https avec un hôte', () => {
    expect(isHttpUrl('https://www.facebook.com/daara')).toBe(true);
    expect(isHttpUrl(' http://exemple.sn ')).toBe(true);
  });
  it('refuse les autres schémas, les adresses incomplètes et les espaces', () => {
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl('www.facebook.com')).toBe(false);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('ftp://exemple.sn')).toBe(false);
    expect(isHttpUrl('https://')).toBe(false);
    expect(isHttpUrl('https://a b.sn')).toBe(false);
  });
});

describe('validateSocialLinks', () => {
  it('ignore les lignes vides et accepte des liens valides', () => {
    expect(validateSocialLinks([{ label: '', url: '' }, { label: 'Facebook', url: 'https://fb.com/x' }])).toBeUndefined();
  });
  it('signale un libellé manquant ou une adresse invalide', () => {
    expect(validateSocialLinks([{ label: '', url: 'https://fb.com/x' }])).toMatch(/Lien 1 : indiquez un libellé/);
    expect(validateSocialLinks([{ label: 'A', url: 'https://a.sn' }, { label: 'B', url: 'b.sn' }])).toMatch(/Lien 2 : l'adresse/);
  });
  it('limite le nombre de liens', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, url: 'https://a.sn' }));
    expect(validateSocialLinks(many)).toMatch(/8 liens au maximum/);
  });
});

describe("nouveaux champs de la page d'accueil", () => {
  it("toSiteForm et buildSitePatch conservent l'ordre et nettoient les lignes vides", () => {
    const f: SiteForm = {
      ...toSiteForm(server),
      approach: [{ title: ' B ', text: '' }, { title: '', text: 'x' }, { title: 'A', text: '' }],
      socialLinks: [{ label: '', url: '' }, { label: ' Fb ', url: ' https://fb.com/x ' }],
      heroText: ' Bienvenue ',
    };
    const p = buildSitePatch(f);
    expect(p.approach?.map(a => a.title)).toEqual(['B', 'A']);
    expect(p.socialLinks).toEqual([{ label: 'Fb', url: 'https://fb.com/x' }]);
    expect(p.heroText).toBe('Bienvenue');
  });
  it("validateSite remonte l'erreur des liens", () => {
    const f: SiteForm = { ...toSiteForm(server), latitude: '', socialLinks: [{ label: 'X', url: 'x' }] };
    expect(validateSite(f).socialLinks).toBeDefined();
  });
});
