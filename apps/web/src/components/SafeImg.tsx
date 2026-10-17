'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react';

/**
 * Drop-in replacement for <img> that survives the React hydration race AND shows a loading
 * shimmer while the image downloads — Blinkit-style: no broken icons, no blank boxes, just
 * a smooth pulse that says "aa rahi hai".
 *
 * Three-layer defence:
 *  1. LOADING state: a CSS shimmer pulse until the image fires `onLoad` or `complete`.
 *  2. POST-HYDRATION check: `complete === true && naturalWidth === 0` catches images that
 *     failed before React hydrated.
 *  3. NATIVE DOM listener: catches errors that fire after mount, even if React's synthetic
 *     `onError` misses them.
 *
 * On failure, the `fallback` prop renders in place of the broken image — no broken-image icon
 * ever shows on screen.
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
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = ref.current;
    if (!img) return;

    // Already loaded successfully before hydration — skip shimmer.
    if (img.complete && img.naturalWidth > 0) {
      setLoaded(true);
      return;
    }

    // Failed before React hydrated.
    if (img.complete && img.naturalWidth === 0) {
      setFailed(true);
      onFail?.();
      return;
    }

    // Native DOM listeners for post-mount events.
    const handleError = (): void => {
      setFailed(true);
      onFail?.();
    };
    const handleLoad = (): void => {
      setLoaded(true);
    };
    img.addEventListener('error', handleError);
    img.addEventListener('load', handleLoad);
    return () => {
      img.removeEventListener('error', handleError);
      img.removeEventListener('load', handleLoad);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return fallback ?? null;
  }

  return (
    <span className="relative inline-flex h-full w-full">
      {/* Shimmer pulse — visible until image loads. Disappears the instant pixels arrive. */}
      {!loaded ? (
        <span
          className="absolute inset-0 animate-pulse rounded bg-paper-2"
          aria-hidden="true"
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...props}
        ref={ref}
        className={`${props.className ?? ''} ${loaded ? '' : 'opacity-0'}`}
        style={{ ...props.style, transition: 'opacity 200ms ease-out' }}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          onFail?.();
        }}
      />
    </span>
  );
}
