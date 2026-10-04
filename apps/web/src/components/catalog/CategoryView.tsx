import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PageMeta, ProductCard } from '@fb/shared-types';
import { Breadcrumbs, Pagination } from '@/components/list';
import { JsonLd } from '@/components/JsonLd';
import { ProductGrid } from '@/components/product';
import { SectionHead } from '@/components/SectionHead';
import { EmptyState, buttonClass } from '@/components/ui';
import { Icon } from '@/components/icons';
import { dict, type Lang } from '@/lib/i18n';
import { breadcrumbLd, itemListLd } from '@/lib/seo';

export interface CategoryPayload {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  vertical: string;
  image: string | null;
  icon: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  introHtml: string | null;
  parent: { name: string; nameHi: string | null; slug: string } | null;
  children: { id: number; name: string; nameHi: string | null; slug: string; icon: string | null }[];
}

export const SORT_KEYS = ['az', 'price_asc', 'price_desc', 'popular'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
const SORT_LABEL: Record<SortKey, { hi: string; en: string }> = {
  az: { hi: 'अ से ज्ञ', en: 'A to Z' },
  price_asc: { hi: 'सस्ता पहले', en: 'Price: low first' },
  price_desc: { hi: 'महँगा पहले', en: 'Price: high first' },
  popular: { hi: 'लोकप्रिय', en: 'Popular' },
};

/**
 * One category page (root or sub-category): the rail above stays, the items of the chosen category
 * render below — A→Z by default, sub-category chips to narrow, plain links (works without JS).
 */
export function CategoryView({
  lang,
  c,
  items,
  meta,
  sort,
  cartMap,
  rootSlug,
}: {
  lang: Lang;
  c: CategoryPayload;
  items: ProductCard[];
  meta: PageMeta;
  sort: SortKey;
  cartMap: Map<number, { itemId: number; quantity: number }>;
  rootSlug: string;
}): ReactNode {
  const t = dict(lang);
  const nm = (x: { name: string; nameHi: string | null }): string => (lang === 'hi' ? (x.nameHi ?? x.name) : x.name);
  const crumbs = [
    { name: t.nav.home, path: '/' },
    ...(c.parent ? [{ name: nm(c.parent), path: `/${c.parent.slug}` }] : []),
    { name: nm(c), path: `/${c.slug}` },
  ];
  const chipBase = 'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-base no-underline transition-colors duration-150';
  const on = `${chipBase} border-em-700 bg-em-700 font-semibold text-white`;
  const off = `${chipBase} border-line-2 bg-card text-ink-2 hover:border-em-300`;
  const siblings = c.parent ? null : c.children;
  const q = (s: SortKey): string => (s === 'az' ? '' : `?sort=${s}`);

  return (
    <div className="fb-container pt-4">
      <Breadcrumbs items={crumbs} />
      <SectionHead as="h1" slug={rootSlug} icon={c.icon} image={c.image} title={nm(c)} sub={`${SORT_LABEL[sort][lang]} · ${meta.total}`} />

      {siblings && siblings.length ? (
        <nav aria-label={t.nav.categories} className="fb-scroll-x -mx-[14px] mb-3 px-[14px]">
          <ul className="flex gap-2">
            <li>
              <span className={on}>{t.rail.all}</span>
            </li>
            {siblings.map((k) => (
              <li key={k.id}>
                <Link href={`/${k.slug}`} className={off}>
                  <Icon name={k.icon ?? 'basket'} size={16} className="text-em-700" /> {nm(k)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {c.parent ? (
        <Link href={`/${c.parent.slug}`} className="mb-3 inline-flex items-center gap-1 text-base font-semibold text-em-700 no-underline">
          <Icon name="chevron-left" size={16} /> {nm(c.parent)}
        </Link>
      ) : null}

      <div className="fb-scroll-x mb-4 flex gap-2">
        {SORT_KEYS.map((s) => (
          <Link key={s} href={`/${c.slug}${q(s)}`} className={`inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm no-underline ${sort === s ? 'bg-au-100 font-semibold text-au-800 ring-1 ring-au-300' : 'text-ink-2 hover:bg-paper-2'}`}>
            {SORT_LABEL[s][lang]}
          </Link>
        ))}
      </div>

      {items.length ? (
        <>
          <ProductGrid items={items} lang={lang} cartMap={cartMap} />
          <Pagination lang={lang} basePath={`/${c.slug}`} meta={meta} query={sort === 'az' ? '' : `sort=${sort}`} />
        </>
      ) : (
        <EmptyState
          icon="basket"
          title={t.search.zero}
          action={
            <Link href="/" className={buttonClass('primary', 'md')}>
              {t.nav.home}
            </Link>
          }
        />
      )}

      {c.introHtml ? <section className="fb-card fb-prose mt-8 p-5 text-body text-ink-2" dangerouslySetInnerHTML={{ __html: c.introHtml }} /> : null}
      <JsonLd data={[breadcrumbLd(crumbs), itemListLd(items.map((p) => ({ name: p.nameHi ?? p.name, path: `/${p.itemType === 'SERVICE' ? 'service' : 'product'}/${p.slug}` })))]} />
    </div>
  );
}
