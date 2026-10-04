import type { ReactNode } from 'react';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl } from '@/lib/format';
import { tileLook } from '@/lib/tones';
import { ColourArt } from './icons';

/**
 * A product's picture. Real photo when the owner has uploaded one; otherwise a designed label tile
 * (category colour + a coloured drawing + the Hindi name) — honest, crisp, and a few bytes over 3G,
 * because every drawing is one <use> into the shared sprite. We never fake a photo: the drawing is
 * plainly a drawing, carries no brand or packaging, and disappears the moment a real photo is
 * uploaded for that product.
 */
export function ProductVisual({
  name,
  nameHi,
  image,
  icon,
  family,
  lang,
  size = 'md',
  priority = false,
  width = 300,
}: {
  name: string;
  nameHi: string | null;
  image: string | null;
  icon: string | null | undefined;
  family: string | null | undefined;
  lang: 'hi' | 'en';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  priority?: boolean;
  width?: number;
}): ReactNode {
  const src = imageUrl(image, PUBLIC_API_URL);
  const title = lang === 'hi' ? (nameHi ?? name) : name;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={title}
        width={width}
        height={width}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        className="aspect-square h-full w-full bg-paper-2 object-cover"
      />
    );
  }
  // Seeded with the product's own English name so the same item always looks the same.
  const tone = tileLook(family, name);
  const short = (nameHi ?? name).replace(/\s*\(.*\)\s*$/, '');
  const en = name.replace(/\s*\(.*\)\s*$/, '');
  // The big tile on a product page used to float a small mark in a lot of empty space, which
  // reads as a missing photo rather than a designed label. A larger glyph fills it deliberately.
  // Colour art is a solid shape, so it carries at a size a thin outline could not; the line glyph
  // fallback stays a little smaller, where its stroke weight still reads.
  // md must survive a 115 px tile on a phone; it grows again from `sm` up via the class below.
  // Bigger now that nothing shares the tile with it — a small mark floating in a coloured square
  // reads as a missing photo; a large one reads as a label somebody designed.
  const artSize = { xs: 28, sm: 38, md: 60, lg: 150 }[size];
  const iconSize = { xs: 20, sm: 26, md: 32, lg: 108 }[size];
  return (
    <div
      className="fb-tile aspect-square h-full w-full"
      style={{ '--tile-bg': tone.bg, '--tile-fg': tone.fg, backgroundImage: tone.gradient } as React.CSSProperties}
      role="img"
      aria-label={title}
    >
      <div className="fb-tile-in">
        {/* On a wide screen the grid tile is roughly twice as tall, so the drawing grows with it
            rather than floating in the middle of an empty square. */}
        <ColourArt
          name={`art-${icon ?? ''}`}
          fallback={icon ?? 'basket'}
          size={artSize}
          fallbackSize={iconSize}
          fallbackStroke={size === 'lg' ? 1.25 : 1.4}
          className={size === 'md' ? 'fb-art-md' : ''}
        />
        {/*
         * The name is NOT printed inside a grid tile any more, at any width.
         *
         * It used to appear twice on a phone and three times on a desktop — Hindi in the tile,
         * romanised under it, and the real name in bold in the card body immediately below. On a
         * home page of a hundred-odd tiles those extra copies were kilobytes of markup that every
         * 3G phone paid for, to say the same word again half an inch higher up. The big tile on a
         * product page keeps its label: there the picture IS the page, and it would otherwise be
         * a coloured square with a small drawing floating in it.
         */}
        {size === 'lg' ? (
          <>
            <span className="fb-tile-name fb-tile-name-lg">{short}</span>
            <span className="fb-tile-en fb-tile-en-lg">{en}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
