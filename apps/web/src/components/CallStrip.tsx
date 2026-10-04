'use client';

import { useEffect, useState } from 'react';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';

const DISMISSED = 'fb_callstrip';

/**
 * A small, brand-neutral "play" triangle for the app button — a widely understood store glyph,
 * drawn inline so it costs nothing to load and inherits the button's colour.
 */
function PlayGlyph(): React.ReactNode {
  return (
    <svg width="13" height="14" viewBox="0 0 20 22" aria-hidden="true" focusable="false" className="shrink-0">
      <path d="M2 1.2 16.5 11 2 20.8 Z" fill="currentColor" />
    </svg>
  );
}

/**
 * One thin line pinned to the bottom of every screen: call to order, get the app, or close it.
 *
 * It lives here rather than in the footer because the person it exists for — someone stuck part
 * way through an order — does not scroll to the end of a shop looking for a phone number, he
 * closes the tab. So it sits above the fold at all times, one tap from a phone call.
 *
 * Deliberately thin: 40 px plus the phone's home-indicator inset. Every pixel it takes is a pixel
 * of goods it hides, so the text is a single line that truncates rather than wrapping.
 *
 * It stays on EVERY screen until the person closes it with the ✕ (the dismissal lasts the
 * session). It does NOT yield to the bag bar — instead it publishes its height as `--fb-strip-h`
 * and the bag bar lifts itself by exactly that much, so the two bars stack without ever
 * overlapping, and the bag bar drops back to the floor the moment the strip is closed.
 */
export function CallStrip({
  lang,
  supportPhone,
  playStoreUrl,
}: {
  lang: Lang;
  supportPhone: string;
  playStoreUrl: string;
}): React.ReactNode {
  const t = dict(lang);
  const [hidden, setHidden] = useState(true);
  const [soon, setSoon] = useState(false);

  useEffect(() => {
    // Starts hidden and is revealed on the client, so a dismissal never flashes back on load.
    try {
      setHidden(sessionStorage.getItem(DISMISSED) === '1');
    } catch {
      setHidden(false); // storage blocked (private mode) — showing it is the safer failure
    }
  }, []);

  const visible = Boolean(supportPhone) && !hidden;

  // Publish the strip's height so the bag bar can sit exactly on top of it (0 when the strip is
  // gone, so the bag bar falls back to the floor). Runs even on the render that returns null.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--fb-strip-h', visible ? '40px' : '0px');
    return () => {
      root.style.setProperty('--fb-strip-h', '0px');
    };
  }, [visible]);

  if (!visible) return null;

  function dismiss(): void {
    setHidden(true);
    try {
      sessionStorage.setItem(DISMISSED, '1');
    } catch {
      /* nothing to remember it with — it will come back next page, which is acceptable */
    }
  }

  // The owner wants the app button on every screen even before the app is published; until he
  // pastes the real Play Store link into the admin panel, tapping it just says "coming soon"
  // rather than dropping the person onto a store page that does not exist yet.
  const app = playStoreUrl.startsWith('https://') ? playStoreUrl : null;

  function showSoon(): void {
    setSoon(true);
    window.setTimeout(() => setSoon(false), 2000);
  }

  const appClass = 'flex h-7 shrink-0 items-center gap-1 rounded-full bg-au-400 px-2.5 text-[12px] font-bold text-em-900 no-underline';

  return (
    <aside aria-label={t.foot.callToOrder} className="fixed inset-x-0 bottom-0 z-30 border-t border-[#2b3831] bg-night/95 backdrop-blur-sm">
      <div className="fb-container flex h-10 items-center gap-2 pb-[env(safe-area-inset-bottom)]">
        <a href={`tel:+91${supportPhone}`} className="flex min-w-0 flex-1 items-center gap-1.5 text-[#e9e4d6] no-underline">
          <Icon name="phone" size={14} className="shrink-0 text-au-400" />
          {/* ⚠️ Not `leading-none`. Devanagari hangs matras above and below the line, and at a
              line-height of 1 the strip cropped them — "कॉल करके" came out as "काल करक". */}
          <span className="truncate text-[12.5px] leading-[1.45]">
            {t.foot.callToOrderShort} <span className="font-semibold tabular-nums text-au-300">{supportPhone}</span>
          </span>
        </a>
        {app ? (
          <a href={app} target="_blank" rel="noopener noreferrer" className={appClass}>
            <PlayGlyph /> {t.foot.getApp}
          </a>
        ) : (
          <button type="button" onClick={showSoon} className={appClass} aria-label={t.foot.getApp}>
            <PlayGlyph /> {soon ? t.foot.appSoon : t.foot.getApp}
          </button>
        )}
        <button type="button" onClick={dismiss} aria-label={t.common.close} className="grid h-7 w-6 shrink-0 place-items-center text-[#8d8879] hover:text-[#e9e4d6]">
          <Icon name="x" size={14} />
        </button>
      </div>
    </aside>
  );
}
