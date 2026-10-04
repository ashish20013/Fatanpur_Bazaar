'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from '../icons';

/** Minimal typing for the Web Speech API (Chrome on Android ships it as webkitSpeechRecognition). */
interface SpeechAlt {
  transcript: string;
}
interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<SpeechAlt> & { isFinal: boolean }>;
}
interface Recognizer {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start: () => void;
  abort: () => void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Search box + microphone. Voice is the easiest way in for people who find typing Hindi hard:
 * tap the mic, say "आलू" — the words land in the box and the search runs. Falls back politely
 * where the browser has no speech support.
 */
export function SearchBar({ lang, initial = '' }: { lang: Lang; initial?: string }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const rec = useRef<Recognizer | null>(null);

  const go = useCallback(
    (text: string): void => {
      const s = text.trim().slice(0, 60);
      if (s.length >= 2) router.push(`/khoj?q=${encodeURIComponent(s)}`);
    },
    [router],
  );

  useEffect(() => () => rec.current?.abort(), []);
  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(id);
  }, [note]);

  function startVoice(): void {
    const Ctor = recognizerCtor();
    if (!Ctor) {
      setNote(t.header.voiceUnsupported);
      return;
    }
    const r = new Ctor();
    r.lang = lang === 'en' ? 'en-IN' : 'hi-IN';
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        const alt = res?.[0];
        if (!alt) continue;
        text += alt.transcript;
        if (res.isFinal) finalText = text;
      }
      setHeard(text);
      setQ(text);
    };
    r.onerror = (e) => {
      setListening(false);
      if (e.error === 'aborted') return;
      setNote(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? t.header.voiceDenied : t.header.voiceNothing);
    };
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) go(finalText);
    };
    rec.current = r;
    setHeard('');
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
      setNote(t.header.voiceNothing);
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex h-12 items-center gap-1 rounded-full border border-au-300/60 bg-card pl-4 pr-1 shadow-1 focus-within:border-au-500 focus-within:shadow-gold"
      >
        <Icon name="search" size={20} className="shrink-0 text-em-700" />
        <input
          type="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.header.searchPlaceholder}
          aria-label={t.header.searchShort}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-body text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="button"
          onClick={startVoice}
          aria-label={t.header.voice}
          title={t.header.voice}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-em-700 text-au-200 transition-colors duration-150 hover:bg-em-600"
        >
          <Icon name="microphone" size={20} />
        </button>
      </form>
      {note ? (
        <p role="status" className="absolute left-2 right-2 top-[calc(100%+6px)] z-10 rounded-lg bg-ink px-3 py-2 text-sm text-white shadow-2">
          {note}
        </p>
      ) : null}

      {listening ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0b2618]/70 sm:items-center" role="dialog" aria-modal="true" aria-label={t.header.listening}>
          <div className="fb-sheet w-full max-w-sm rounded-t-[22px] bg-card px-6 pb-8 pt-7 text-center shadow-3 sm:rounded-[22px]">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-em-700 text-au-200" style={{ animation: 'fb-pulse 1.4s ease-out infinite' }}>
              <Icon name="microphone" size={34} />
            </div>
            <p className="fb-display mt-5 text-2xl text-ink">{t.header.listening}</p>
            <p className="mt-2 min-h-[1.6em] text-lg font-semibold text-em-700" aria-live="polite">
              {heard || t.header.voiceHint}
            </p>
            <button type="button" onClick={() => rec.current?.abort()} className="mt-5 h-11 rounded-full border border-line-2 px-6 text-base font-semibold text-ink-2">
              {t.common.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
