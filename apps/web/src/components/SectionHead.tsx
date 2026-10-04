import Link from 'next/link';
import type { ReactNode } from 'react';
import { toneFor } from '@/lib/tones';
import { imageUrl } from '@/lib/format';
import { PUBLIC_API_URL } from '@/lib/env';
import { ColourArt, Icon } from './icons';

/** Heading of a category block: medallion + display-serif name + "see all". */
export function SectionHead({ slug, icon, image, title, sub, href, more, as = 'h2' }: { slug: string; icon: string | null; image?: string | null; title: string; sub?: string; href?: string; more?: string; as?: 'h1' | 'h2' }): ReactNode {
  const tone = toneFor(slug);
  const photo = imageUrl(image, PUBLIC_API_URL);
  const H = as;
  return (
    <div className="mb-0.5 flex items-end justify-between gap-2 md:mb-1 lg:mb-1">
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        {/* Whatever the rail shows, this shows — so a customer who scrolls down recognises the
            block by the picture he just tapped rather than having to re-read the heading. Rounded
            square, like the rail card: a shop photograph does not survive a circle. */}
        <span
          className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md ring-1 ring-au-300 sm:h-7 sm:w-7 sm:rounded-lg lg:h-7 lg:w-7"
          style={photo ? undefined : { background: tone.bg, color: tone.fg }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" width={96} height={96} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <ColourArt name={`cat-${slug}`} fallback={icon ?? 'basket'} size={28} className="md:h-8 md:w-8" />
          )}
        </span>
        <div className="min-w-0">
          <H className={`fb-display truncate leading-tight text-ink ${as === 'h1' ? 'text-lg md:text-xl' : 'text-sm sm:text-base lg:text-base'}`}>{title}</H>
          {/* The "अ से ज्ञ · 40" line is orientation, not information a shopper needs on the first
              screen — it costs a row of pixels there and returns from `sm` up. */}
          {sub ? <p className="hidden text-[13px] leading-tight text-ink-3 sm:block md:text-sm">{sub}</p> : null}
        </div>
      </div>
      {href && more ? (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-2 bg-card px-3 py-1 text-[13px] font-semibold text-em-800 no-underline hover:border-em-300 sm:px-3.5 sm:py-1.5 sm:text-sm">
          {more} <Icon name="chevron-right" size={16} />
        </Link>
      ) : null}
    </div>
  );
}

export function Breaker(): ReactNode {
  return (
    <div className="fb-container my-0.5 md:my-1 lg:my-1" aria-hidden="true">
      <div className="fb-divider">
        <svg width="10" height="10" viewBox="0 0 14 14">
          <path d="M7 0 14 7 7 14 0 7z" fill="currentColor" opacity=".8" />
        </svg>
      </div>
    </div>
  );
}
