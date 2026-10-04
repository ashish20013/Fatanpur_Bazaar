import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { ProductCard } from '@fb/shared-types';
import { CategoryView, SORT_KEYS, type CategoryPayload, type SortKey } from '@/components/catalog/CategoryView';
import { ApiError, apiPaged, publicApi } from '@/lib/api';
import { getShell } from '@/lib/shell';
import { buildMetadata } from '@/lib/seo';

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Old vertical URLs (/sabzi /phal /sewa) → the category that now holds them (SEO-safe 308). */
const LEGACY: Record<string, string> = { sabzi: 'sabziyan', phal: 'fal', sewa: 'ghar-sewa' };

async function load(slug: string): Promise<CategoryPayload | null> {
  if (!/^[a-z0-9-]{1,140}$/.test(slug)) return null;
  try {
    return await publicApi<CategoryPayload>(`/catalog/categories/${slug}`, 120);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = await load(slug);
  if (!c) return buildMetadata({ title: 'नहीं मिला', description: 'यह श्रेणी नहीं मिली', path: `/${slug}`, noindex: true });
  const hi = c.nameHi ?? c.name;
  return buildMetadata({
    title: c.seoTitle ?? `${hi} ऑनलाइन — रानीगंज में घर तक`,
    description: c.seoDescription ?? `फतनपुर बाज़ार से ${hi} ऑनलाइन मंगाएं — रानीगंज तहसील के गाँवों में होम डिलीवरी, कैश ऑन डिलीवरी और UPI।`,
    path: `/${c.slug}`,
  });
}

export default async function CategoryPage({ params, searchParams }: Params): Promise<ReactNode> {
  const { slug } = await params;
  const sp = await searchParams;
  if (LEGACY[slug]) permanentRedirect(`/${LEGACY[slug]}`);
  const c = await load(slug);
  if (!c) notFound(); // unknown slug, or its vertical is switched off (Compliance kill-switch)
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sp.sort ?? '') ? (sp.sort as SortKey) : 'az';
  const page = Math.max(1, Math.min(200, Number(sp.page ?? 1) || 1));
  const s = await getShell();
  const apiSort = sort === 'az' && s.lang === 'en' ? 'az_en' : sort;
  const list = await apiPaged<ProductCard>(`/catalog/products?category=${c.slug}&sort=${apiSort}&page=${page}&perPage=48`, { revalidate: 60 });
  const cartMap = new Map((s.cart?.items ?? []).map((i) => [i.productId, { itemId: i.id, quantity: i.quantity }]));
  return <CategoryView lang={s.lang} c={c} items={list.items} meta={list.meta} sort={sort} cartMap={cartMap} rootSlug={c.parent?.slug ?? c.slug} />;
}
