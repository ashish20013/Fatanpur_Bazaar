'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { HomeBanner } from '@fb/shared-types';
import { imageUrl } from '@/lib/format';
import { PUBLIC_API_URL } from '@/lib/env';
import { dict, type Lang } from '@/lib/i18n';

/**
 * The advertising strip above the goods — a 320×50 slot, the size every ad network hands artwork
 * out in, drawn full width and scaled by the screen.
 *
 * It sits above the first row of products and nowhere else. One strip, at the top, where a
 * customer sees it on the way to the shelves: a banner further down the page is a banner nobody
 * looks at, and a second one is the point at which a shop starts to feel like a website that sells
 * advertising rather than vegetables.
 *
 * Three things keep it from being a nuisance:
 *
 *  • It holds. Each slide stays for the number of seconds the owner set (five by default) before
 *    the next one comes round, which is long enough to read a line of Hindi. The first slide gets
 *    the same hold as the rest, so the page does not move the instant it finishes painting.
 *  • It stops when touched. A finger down, a mouse over, or a tab in the background pauses it; a
 *    banner that slides away under the thumb reaching for it is worse than no banner.
 *  • It never moves the page. The slot reserves its exact height from the ratio before any picture
 *    arrives, so nothing below it jumps — and with no banners at all it renders nothing, not an
 *    empty band.
 *
 * With "reduce motion" on, it shows the first banner and does not rotate. Someone who has asked
 * their phone to stop animating things has asked this too.
 */

/** The strip's shape: 320 ÷ 50. The upload rule enforces the same number, in one place. */
const RATIO = 6.4;
/** Whatever the setting says, a slide holds at least this long and at most this long. */
const MIN_S = 2;
const MAX_S = 30;

export function BannerStrip({ lang, banners, seconds }: { lang: Lang; banners: HomeBanner[]; seconds: number }): React.ReactNode {
  const t = dict(lang);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // Read inside the timer so pausing does not tear the interval down and start it over, which
  // would hand whoever touched the strip a fresh full-length hold on the slide they are reading.
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const n = banners.length;
  const holdMs = Math.min(MAX_S, Math.max(MIN_S, Number(seconds) || 5)) * 1000;

  useEffect(() => {
    if (n < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (pausedRef.current || document.hidden) return;
      setI((x) => (x + 1) % n);
    }, holdMs);
    return () => window.clearInterval(id);
  }, [n, holdMs]);

  if (!n) return null;

  const slide = (b: HomeBanner, idx: number): React.ReactNode => {
    // `imageUrl` returns null for an empty path; a slide with no picture is simply not drawn
    // rather than rendered as a broken-image box.
    const src = imageUrl(b.imageUrlSm ?? b.imageUrl, PUBLIC_API_URL);
    if (!src) return null;
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={b.title}
        width={b.width}
        height={b.height}
        /* The first banner is on the first screen, so it is fetched straight away; the rest wait
           until the strip actually reaches them. */
        loading={idx === 0 ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={idx === 0 ? 'high' : 'auto'}
        className="h-full w-full object-cover"
      />
    );
    return (
      <div key={b.id} className={`absolute inset-0 transition-opacity duration-500 ${idx === i ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={idx === i ? undefined : true}>
        {b.linkUrl ? (
          <Link href={b.linkUrl} className="block h-full w-full" tabIndex={idx === i ? 0 : -1}>
            {img}
          </Link>
        ) : (
          img
        )}
      </div>
    );
  };

  return (
    <div className="fb-container pt-0.5 sm:pt-1 lg:pt-0.5">
      <section
        aria-label={t.home.offersStrip}
        aria-roledescription="carousel"
        className="relative mx-auto w-full max-w-[640px] overflow-hidden rounded-[10px] bg-paper-2 shadow-1 lg:max-w-[400px]"
        /* The reserved box. `aspect-ratio` rather than a fixed height so the strip is 320×50 on a
           small phone and 640×100 on a desktop without a single media query — and so the space is
           held before the picture lands. */
        style={{ aspectRatio: `${RATIO}` }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {banners.map(slide)}

        {n > 1 ? (
          /*
           * Dots, and they are buttons rather than decoration — somebody who wants the banner they
           * just missed can tap back to it, and a keyboard reaches them. They sit inside the strip
           * because the strip is only 50 px tall and a row of dots beneath it would be a third
           * again of its height spent on furniture.
           */
          <div className="absolute inset-x-0 bottom-1 flex justify-center gap-1.5">
            {banners.map((b, idx) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setI(idx)}
                aria-label={t.home.offerN(idx + 1, n)}
                aria-current={idx === i ? 'true' : undefined}
                className={`h-1.5 rounded-full transition-all duration-200 ${idx === i ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`}
                style={{ boxShadow: '0 0 2px rgba(0,0,0,0.45)' }}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
