import { describe, expect, it } from 'vitest';
import type { PublicContent } from '../../types/site';
import {
  isMostlyArabic, osmUrl, serverContactErrors, telHref, textProps, toCoord, validateContact, visibleSections,
} from './portalUtils';

const empty: PublicContent = {
  tagline: '', history: '', mission: '', vision: '', values: [], activities: [], team: [], admissionInfo: '',
  contactPhone: '', contactEmail: '', address: '', latitude: null, longitude: null,
};

describe('visibleSections', () => {
  it('n\'affiche aucune section vide', () => {
    expect(visibleSections(empty)).toEqual([]);
    expect(visibleSections({ ...empty, history: '   ', values: [{ title: ' ', text: 'x' }] })).toEqual([]);
  });
  it('affiche seulement les sections renseignées, dans l\'ordre', () => {
    const ids = visibleSections({
      ...empty, mission: 'Enseigner', admissionInfo: 'Dossier', team: [{ name: 'A', role: '' }],
    }).map(s => s.id);
    expect(ids).toEqual(['mission', 'equipe', 'admission']);
  });
});

describe('texte arabe', () => {
  it('détecte un texte majoritairement arabe', () => {
    expect(isMostlyArabic('مدرسة الشيخ')).toBe(true);
    expect(isMostlyArabic('Daara Kahone')).toBe(false);
    expect(isMostlyArabic('123 -')).toBe(false);
  });
  it('applique la police et le sens de lecture', () => {
    expect(textProps('بسم الله')).toMatchObject({ dir: 'rtl', lang: 'ar' });
    expect(textProps('bonjour').dir).toBeUndefined();
  });
});

describe('liens', () => {
  it('construit le lien OpenStreetMap', () => {
    expect(osmUrl(14.1, -16.07)).toBe('https://www.openstreetmap.org/?mlat=14.1&mlon=-16.07#map=16/14.1/-16.07');
  });
  it('convertit les coordonnées', () => {
    expect(toCoord('14.123456')).toBe(14.123456);
    expect(toCoord(null)).toBeNull();
    expect(toCoord('')).toBeNull();
  });
  it('nettoie le numéro', () => {
    expect(telHref('77 634 46 76')).toBe('tel:776344676');
    expect(telHref('+221 77 634 46 76')).toBe('tel:+221776344676');
  });
});

describe('validateContact', () => {
  const ok = { name: 'Awa Diop', phone: '77 634 46 76', email: '', message: 'Quelles sont les conditions ?' };
  it('accepte une demande valide', () => {
    expect(validateContact(ok)).toEqual({});
    expect(validateContact({ ...ok, phone: '', email: 'awa@example.com' })).toEqual({});
  });
  it('exige un moyen de contact', () => {
    expect(validateContact({ ...ok, phone: '' }).phone).toMatch(/téléphone ou une adresse e-mail/);
  });
  it('contrôle nom, e-mail, téléphone et message', () => {
    const e = validateContact({ name: 'A', phone: 'abc', email: 'x', message: 'court' });
    expect(Object.keys(e).sort()).toEqual(['email', 'message', 'name', 'phone']);
  });
});

describe('serverContactErrors', () => {
  it('répartit les erreurs par champ', () => {
    const r = serverContactErrors({ name: ['Le nom est trop court.'], phone: ['Invalide.'], detail: 'Autre' });
    expect(r.fields).toEqual({ name: 'Le nom est trop court.', phone: 'Invalide.' });
    expect(r.general).toBe('Autre');
  });
  it('ignore un corps inattendu', () => {
    expect(serverContactErrors('<html>')).toEqual({ fields: {}, general: null });
  });
});
