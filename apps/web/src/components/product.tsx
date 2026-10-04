import Link from 'next/link';
import type { ProductCard as Card } from '@fb/shared-types';
import { rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { BookLink, BuyButton } from './cart-buttons';
import { ProductVisual } from './ProductVisual';
import { Skeleton } from './ui';

type CartMap = Map<number, { itemId: number; quantity: number }>;

/**
 * Product card: picture (or label tile), name, unit, price with MRP, and one big "खरीदें".
 * ⚠️ Fixed aspect-ratio box + width/height on images → zero layout shift.
 */
export function ProductTile({ p, lang, priority = false, inCart }: { p: Card; lang: Lang; priority?: boolean; inCart?: { itemId: number; quantity: number } }): React.ReactNode {
  const t = dict(lang);
  const isService = p.itemType === 'SERVICE';
  const href = isService ? `/service/${p.slug}` : `/product/${p.slug}`;
  const title = lang === 'hi' ? (p.nameHi ?? p.name) : p.name;
  const sub = lang === 'hi' ? p.name.replace(/\s*\(.*\)\s*$/, '') : (p.nameHi ?? '');
  const quote = isService && Number(p.price) === 0;
  return (
    <article className="fb-pcard group relative">
      {/*
       * Just the picture. The discount ribbon that used to sit in this corner is gone on the
       * owner's instruction — the shop shows one honest price rather than a saving.
       */}
      <Link href={href} className="relative block overflow-hidden" tabIndex={-1} aria-hidden="true">
        <div className="aspect-[4/3] w-full lg:aspect-[5/3]">
          <ProductVisual name={p.name} nameHi={p.nameHi} image={p.image?.urlSm ?? p.image?.url ?? null} icon={p.icon} family={p.family} lang={lang} priority={priority} />
        </div>
      </Link>
      <div className="fb-pcard-body">
        {/*
         * Name and price share one row, price hard right.
         *
         * They used to be three stacked rows — name, unit, price — and the owner counted the
         * pixels correctly: the text below the picture was taking more of the card than the goods
         * were. The name wraps to two lines inside its own column while the price stays pinned to
         * the top right, so a long Hindi name never pushes the number out of line, and the number
         * is always in the same place for a customer scanning a shelf of them.
         *
         * `items-baseline` rather than `items-start`: the price and the first line of the name sit
         * on the same baseline, which is what makes the row read as one line instead of two things
         * that happen to be side by side.
         */}
        <div className="flex items-baseline gap-1.5">
          <Link href={href} className="fb-pcard-name min-w-0 flex-1">
            {title}
          </Link>
          {quote ? (
            <span className="shrink-0 text-[12px] font-semibold text-au-800 lg:text-[11px]">{t.buy.rateOnCall}</span>
          ) : (
            <span className="fb-price shrink-0 text-[14px] text-ink sm:text-[15px] lg:text-[14px]">{rupees(p.price)}</span>
          )}
        </div>
        {/* Unit and supplier share the next line for the same reason — two facts, one row. */}
        <p className="flex items-baseline gap-1 text-[11px] text-ink-3 sm:text-[13px] lg:text-[11px]">
          <span className="shrink-0">{isService ? sub || t.home.services : p.unit}</span>
          {p.supplierName ? <span className="hidden min-w-0 flex-1 truncate text-right text-xs sm:block">{p.supplierName}</span> : null}
        </p>
        {p.prescriptionRequired ? <span className="fb-rx mt-1 w-fit">{t.product.rxRequired}</span> : null}
        {/*
         * The word "खरीदें", on every screen — the owner's instruction, and he is right about his
         * customers: a bare "+" is a convention you learn from other apps, and plenty of people
         * here are placing their first online order ever. The button is shorter on a phone so the
         * card still stays inside two rows on a 390 px screen, but it is the same button, and it
         * is rendered ONCE per card (a compact copy for phones and a hidden wide copy cost twice
         * the markup and twice the hydration data for a control nobody could see).
         */}
        <div className="mt-auto pt-0.5 sm:pt-1 lg:pt-0.5">
          {isService ? (
            <BookLink lang={lang} href={href} />
          ) : (
            <BuyButton
              lang={lang}
              tight
              disabled={!p.inStock}
              inCart={inCart}
              product={{ id: p.id, name: p.name, nameHi: p.nameHi, unit: p.unit, price: p.price, mrp: p.mrp, image: p.image?.urlSm ?? null, icon: p.icon, family: p.family }}
            />
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Listing grid (category / search pages): 3 across on the smallest phone, 4 on a small tablet,
 * 5 on a desktop, 6 on a wide monitor. The owner's rule, in his own numbers: a phone shows about
 * two-and-a-half rows in the first screen (three columns of compact cards), a desktop shows about
 * four rows of five — which is exactly what a 24-item page lays out at these column counts, so the
 * screen is always full of goods and never a narrow shop with empty space beside it. The desktop
 * five-column step is the fixed one; the phone never drops below three.
 */
export function ProductGrid({ items, lang, cartMap }: { items: Card[]; lang: Lang; cartMap?: CartMap }): React.ReactNode {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5 lg:gap-2.5 2xl:grid-cols-6">
      {items.map((p, i) => (
        <ProductTile key={p.id} p={p} lang={lang} priority={i < 2} inCart={cartMap?.get(p.id)} />
      ))}
    </div>
  );
}

/**
 * Home rows.
 *
 * These used to swipe sideways on a phone, with the next card peeking in to say "there is more".
 * The peek costs a third of a column, so two and a bit products filled the screen and the owner
 * was right that too little showed at once. A three-up grid puts the same products in the same
 * space, in the direction people already scroll, and the section's own "see all" carries the
 * "there is more" that the peek used to.
 */
/**
 * A single shelf row — one category's items in one line (used for "related products" on a product
 * page, where one row is all that is wanted). The home uses ProductGridHome instead.
 */
export function ProductRow({ items, lang, cartMap, eager = false }: { items: Card[]; lang: Lang; cartMap?: CartMap; eager?: boolean }): React.ReactNode {
  const row = items.slice(0, 6);
  return (
    <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6 lg:gap-2.5">
      {row.map((p, i) => (
        <li key={p.id} className="fb-row-item">
          <ProductTile p={p} lang={lang} priority={eager && i < 3} inCart={cartMap?.get(p.id)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Home shelf row — ONE ROW per category. Each category block shows exactly one line of products:
 * 3 on the smallest phone, 4 from sm, 5 from lg, 6 from xl. The second row on the page belongs
 * to the NEXT category, not more items from this one — so a customer landing on the home sees
 * three different categories at once on a phone and four-to-five on a desktop without scrolling.
 * "सब देखें" opens the full category page for anyone who wants more.
 */
export const HOME_MAX = 6;
/* One row per breakpoint — items beyond the column count at that width are hidden. */
const HOME_VIS: string[] = [
  '',                /* 0–2: always visible (3 cols on mobile = 1 row) */
  '',
  '',
  'hidden sm:block', /* 3: appears from sm (grid-cols-4 → 1 row of 4) */
  'hidden lg:block', /* 4: appears from lg (grid-cols-5 → 1 row of 5) */
  'hidden xl:block', /* 5: appears from xl (grid-cols-6 → 1 row of 6) */
];

export function ProductGridHome({ items, lang, cartMap, eager = false }: { items: Card[]; lang: Lang; cartMap?: CartMap; eager?: boolean }): React.ReactNode {
  const row = items.slice(0, HOME_MAX);
  return (
    <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5 lg:gap-2.5 xl:grid-cols-6">
      {row.map((p, i) => (
        <li key={p.id} className={`fb-row-item ${HOME_VIS[i] ?? 'hidden'}`}>
          <ProductTile p={p} lang={lang} priority={eager && i < 3} inCart={cartMap?.get(p.id)} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ n = 3 }: { n?: number }): React.ReactNode {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-5 lg:gap-2.5 xl:grid-cols-6">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-[14px] border border-line bg-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none lg:aspect-[5/3]" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
