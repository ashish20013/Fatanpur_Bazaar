'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePrefs } from '@/lib/client';
import type { Lang } from '@/lib/i18n';

/** One tap switches Hindi ⇄ English (Hindi is the default). Remembered for a year in a cookie. */
export function LangToggle({ lang, title, tone = 'dark' }: { lang: Lang; title: string; tone?: 'dark' | 'light' }): React.ReactNode {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (l: Lang): void => {
    if (l === lang || pending) return;
    void savePrefs({ lang: l }).then(() => start(() => router.refresh()));
  };
  const base = tone === 'dark' ? 'border-au-400/50 bg-em-900/40' : 'border-line-2 bg-card';
  const on = tone === 'dark' ? 'bg-au-300 text-em-900' : 'bg-em-700 text-white';
  const off = tone === 'dark' ? 'text-au-100' : 'text-ink-2';
  return (
    <div role="group" aria-label={title} className={`flex h-11 shrink-0 items-center rounded-full border p-1 ${base} ${pending ? 'opacity-70' : ''}`}>
      {(['hi', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => set(l)}
          className={`h-9 min-w-[42px] rounded-full px-2.5 text-sm font-semibold transition-colors duration-150 ${lang === l ? on : off}`}
        >
          {l === 'hi' ? 'हिं' : 'EN'}
        </button>
      ))}
    </div>
  );
}
