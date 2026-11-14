import { describe, expect, it } from 'vitest';
import { audienceLabel, notificationLink, validateAnnouncement } from './notificationUtils';

describe('audienceLabel', () => {
  it('vide = tous les rôles', () => {
    expect(audienceLabel([])).toBe('Tous les rôles');
  });
  it('liste les rôles dans un ordre stable', () => {
    expect(audienceLabel(['PARENT', 'MAITRE'])).toBe('Maîtres coraniques, Parents et tuteurs');
  });
});

describe('validateAnnouncement', () => {
  it('exige titre et message', () => {
    expect(validateAnnouncement('  ', '')).toEqual({ title: 'Le titre est obligatoire.', message: 'Le message est obligatoire.' });
  });
  it('accepte une annonce valide', () => {
    expect(validateAnnouncement('Rentrée', 'Reprise lundi.')).toEqual({});
  });
  it('refuse un titre trop long', () => {
    expect(validateAnnouncement('x'.repeat(201), 'ok').title).toMatch(/200/);
  });
});

describe('notificationLink', () => {
  it('mène un parent vers ses enfants', () => {
    expect(notificationLink('student', 'abc', 'PARENT')).toBe('/app/mes-enfants');
  });
  it('mène le personnel vers la fiche talibé', () => {
    expect(notificationLink('student', 'abc', 'DIRECTEUR')).toBe('/app/talibes/abc');
  });
  it('réserve échéances et demandes de contact aux rôles concernés', () => {
    expect(notificationLink('due', '1', 'DIRECTEUR')).toBe('/app/finances');
    expect(notificationLink('due', '1', 'PARENT')).toBeNull();
    expect(notificationLink('contact_request', '1', 'MAITRE')).toBeNull();
    expect(notificationLink('contact_request', '1', 'ASSISTANT')).toBe('/app/parametres?onglet=demandes');
    expect(notificationLink('contact_request', '1', 'DIRECTEUR')).toBe('/app/parametres?onglet=demandes');
  });
  it('ignore un type inconnu', () => {
    expect(notificationLink('autre', '1', 'DIRECTEUR')).toBeNull();
  });
});
