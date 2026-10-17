import Link from 'next/link';
import type { ReactNode } from 'react';
import { SafeImg } from '../SafeImg';

/** The owner's wordmark (Marcellus, gold on emerald) — an SVG, crisp at any size, cached once. */
export function Logo({ label, height = 38 }: { label: string; height?: number }): ReactNode {
  const width = Math.round((height * 397) / 150);
  return (
    <Link href="/" aria-label={label} className="flex shrink-0 items-center rounded-sm py-0.5">
      <SafeImg src="/brand/wordmark.svg" alt={label} width={width} height={height} decoding="async" fetchPriority="high" className="block h-[26px] w-auto min-[380px]:h-[30px] lg:h-[40px]" fallback={<span className="block h-[26px] min-[380px]:h-[30px] lg:h-[40px] font-semibold text-white">फतनपुर बाज़ार</span>} />
    </Link>
  );
}
