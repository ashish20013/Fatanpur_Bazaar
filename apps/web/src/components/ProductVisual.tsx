import type { ReactNode } from 'react';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl } from '@/lib/format';
import { tileLook } from '@/lib/tones';
import { ColourArt } from './icons';
import { SafeImg } from './SafeImg';

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

  // Build the fallback tile FIRST so it can be passed to SafeImg as the fallback.
  // Seeded with the product's own English name so the same item always looks the same.
  const tone = tileLook(family, name);
  const short = (nameHi ?? name).replace(/\s*\(.*\)\s*$/, '');
  const en = name.replace(/\s*\(.*\)\s*$/, '');
  const artSize = { xs: 28, sm: 38, md: 60, lg: 150 }[size];
  const iconSize = { xs: 20, sm: 26, md: 32, lg: 108 }[size];
  const tile = (
    <div
      className="fb-tile aspect-square h-full w-full"
      style={{ '--tile-bg': tone.bg, '--tile-fg': tone.fg, backgroundImage: tone.gradient } as React.CSSProperties}
      role="img"
      aria-label={title}
    >
      <div className="fb-tile-in">
        <ColourArt
          name={`art-${icon ?? ''}`}
          fallback={icon ?? 'basket'}
          size={artSize}
          fallbackSize={iconSize}
          fallbackStroke={size === 'lg' ? 1.25 : 1.4}
          className={size === 'md' ? 'fb-art-md' : ''}
        />
        {size === 'lg' ? (
          <>
            <span className="fb-tile-name fb-tile-name-lg">{short}</span>
            <span className="fb-tile-en fb-tile-en-lg">{en}</span>
          </>
        ) : null}
      </div>
    </div>
  );

  if (src) {
    return (
      <SafeImg
        src={src}
        alt={title}
        width={width}
        height={width}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        className="aspect-square h-full w-full bg-paper-2 object-cover"
        fallback={tile}
      />
    );
  }

  return tile;
}
