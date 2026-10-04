import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PageMeta, ProductCard } from '@fb/shared-types';
import { dict, type Lang } from '@/lib/i18n';
import { ProductGrid } from './product';
import { EmptyState, buttonClass } from './ui';

/** Sort chips — server-rendered links (koi client JS nahi). */
const SORTS: { key: string; hi: string; en: string }[] = [
  { key: 'popular', hi: 'लोकप्रिय', en: 'Popular' },
  { key: 'price_asc', hi: 'सस्ता पहले', en: 'Low price first' },
  { key: 'price_desc', hi: 'महँगा पहले', en: 'High price first' },
  { key: 'new', hi: 'नया', en: 'New' },
];

export function SortChips({ lang, basePath, active }: { lang: Lang; basePath: string; active?: string }): ReactNode {
  return (
    <ul className="fb-scroll-x flex gap-2 py-1">
      {SORTS.map((s) => (
        <li key={s.key} className="shrink-0">
          <Link
            href={`${basePath}?sort=${s.key}`}
            className={`inline-flex h-9 items-center rounded-full border px-3 text-base no-underline ${
              active === s.key ? 'border-g-700 bg-g-700 font-semibold text-white' : 'border-line bg-white text-ink-2'
            }`}
          >
            {lang === 'hi' ? s.hi : s.en}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Pagination({ lang, basePath, meta, query = '' }: { lang: Lang; basePath: string; meta: PageMeta; query?: string }): ReactNode {
  const t = dict(lang);
  const last = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.perPage)));
  if (last <= 1) return null;
  const link = (p: number): string => `${basePath}?${query ? `${query}&` : ''}page=${p}`;
  return (
    <nav aria-label={t.common.page} className="flex items-center justify-center gap-3 py-4">
      {meta.page > 1 ? (
        <Link href={link(meta.page - 1)} className={buttonClass('secondary', 'sm')} rel="prev">
          ← {t.common.back}
        </Link>
      ) : null}
      <span className="text-base text-ink-2">
        {meta.page} / {last}
      </span>
      {meta.hasMore ? (
        <Link href={link(meta.page + 1)} className={buttonClass('secondary', 'sm')} rel="next">
          {t.common.next} →
        </Link>
      ) : null}
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: { name: string; path: string }[] }): ReactNode {
  return (
    <nav aria-label="breadcrumb" className="mb-2 text-sm text-ink-3">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={it.path} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden="true">›</span> : null}
            {i === items.length - 1 ? <span className="text-ink-2">{it.name}</span> : <Link href={it.path}>{it.name}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** List page ka common body: heading + sort + grid + pagination + empty state. */
export function ListBody({
  lang,
  title,
  intro,
  items,
  meta,
  basePath,
  sort,
  cartMap,
}: {
  lang: Lang;
  title: string;
  intro?: string | null;
  items: ProductCard[];
  meta: PageMeta;
  basePath: string;
  sort?: string;
  cartMap?: Map<number, { itemId: number; quantity: number }>;
}): ReactNode {
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="fb-display text-3xl leading-tight">{title}</h1>
      <SortChips lang={lang} basePath={basePath} active={sort} />
      {items.length ? (
        <>
          <ProductGrid items={items} lang={lang} cartMap={cartMap} />
          <Pagination lang={lang} basePath={basePath} meta={meta} query={sort ? `sort=${sort}` : ''} />
        </>
      ) : (
        <EmptyState
          icon="basket"
          title={t.search.zero}
          body={t.cart.empty}
          action={
            <Link href="/" className={buttonClass('primary', 'sm')}>
              {t.nav.home}
            </Link>
          }
        />
      )}
      {intro ? <section className="fb-prose fb-card p-4 text-base text-ink-2" dangerouslySetInnerHTML={{ __html: intro }} /> : null}
    </div>
  );
}
