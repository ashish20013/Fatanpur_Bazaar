import type { ReactNode } from 'react';
import { dict, type Lang } from '@/lib/i18n';

/**
 * The thin strip under the header: one picture, one promise, nothing else.
 *
 * It is deliberately short (56 px on a phone, 64 px on a desktop) because the first thing a
 * customer should see is the goods, not a poster. The picture spans the whole strip and the words
 * sit on the left behind a scrim, so the line stays readable over ANY photograph the shopkeeper
 * later uploads (setting `strip_image_url`). Until he does, the scene below is drawn inline — no
 * extra request, nothing to wait for, and the height is fixed so the page never jumps.
 */

/**
 * Fatanpur at delivery time: tiled roofs, a neem, a rider with the shop's bag on the back.
 * Drawn flat and warm rather than detailed — at this size detail turns to mud on a cheap screen,
 * while a clear silhouette still reads as "somebody is bringing this to my door".
 */
function VillageScene(): ReactNode {
  return (
    <svg viewBox="0 0 400 72" aria-hidden="true" focusable="false" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="fb-strip-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbf1da" />
          <stop offset="100%" stopColor="#f4e8cf" />
        </linearGradient>
        <linearGradient id="fb-strip-field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfe0cb" />
          <stop offset="100%" stopColor="#bad2b6" />
        </linearGradient>
      </defs>

      <rect width="400" height="72" fill="url(#fb-strip-sky)" />
      {/* the early sun — the hour vegetables actually arrive */}
      <circle cx="352" cy="18" r="12" fill="#f0d695" opacity="0.7" />

      {/* fields behind the village */}
      <path d="M0 44 Q 110 37 220 43 T 400 41 V72 H0 Z" fill="url(#fb-strip-field)" />

      {/* two huts and a hand pump */}
      <g fill="#bd8e61">
        <rect x="196" y="33" width="26" height="15" rx="1.5" />
        <rect x="232" y="37" width="18" height="11" rx="1.5" />
      </g>
      <g fill="#8d6040">
        <path d="M192 33 L209 23 L226 33 Z" />
        <path d="M228 37 L241 30 L254 37 Z" />
      </g>
      <rect x="205" y="39" width="7" height="9" rx="0.8" fill="#6d472d" />

      {/* neem tree */}
      <rect x="266" y="34" width="3" height="14" fill="#7c583a" />
      <circle cx="267.5" cy="30" r="9" fill="#5d8f5b" />
      <circle cx="261" cy="33" r="5.6" fill="#6b9e67" />
      <circle cx="274" cy="33" r="5.6" fill="#6b9e67" />

      {/* the road into the village */}
      <path d="M0 60 Q 200 53 400 60 V72 H0 Z" fill="#dbd2bf" />
      <path d="M0 60 Q 200 53 400 60" stroke="#c7bca2" strokeWidth="1" fill="none" />

      {/* the rider: scooter, the shop's gold bag, a person leaning into the ride */}
      <g>
        <circle cx="300" cy="59" r="6" fill="#2f3b33" />
        <circle cx="300" cy="59" r="2.3" fill="#9aa79c" />
        <circle cx="325" cy="59" r="6" fill="#2f3b33" />
        <circle cx="325" cy="59" r="2.3" fill="#9aa79c" />
        <path d="M300 59 L308 50 H320 L325 59 Z" fill="#1e8449" />
        <path d="M308 50 L311 41 H315" stroke="#2f3b33" strokeWidth="2" fill="none" strokeLinecap="round" />
        <rect x="314" y="38" width="13" height="12" rx="1.8" fill="#d9b965" stroke="#a8843a" strokeWidth="0.9" />
        <path d="M317.5 38 v-1.8 h6 V38" stroke="#a8843a" strokeWidth="0.9" fill="none" />
        <circle cx="312" cy="32.5" r="3.7" fill="#3c2f26" />
        <path d="M312 36.4 q4.4 1.1 6 6 l-6.6 1.1 q-2.7 -3.3 -3.3 -5.5 Z" fill="#143b25" />
        <path d="M312 37 L307.5 42.5" stroke="#143b25" strokeWidth="2.2" strokeLinecap="round" />
      </g>

      {/* a woman waiting at her door — the person the whole thing is for */}
      <g>
        <circle cx="180" cy="42" r="3.2" fill="#43332a" />
        <path d="M180 45.6 q4 1.4 4.4 8.4 h-8.8 q0.4 -7 4.4 -8.4 Z" fill="#a34b4b" />
      </g>
    </svg>
  );
}

export function VillageStrip({
  lang,
  imageUrl,
  title,
  subtitle,
}: {
  lang: Lang;
  imageUrl?: string | null;
  title?: string | null;
  subtitle?: string | null;
}): ReactNode {
  const t = dict(lang);
  const line = (title ?? '').trim() || t.strip.title;
  // Blank setting = use the default line; a single space = the shopkeeper wants no second line.
  const sub = (subtitle ?? '') === '' ? t.strip.sub : (subtitle ?? '').trim();
  return (
    <aside className="fb-strip" aria-label={line}>
      <span className="fb-strip-art" aria-hidden="true">
        {imageUrl ? (
          // The shop's own photograph once it exists. object-cover + a fixed strip height means a
          // portrait or a landscape shot both sit correctly and nothing shifts while it loads.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" width={1200} height={200} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <VillageScene />
        )}
      </span>
      <div className="fb-container fb-strip-text">
        <p className="fb-strip-title">{line}</p>
        {sub ? <p className="fb-strip-sub">{sub}</p> : null}
      </div>
    </aside>
  );
}
