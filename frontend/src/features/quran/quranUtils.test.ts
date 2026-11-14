import { describe, expect, it } from 'vitest';
import type { Surah, SurahAudio } from '../../types/quran';
import {
  buildQueue, clampAyah, filterSurahs, isHighlighted, nextIndex, normalizeSearch, parseBounded, parseReaderParams, readerPath,
} from './quranUtils';

const mk = (number: number, nameSimple: string, nameFrench: string, nameArabic = ''): Surah => ({
  number, nameSimple, nameFrench, nameArabic, revelationPlace: '', versesCount: 7, pageStart: 1, pageEnd: 1, bismillahPre: true,
});
const surahs = [mk(1, 'Al-Fatihah', "L'Ouverture"), mk(36, 'Ya-Sin', 'Ya-Sin'), mk(112, 'Al-Ikhlas', 'Le Monothéisme pur')];

describe('recherche de sourates', () => {
  it("ignore la casse, les accents, les traits d'union et apostrophes", () => {
    expect(normalizeSearch("L'Ouverture")).toBe('louverture');
    expect(normalizeSearch('Monothéisme')).toBe('monotheisme');
  });
  it('trouve par nom, nom français et numéro exact', () => {
    expect(filterSurahs(surahs, 'fatiha').map(s => s.number)).toEqual([1]);
    expect(filterSurahs(surahs, 'zzz')).toHaveLength(0);
    expect(filterSurahs(surahs, 'al fatihah').map(s => s.number)).toEqual([1]);
    expect(filterSurahs(surahs, 'monotheisme').map(s => s.number)).toEqual([112]);
    expect(filterSurahs(surahs, '36').map(s => s.number)).toEqual([36]);
    expect(filterSurahs(surahs, '3')).toHaveLength(0);
    expect(filterSurahs(surahs, '  ')).toHaveLength(3);
  });
});

describe('paramètres du lecteur', () => {
  it('borne les entiers', () => {
    expect(parseBounded('12', 1, 114)).toBe(12);
    expect(parseBounded('0', 1, 114)).toBeNull();
    expect(parseBounded('115', 1, 114)).toBeNull();
    expect(parseBounded('abc', 1, 114)).toBeNull();
    expect(parseBounded(null, 1, 114)).toBeNull();
  });
  it('lit et reconstruit un lien', () => {
    const p = parseReaderParams(new URLSearchParams('surah=112&ayah=2&to=4&student=abc&play=1'));
    expect(p).toEqual({ surah: 112, ayah: 2, to: 4, student: 'abc', play: true });
    expect(readerPath(p!)).toBe('/app/coran?surah=112&ayah=2&to=4&student=abc&play=1');
  });
  it('rejette une sourate invalide et ignore une fin avant le début', () => {
    expect(parseReaderParams(new URLSearchParams('surah=200'))).toBeNull();
    expect(parseReaderParams(new URLSearchParams('surah=2&ayah=5&to=3'))?.to).toBeNull();
  });
  it('borne un verset au nombre de versets', () => {
    expect(clampAyah(0, 7)).toBe(1);
    expect(clampAyah(99, 7)).toBe(7);
    expect(clampAyah(NaN, 7)).toBe(1);
  });
  it('met en évidence un verset ou une plage', () => {
    expect(isHighlighted(3, 3, null)).toBe(true);
    expect(isHighlighted(4, 3, null)).toBe(false);
    expect(isHighlighted(4, 3, 5)).toBe(true);
    expect(isHighlighted(6, 3, 5)).toBe(false);
    expect(isHighlighted(1, null, null)).toBe(false);
  });
});

describe('liste de lecture audio', () => {
  const audio: SurahAudio = {
    reciter: 'r', surah: 1,
    chapterAudio: { ayah: null, verseKey: null, url: 'https://x/1.mp3', durationSeconds: 40 },
    verses: [3, 1, 2, 4].map(a => ({ ayah: a, verseKey: `1:${a}`, url: `https://x/${a}.mp3`, durationSeconds: 5 })),
  };
  it('sourate complète', () => {
    expect(buildQueue(audio, 'chapter', 1, 1).map(t => t.url)).toEqual(['https://x/1.mp3']);
    expect(buildQueue({ ...audio, chapterAudio: null }, 'chapter', 1, 1)).toEqual([]);
  });
  it("versets dans l'ordre, plage inversée tolérée", () => {
    expect(buildQueue(audio, 'verses', 2, 3).map(t => t.ayah)).toEqual([2, 3]);
    expect(buildQueue(audio, 'verses', 4, 1).map(t => t.ayah)).toEqual([1, 2, 3, 4]);
    expect(buildQueue({ ...audio, verses: [] }, 'verses', 1, 4)).toEqual([]);
  });
  it('enchaînement et répétition', () => {
    expect(nextIndex(0, 3, false)).toBe(1);
    expect(nextIndex(2, 3, false)).toBeNull();
    expect(nextIndex(2, 3, true)).toBe(0);
    expect(nextIndex(0, 0, true)).toBeNull();
  });
});
