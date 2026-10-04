import type { ReactNode } from 'react';
import { ART_NAMES, ART_URL, ICON_NAMES, SPRITE_URL } from './icon-sprite';

/**
 * Line icons (Tabler, MIT) from one cached SVG sprite: each icon on the page is a tiny
 * <use> reference, so a grid of 100 products does not repeat the same path data 100 times
 * (in the HTML and again in the React payload). Unknown names fall back to a neutral basket.
 * Adding an icon: put its data in icon-data.ts, then `npm run icons`.
 */
export function Icon({
  name,
  size = 22,
  stroke = 1.75,
  className = '',
  title,
}: {
  name: string;
  size?: number;
  stroke?: number;
  className?: string;
  title?: string;
}): ReactNode {
  const id = ICON_NAMES.has(name) ? name : 'basket';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <use href={`${SPRITE_URL}#${id}`} />
    </svg>
  );
}

/**
 * Coloured category art from the same sprite.
 *
 * Twenty line icons on the rail all looked the same from arm's length — the eye had to read each
 * label to find anything. These are filled and coloured, so "दवाई" is found by its colour before
 * the word is read; that matters most for the customers who read slowly.
 *
 * Drawn on a 64-unit box and carrying their own fills, so unlike `Icon` this one sets neither
 * `stroke` nor `fill` on the wrapper — an inherited stroke would outline every shape. A name with
 * no art falls back to the line icon, so a category the shopkeeper adds later still shows up.
 */
export function ColourArt({
  name,
  fallback = 'basket',
  size = 44,
  fallbackSize = Math.round(size * 0.68),
  fallbackStroke = 1.5,
  className = '',
}: {
  name: string;
  fallback?: string;
  size?: number;
  fallbackSize?: number;
  fallbackStroke?: number;
  className?: string;
}): ReactNode {
  if (!ART_NAMES.has(name)) return <Icon name={fallback} size={fallbackSize} stroke={fallbackStroke} className={className} />;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      {/* The colour art lives in its own sprite; a page that shows none never downloads it. */}
      <use href={`${ART_URL}#${name}`} />
    </svg>
  );
}
