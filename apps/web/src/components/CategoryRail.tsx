'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { RootCategory } from '@fb/shared-types';
import { dict, type Lang } from '@/lib/i18n';
import { toneFor } from '@/lib/tones';
import { imageUrl } from '@/lib/format';
import { PUBLIC_API_URL } from '@/lib/env';
import { ColourArt, Icon } from './icons';
import { Sheet } from './Sheet';

/** Pixels per second the rail travels on its own. One medallion crosses a phone in ~8 s. */
const DRIFT_PX_PER_S = 11;

/**
 * The category rail under the header: round medallions (picture + name) that drift slowly
 * right → left (owner's brief), and that you can also slide yourself at any moment.
 *
 * The drift moves the row's real scroll position rather than sliding it with a CSS transform.
 * That matters: a transform has to sit inside an `overflow: hidden` box, which is exactly a box a
 * finger cannot swipe — the rail would look draggable and refuse to be dragged. Driving scrollLeft
 * keeps the row natively scrollable the whole time, so the very first swipe works, on a cheap
 * phone as on a mouse.
 *
 *  • the list is rendered twice while drifting; on passing the halfway mark we subtract half the
 *    width, which lands on identical content, so it loops without a visible jump;
 *  • a finger or mouse resting on it pauses it, so a tap lands on what you aimed at;
 *  • swiping, wheel-scrolling or keyboard use stops it for good — once someone steers, the rail
 *    stops steering itself;
 *  • with "reduce motion", with fewer than five categories, on a category page, or with no JS at
 *    all, it never drifts and is simply a scrollable row.
 */
export function CategoryRail({ lang, roots, active: activeProp, supportPhone }: { lang: Lang; roots: RootCategory[]; active?: string | null; supportPhone: string }): React.ReactNode {
  const t = dict(lang);
  const path = usePathname();
  const seg = path.split('/')[1] ?? '';
  const active = activeProp ?? (roots.some((r) => r.slug === seg) ? seg : null);
  const [drift, setDrift] = useState(false);
  const [paused, setPaused] = useState(false);
  const [soon, setSoon] = useState<RootCategory | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Read inside the animation frame so pausing does not tear down and restart the loop.
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || roots.length < 5 || active) return;
    setDrift(true);
  }, [roots.length, active]);

  useEffect(() => {
    const el = box.current;
    if (!drift || !el) return;
    let frame = 0;
    let last = 0;
    // scrollLeft is rounded by some browsers; keeping our own sub-pixel position stops a slow
    // drift from rounding to zero every frame and standing still.
    let pos = el.scrollLeft;
    const step = (now: number): void => {
      if (last === 0) last = now;
      // A backgrounded tab hands back one huge delta; cap it or the rail jumps on return.
      const dt = Math.min(100, now - last);
      last = now;
      if (!pausedRef.current && !document.hidden) {
        const half = el.scrollWidth / 2;
        pos += (DRIFT_PX_PER_S * dt) / 1000;
        if (half > 0 && pos >= half) pos -= half;
        el.scrollLeft = pos;
      } else {
        pos = el.scrollLeft;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [drift]);

  // A visible active category should be in view on category pages.
  useEffect(() => {
    if (!active || !box.current) return;
    box.current.querySelector<HTMLElement>(`[data-slug="${CSS.escape(active)}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [active]);

  /*
   * Hand the rail over to the person. The second copy of the list is about to be unmounted, so if
   * they were looking at it the row would shorten under them and the browser would clamp the
   * scroll position — the rail would visibly jump backwards at the exact moment they touched it.
   * Both halves show the same categories, so stepping back one half first keeps the same
   * medallions under the finger.
   */
  const stop = (): void => {
    const el = box.current;
    const half = el ? el.scrollWidth / 2 : 0;
    if (el && half > 0 && el.scrollLeft >= half) el.scrollLeft -= half;
    setDrift(false);
  };
  const name = (c: RootCategory): string => (lang === 'hi' ? (c.nameHi ?? c.name) : c.name);

  const item = (c: RootCategory, dup: boolean): React.ReactNode => {
    const tone = toneFor(c.slug);
    const isActive = active === c.slug;
    const photo = imageUrl(c.image, PUBLIC_API_URL);
    /*
     * A shop front, not a symbol.
     *
     * A 70 px circle can hold a drawing of a basket; it cannot hold a shop. Cropping a photograph
     * of a kirana store into a circle that size throws away the very thing that makes someone tap
     * it — the stacked sacks, the shelves, the awning that says "this is a shop you walk into".
     * So the medallion became a card: a square picture at a size where the shop is legible, with
     * the name under it. Categories the shopkeeper has not photographed yet keep their drawing,
     * centred on a tinted card of exactly the same size, so a half-finished rail still lines up.
     *
     * 68 px on a phone: five shops fit across a 390 px screen and the shelves inside each one are
     * still legible. It was 84 px until the advertising strip moved in above the goods — between
     * them, the rail and the strip were pushing the second row of products off the first screen,
     * and the owner's rule is that the first screen carries three columns and two full rows. A
     * medallion is a signpost; a product is the thing being sold. The signpost gave up the pixels.
     */
    const medal = (
      <>
        <span
          className={`relative block h-[56px] w-[56px] overflow-hidden rounded-xl transition-transform duration-150 group-hover:-translate-y-0.5 sm:h-[64px] sm:w-[64px] lg:h-[50px] lg:w-[50px] ${isActive ? 'ring-2 ring-au-500 ring-offset-2 ring-offset-paper' : 'ring-1 ring-au-300/70'} ${c.upcoming ? 'opacity-60 grayscale-[35%]' : ''}`}
          style={photo ? undefined : { background: `radial-gradient(circle at 30% 25%, #fffdf8 0%, ${tone.bg} 62%)`, color: tone.fg }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" width={320} height={320} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center">
              <ColourArt name={`cat-${c.slug}`} fallback={c.icon ?? 'basket'} size={36} className="sm:h-[40px] sm:w-[40px] lg:h-[30px] lg:w-[30px]" />
            </span>
          )}
          {c.upcoming ? (
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-au-500 px-1.5 text-[10px] font-semibold leading-4 text-em-900">{t.rail.upcoming}</span>
          ) : null}
        </span>
        <span className={`line-clamp-1 w-[56px] text-center text-[10px] leading-tight sm:w-[64px] sm:text-[11px] lg:w-[50px] lg:text-[10px] ${isActive ? 'font-semibold text-em-800' : 'text-ink-2'}`}>{name(c)}</span>
      </>
    );
    const cls = 'group flex shrink-0 flex-col items-center gap-0.5 px-1 py-0.5 no-underline sm:gap-0.5 sm:px-1 lg:gap-0 lg:px-0.5';
    return (
      <li key={`${c.id}${dup ? '-d' : ''}`} data-slug={dup ? undefined : c.slug} aria-hidden={dup || undefined}>
        {c.upcoming ? (
          <button type="button" tabIndex={dup ? -1 : 0} onClick={() => setSoon(c)} className={cls}>
            {medal}
          </button>
        ) : (
          <Link href={`/${c.slug}`} tabIndex={dup ? -1 : 0} className={cls} aria-current={isActive ? 'page' : undefined}>
            {medal}
          </Link>
        )}
      </li>
    );
  };

  // Checkout / cart / login are a funnel — no distractions there.
  if (!roots.length || /^\/(checkout|cart|login)(\/|$)/.test(path)) return null;
  return (
    <nav aria-label={t.rail.title} className="border-b border-line bg-paper-2/70">
      <div
        ref={box}
        className="fb-container fb-rail fb-scroll-x py-0.5 md:py-1 lg:py-0.5"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={stop}
        onPointerLeave={() => setPaused(false)}
        onTouchMove={stop}
        onWheel={stop}
        onKeyUp={stop}
        style={drift ? { maskImage: 'linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)' } : undefined}
      >
        <ul className="flex w-max gap-0.5 sm:gap-1 lg:gap-0.5">
          {roots.map((c) => item(c, false))}
          {/* Second copy so the loop lands on identical content instead of snapping back. */}
          {drift ? roots.map((c) => item(c, true)) : null}
        </ul>
      </div>
      <Sheet open={!!soon} onClose={() => setSoon(null)} title={soon ? t.rail.upcomingTitle(name(soon)) : ''} closeLabel={t.common.close}>
        <div className="space-y-4 px-5 py-5">
          <p className="text-body text-ink-2">{t.rail.upcomingBody}</p>
          {supportPhone ? (
            <a href={`tel:+91${supportPhone}`} className="flex h-12 items-center justify-center gap-2 rounded bg-em-700 text-body font-semibold text-white no-underline">
              <Icon name="phone" size={18} /> +91 {supportPhone}
            </a>
          ) : null}
        </div>
      </Sheet>
    </nav>
  );
}
