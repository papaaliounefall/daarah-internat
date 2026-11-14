import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Repeat } from 'lucide-react';
import { Spinner } from '../../components/ui';
import { useFetch } from '../../hooks/useFetch';
import { getSurahAudio, listReciters } from '../../services/quran';
import { buildQueue, clampAyah, defaultReciterSlug, nextIndex, type AudioMode } from './quranUtils';

interface Props {
  surah: number;
  versesCount: number;
  /** Verset de départ proposé pour l'écoute par versets. */
  focusAyah: number | null;
  /** Lance la lecture dès que l'audio est prêt (clic « Écouter la récitation »). */
  autoPlay?: boolean;
  /** Appelé avec le numéro du verset en cours de récitation (audio verset). */
  onAyahChange?: (ayah: number) => void;
}

/** Lecteur audio simple : sourate complète ou versets, pause/reprise (contrôles natifs), répétition, récitateur. */
export const AudioPanel: React.FC<Props> = ({ surah, versesCount, focusAyah, autoPlay, onAyahChange }) => {
  const recitersState = useFetch(listReciters, []);
  const [reciter, setReciter] = useState('');
  const reciters = recitersState.data;
  const effectiveReciter = reciter || (reciters ? defaultReciterSlug(reciters) : '');

  const audioState = useFetch(
    () => (reciters && reciters.length > 0 ? getSurahAudio(surah, effectiveReciter || undefined) : Promise.resolve(undefined)),
    [surah, effectiveReciter, reciters?.length],
  );
  const audio = audioState.data;

  const [mode, setMode] = useState<AudioMode>('chapter');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [repeat, setRepeat] = useState(false);
  const [idx, setIdx] = useState(0);
  const [mediaError, setMediaError] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const el = useRef<HTMLAudioElement>(null);
  const resume = useRef(false);
  const autoStarted = useRef(false);

  const hasChapter = !!audio?.chapterAudio;
  const hasVerses = (audio?.verses.length ?? 0) > 0;

  // Mode par défaut selon ce que l'API fournit.
  useEffect(() => {
    if (!audio) return;
    if (mode === 'chapter' && !hasChapter && hasVerses) setMode('verses');
    if (mode === 'verses' && !hasVerses && hasChapter) setMode('chapter');
  }, [audio, hasChapter, hasVerses, mode]);

  // Nouvelle sourate : on repart de zéro.
  useEffect(() => {
    setFrom(clampAyah(focusAyah ?? 1, versesCount));
    setTo(clampAyah(focusAyah ?? 1, versesCount));
    setIdx(0);
    autoStarted.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah]);

  const queue = useMemo(() => buildQueue(audio, mode, from, to), [audio, mode, from, to]);
  const queueKey = queue.map(t => t.url).join('|');
  const track = queue[idx] ?? null;

  useEffect(() => { setIdx(0); setMediaError(false); }, [queueKey]);

  // Lecture automatique demandée (une seule fois par sourate) ; refusée par le navigateur → bouton lecture natif.
  useEffect(() => {
    if (!autoPlay || autoStarted.current || !track || !el.current) return;
    autoStarted.current = true;
    el.current.play().catch(() => setBlocked(true));
  }, [autoPlay, track]);

  // Enchaînement : après changement de piste, on relance la lecture si elle était en cours.
  useEffect(() => {
    if (resume.current && el.current) {
      resume.current = false;
      el.current.play().catch(() => setBlocked(true));
    }
  }, [idx, queueKey]);

  const announce = (t: typeof track) => { if (t?.ayah) onAyahChange?.(t.ayah); };

  const onEnded = () => {
    const next = nextIndex(idx, queue.length, repeat);
    if (next === null) return;
    if (next === idx) {
      const a = el.current;
      if (a) { a.currentTime = 0; a.play().catch(() => setBlocked(true)); }
      return;
    }
    resume.current = true;
    setIdx(next);
  };

  if (recitersState.error) return <Notice>{recitersState.error} <button className="underline" onClick={recitersState.reload}>Réessayer</button></Notice>;
  if (!reciters) return <Spinner label="Chargement de l'audio…" />;
  if (reciters.length === 0) return <Notice>Aucun récitateur n'est installé pour le moment.</Notice>;

  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="audio-mode" className="mb-1 block text-xs font-medium text-slate-600">Écoute</label>
          <select id="audio-mode" className="input !w-auto" value={mode} onChange={e => setMode(e.target.value as AudioMode)}>
            <option value="chapter" disabled={!hasChapter}>Sourate complète</option>
            <option value="verses" disabled={!hasVerses}>Verset ou groupe de versets</option>
          </select>
        </div>
        {mode === 'verses' && (
          <>
            <div>
              <label htmlFor="audio-from" className="mb-1 block text-xs font-medium text-slate-600">Du verset</label>
              <input id="audio-from" type="number" inputMode="numeric" min={1} max={versesCount} className="input !w-20" value={from}
                onChange={e => setFrom(clampAyah(Number(e.target.value), versesCount))} />
            </div>
            <div>
              <label htmlFor="audio-to" className="mb-1 block text-xs font-medium text-slate-600">Au verset</label>
              <input id="audio-to" type="number" inputMode="numeric" min={1} max={versesCount} className="input !w-20" value={to}
                onChange={e => setTo(clampAyah(Number(e.target.value), versesCount))} />
            </div>
          </>
        )}
        {reciters.length > 1 && (
          <div>
            <label htmlFor="audio-reciter" className="mb-1 block text-xs font-medium text-slate-600">Récitateur</label>
            <select id="audio-reciter" className="input !w-auto" value={effectiveReciter} onChange={e => setReciter(e.target.value)}>
              {reciters.map(r => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
          </div>
        )}
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={repeat} onChange={e => setRepeat(e.target.checked)} className="h-4 w-4" />
          <Repeat className="h-4 w-4 text-slate-500" aria-hidden /> Répéter
        </label>
      </div>

      <div className="mt-3">
        {audioState.loading && !audio ? (
          <Spinner label="Chargement de l'audio…" />
        ) : audioState.error ? (
          <Notice>{audioState.error} <button className="underline" onClick={audioState.reload}>Réessayer</button></Notice>
        ) : !track ? (
          <p className="text-sm text-slate-500">
            {hasChapter || hasVerses ? "Aucun audio pour cette sélection." : "Aucun audio n'est disponible pour cette sourate."}
          </p>
        ) : (
          <>
            <audio
              ref={el}
              src={track.url}
              controls
              preload="none"
              className="w-full"
              onPlay={() => { setBlocked(false); announce(track); }}
              onEnded={onEnded}
              onError={() => setMediaError(true)}
              onLoadedData={() => setMediaError(false)}
              aria-label={mode === 'chapter' ? 'Récitation de la sourate' : `Récitation du verset ${track.ayah}`}
            />
            {mode === 'verses' && queue.length > 1 && (
              <p className="mt-1 text-xs text-slate-500">Verset {track.ayah} ({idx + 1} sur {queue.length})</p>
            )}
            {blocked && <p className="mt-1 text-xs text-slate-500">Appuyez sur lecture pour démarrer la récitation.</p>}
            {mediaError && (
              <p role="alert" className="mt-1 text-sm text-danger">
                L'audio n'a pas pu être chargé (connexion ou source indisponible).{' '}
                <button className="underline" onClick={() => { setMediaError(false); el.current?.load(); }}>Réessayer</button>
              </p>
            )}
          </>
        )}
        {(reciters.find(r => r.slug === effectiveReciter)?.licenseNote ?? '') !== '' && (
          <p className="mt-2 text-xs text-slate-400">{reciters.find(r => r.slug === effectiveReciter)?.licenseNote}</p>
        )}
      </div>
    </div>
  );
};

const Notice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p role="alert" className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{children}</p>
);
