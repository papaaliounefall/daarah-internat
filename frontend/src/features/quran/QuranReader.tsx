import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, List, Minus, Plus, Volume2 } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useFetch } from '../../hooks/useFetch';
import { getBasmala, getSurah, listSurahs, resetQuranCache } from '../../services/quran';
import { getStudent } from '../../services/students';
import type { Ayah, SurahDetail } from '../../types/quran';
import { AudioPanel } from './AudioPanel';
import { SurahList } from './SurahList';
import {
  QURAN_FONT_SIZES, arabicDigits, clampAyah, clampSizeIndex, isHighlighted, loadSizeIndex, parseReaderParams, saveSizeIndex,
} from './quranUtils';

const CORPUS_MISSING =
  "Le corpus coranique n'est pas encore installé sur le serveur. L'administrateur doit lancer l'import du Coran (commande import_quran) ; " +
  "le texte n'est jamais saisi ni complété à la main.";

type Loaded<T> = { ok: true; data: T } | { ok: false; message: string };

/** Charge une sourate sans jamais rejeter : un 404 signifie que le corpus n'est pas (complètement) importé. */
async function loadSurah(n: number): Promise<Loaded<SurahDetail>> {
  try {
    const d = await getSurah(n);
    if (!d.ayat || d.ayat.length === 0) return { ok: false, message: CORPUS_MISSING };
    return { ok: true, data: d };
  } catch (e) {
    const status = (e as { response?: { status?: number } }).response?.status;
    return { ok: false, message: status === 404 ? CORPUS_MISSING : errorMessage(e) };
  }
}

export const QuranReaderPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const link = useMemo(() => parseReaderParams(params), [params]);
  const surahNumber = link?.surah ?? null;

  const surahs = useFetch(listSurahs, []);
  const detail = useFetch(() => (surahNumber ? loadSurah(surahNumber) : Promise.resolve(null)), [surahNumber]);
  const student = useFetch(
    () => (link?.student ? getStudent(link.student).catch(() => null) : Promise.resolve(null)),
    [link?.student],
  );

  const [showList, setShowList] = useState(surahNumber === null);
  const [sizeIndex, setSizeIndex] = useState(loadSizeIndex);
  const [showAudio, setShowAudio] = useState(!!link?.play);
  const [jump, setJump] = useState('');
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (surahNumber !== null) setShowList(false); }, [surahNumber]);
  useEffect(() => { if (link?.play) setShowAudio(true); }, [link?.play, surahNumber]);

  const changeSize = (delta: number) => {
    const next = clampSizeIndex(sizeIndex + delta);
    setSizeIndex(next);
    saveSizeIndex(next);
  };

  /** Met à jour l'URL (sans empiler l'historique) en conservant l'enfant suivi. */
  const go = useCallback((surah: number, ayah?: number | null, to?: number | null) => {
    const p = new URLSearchParams();
    p.set('surah', String(surah));
    if (ayah) p.set('ayah', String(ayah));
    if (ayah && to && to > ayah) p.set('to', String(to));
    if (link?.student) p.set('student', link.student);
    setParams(p, { replace: true });
  }, [link?.student, setParams]);

  const result = detail.data;
  const surah = result?.ok ? result.data : null;
  const count = surah?.ayat.length ?? 0;
  const focus = link?.ayah && surah ? clampAyah(link.ayah, count) : null;
  const focusAyah: Ayah | undefined = focus && surah ? surah.ayat.find(a => a.numberInSurah === focus) : undefined;

  // Défilement vers le verset visé (ou le haut de la sourate).
  useEffect(() => {
    if (!surah) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
    if (focus) document.getElementById(`v-${focus}`)?.scrollIntoView({ block: 'center', behavior });
    else topRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [surah, focus]);

  const goAyah = (n: number) => { if (surah) go(surah.number, clampAyah(n, count)); };
  const submitJump = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d+$/.test(jump.trim())) return;
    goAyah(Number(jump));
    setJump('');
  };

  // ---- États de la liste des sourates ----
  let listPanel: React.ReactNode;
  if (surahs.error && !surahs.data) {
    listPanel = <div className="panel"><ErrorState message={surahs.error} onRetry={() => { resetQuranCache(); surahs.reload(); }} /></div>;
  } else if (!surahs.data) {
    listPanel = <div className="panel"><Spinner label="Chargement des sourates…" /></div>;
  } else if (surahs.data.length === 0) {
    listPanel = (
      <div className="panel">
        <EmptyState
          title="Corpus coranique non installé"
          hint={CORPUS_MISSING}
          action={<Button variant="secondary" size="sm" onClick={() => { resetQuranCache(); surahs.reload(); }}>Réessayer</Button>}
        />
      </div>
    );
  } else {
    listPanel = (
      <SurahList
        surahs={surahs.data}
        selected={surahNumber}
        onSelect={n => { go(n); setShowList(false); }}
      />
    );
  }

  const meta = surah ? surahs.data?.find(s => s.number === surah.number) ?? surah : null;
  const fontSize = `${QURAN_FONT_SIZES[sizeIndex]}rem`;

  return (
    <div>
      <PageHeader title="Lecteur du Coran" description="Texte et récitation issus du corpus du serveur." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className={showList ? 'block lg:sticky lg:top-[4.5rem] lg:self-start' : 'hidden lg:sticky lg:top-[4.5rem] lg:block lg:self-start'}>{listPanel}</aside>

        <section className={showList ? 'hidden lg:block' : 'block'} aria-label="Lecture">
          <div ref={topRef} className="scroll-mt-20" />
          {surahNumber === null && (
            <div className="panel"><EmptyState title="Choisissez une sourate" hint="Sélectionnez une sourate dans la liste pour la lire et l'écouter." /></div>
          )}

          {surahNumber !== null && detail.loading && !result && <div className="panel"><Spinner label="Chargement de la sourate…" /></div>}
          {surahNumber !== null && detail.error && !result && (
            <div className="panel"><ErrorState message={detail.error} onRetry={() => { resetQuranCache(); detail.reload(); }} /></div>
          )}
          {result && !result.ok && (
            <div className="panel"><ErrorState message={result.message} onRetry={() => { resetQuranCache(); detail.reload(); }} /></div>
          )}

          {surah && meta && (
            <>
              {link?.student && student.data && (
                <p className="mb-3 rounded-md border border-gold-500/40 bg-gold-100 px-3 py-2 text-sm text-gold-700">
                  Suivi de {student.data.fullName}
                  {link.ayah ? ` : verset ${link.to && link.to > link.ayah ? `${link.ayah} à ${link.to}` : link.ayah} mis en évidence.` : '.'}
                </p>
              )}

              <div className="sticky top-14 z-20 -mx-4 mb-3 [&_button]:min-h-10 border-b border-line bg-white px-4 py-2 sm:mx-0 sm:rounded-md sm:border">
                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" size="sm" className="shrink-0 lg:hidden" onClick={() => setShowList(true)} aria-label="Afficher la liste des sourates">
                    <List className="h-4 w-4" aria-hidden />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-ink">{surah.number}. {surah.nameSimple}</h2>
                    <p className="truncate text-xs text-slate-500">
                      {surah.nameFrench} · {surah.versesCount} versets
                      {surah.revelationPlace ? ` · ${surah.revelationPlace === 'makkah' ? 'mecquoise' : surah.revelationPlace === 'madinah' ? 'médinoise' : surah.revelationPlace}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="secondary" size="sm" disabled={surah.number <= 1} onClick={() => go(surah.number - 1)} aria-label="Sourate précédente">
                      <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sourate</span>
                    </Button>
                    <Button variant="secondary" size="sm" disabled={surah.number >= 114} onClick={() => go(surah.number + 1)} aria-label="Sourate suivante">
                      <span className="hidden sm:inline">Sourate</span> <ChevronRight className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button variant="secondary" size="sm" disabled={!focus || focus <= 1} onClick={() => focus && goAyah(focus - 1)} aria-label="Verset précédent">
                    <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Verset</span>
                  </Button>
                  <Button variant="secondary" size="sm" disabled={!!focus && focus >= count} onClick={() => goAyah((focus ?? 0) + 1)} aria-label="Verset suivant">
                    <span className="hidden sm:inline">Verset</span> <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                  <form onSubmit={submitJump} className="flex items-center gap-1">
                    <label htmlFor="jump" className="sr-only">Aller au verset</label>
                    <input
                      id="jump" type="number" inputMode="numeric" enterKeyHint="go" min={1} max={count} placeholder="N°"
                      className="input !w-16 min-h-10" value={jump} onChange={e => setJump(e.target.value)}
                    />
                    <Button type="submit" variant="ghost" size="sm" className="max-sm:hidden" disabled={!jump.trim()}>Aller</Button>
                  </form>
                  <div className="ml-auto flex items-center gap-1.5" role="group" aria-label="Taille du texte et récitation">
                    <Button variant="secondary" size="sm" disabled={sizeIndex === 0} onClick={() => changeSize(-1)} aria-label="Réduire le texte"><Minus className="h-4 w-4" aria-hidden /></Button>
                    <Button variant="secondary" size="sm" disabled={sizeIndex === QURAN_FONT_SIZES.length - 1} onClick={() => changeSize(1)} aria-label="Agrandir le texte"><Plus className="h-4 w-4" aria-hidden /></Button>
                    <Button variant={showAudio ? 'primary' : 'secondary'} size="sm" onClick={() => setShowAudio(v => !v)} aria-expanded={showAudio} aria-label="Écouter la récitation">
                      <Volume2 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Écouter</span>
                    </Button>
                  </div>
                </div>

                <p className="mt-1.5 text-xs text-slate-500" aria-live="polite">
                  {focusAyah
                    ? `Verset ${focusAyah.numberInSurah} : juz ${focusAyah.juz} · hizb ${focusAyah.hizb} · page ${focusAyah.page}${focusAyah.sajda ? ' · prosternation' : ''}`
                    : `Pages ${surah.pageStart ?? '?'} à ${surah.pageEnd ?? '?'} du mushaf${surah.ayat[0] ? ` · juz ${surah.ayat[0].juz}` : ''}`}
                </p>
              </div>

              {showAudio && (
                <div className="mb-3">
                  <AudioPanel
                    surah={surah.number}
                    versesCount={count}
                    focusAyah={focus}
                    autoPlay={!!link?.play}
                    onAyahChange={n => go(surah.number, n)}
                  />
                </div>
              )}

              <article className="panel px-3 py-5 sm:px-8" aria-label={`Texte de la sourate ${surah.nameSimple}`}>
                {meta.bismillahPre && surah.number !== 1 && <Basmala fontSize={fontSize} />}
                <div dir="rtl" lang="ar" className="font-quran text-ink" style={{ fontSize, lineHeight: 2.4, textAlign: 'justify' }}>
                  {surah.ayat.map(a => {
                    const on = isHighlighted(a.numberInSurah, link?.ayah ? focus : null, link?.to);
                    return (
                      <span
                        key={a.numberInSurah}
                        id={`v-${a.numberInSurah}`}
                        data-ayah={a.numberInSurah}
                        className={`scroll-mt-48 rounded px-0.5 ${on ? 'bg-gold-100' : ''}`}
                        aria-current={on ? 'true' : undefined}
                      >
                        {a.textUthmani}{' '}
                        <button
                          type="button"
                          onClick={() => goAyah(a.numberInSurah)}
                          aria-label={`Verset ${a.numberInSurah}`}
                          className="mx-1 inline-flex h-[1.6em] min-w-[1.6em] items-center justify-center rounded-full border border-gold-500 px-1 align-middle font-sans text-[0.5em] leading-none text-gold-700 hover:bg-gold-100"
                        >
                          {arabicDigits(a.numberInSurah)}
                        </button>{' '}
                      </span>
                    );
                  })}
                </div>
              </article>

              <p className="mt-3 text-xs text-slate-400">Texte : Tanzil Project (tanzil.net), via Quran.com. Le texte n'est jamais modifié par l'application.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

/** Basmala d'en-tête : lue dans le corpus de l'API (1:1). Rien n'est affiché si elle est indisponible. */
const Basmala: React.FC<{ fontSize: string }> = ({ fontSize }) => {
  const { data } = useFetch(getBasmala, []);
  if (!data) return null;
  return (
    <p dir="rtl" lang="ar" className="font-quran mb-3 border-b border-line pb-3 text-center text-ink" style={{ fontSize, lineHeight: 2.2 }}>
      {data.textUthmani}
    </p>
  );
};
