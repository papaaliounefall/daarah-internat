/** Formes de /quran/* (voir backend/docs/api/quran.md). Clés en camelCase. Le texte vient uniquement de l'API. */

export interface Surah {
  number: number;
  nameArabic: string;
  nameSimple: string;
  nameFrench: string;
  revelationPlace: string;
  versesCount: number;
  pageStart: number | null;
  pageEnd: number | null;
  bismillahPre: boolean;
}

export interface Ayah {
  surah: number;
  numberInSurah: number;
  verseKey: string;
  textUthmani: string;
  juz: number;
  hizb: number;
  rubElHizb: number;
  page: number;
  sajda: boolean | number | null;
}

export interface SurahDetail extends Surah {
  ayat: Ayah[];
}

export interface Reciter {
  slug: string;
  name: string;
  source: string;
  isDefault: boolean;
  licenseNote: string;
}

export interface AudioTrack {
  ayah: number | null;
  verseKey: string | null;
  url: string;
  durationSeconds: number | null;
}

export interface SurahAudio {
  reciter: string;
  surah: number;
  chapterAudio: AudioTrack | null;
  verses: AudioTrack[];
}

/** Paramètres du lecteur dans l'URL : ?surah=&ayah=&to=&student=&play= */
export interface ReaderLink {
  surah: number;
  ayah?: number | null;
  /** Fin d'une plage mise en évidence (facultatif). */
  to?: number | null;
  student?: string | null;
  /** Lance l'écoute de la sourate à l'ouverture. */
  play?: boolean;
}
