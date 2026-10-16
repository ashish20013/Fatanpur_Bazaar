'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react';

/**
 * Drop-in replacement for <img> that survives the React hydration race.
 *
 * Problem: when the browser paints an SSR page it starts fetching images immediately. If a fetch
 * fails (404, network hiccup, slow 3G timeout) the native `error` event fires on the DOM node
 * BEFORE React hydrates it. React's synthetic `onError` is never called, and the browser's
 * broken-image icon stays on screen — no fallback tile, no placeholder, just a jagged rectangle
 * that screams "this shop is broken".
 *
 * Solution: after React mounts, we check whether the image has already settled into a failed
 * state (`complete === true && naturalWidth === 0`), and we also attach a native DOM listener
 * as a belt-and-suspenders backup. Either path flips `failed` and renders the `fallback` instead.
 *
 * On slow connections (2G/3G), images that have not even started loading yet will eventually
 * either succeed (great — they show up) or fail (the native listener catches it). The check at
 * mount handles the gap between SSR paint and hydration; the listener handles everything after.
 */
export function SafeImg({
  fallback,
  onFail,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  /** Rendered in place of the broken image. */
  fallback?: ReactNode;
  /** Optional callback when the image fails. */
  onFail?: () => void;
}): ReactNode {
  const ref = useRef<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const img = ref.current;
    if (!img) return;

    // 1. Check if the image already failed before React hydrated.
    //    `complete` is true when loading finished (success or error).
    //    `naturalWidth === 0` means no valid image data was decoded.
    //    Together they mean: the browser tried and gave up.
    if (img.complete && img.naturalWidth === 0) {
      setFailed(true);
      onFail?.();
      return;
    }

    // 2. Attach a native DOM listener for failures that happen after mount.
    //    This fires even if React's synthetic event system missed the boat.
    const handleError = (): void => {
      setFailed(true);
      onFail?.();
    };
    img.addEventListener('error', handleError);
    return () => img.removeEventListener('error', handleError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return fallback ?? null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={ref}
      onError={() => {
        setFailed(true);
        onFail?.();
      }}
    />
  );
}
