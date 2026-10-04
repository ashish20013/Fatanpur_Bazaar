import type { MetadataRoute } from 'next';
import { safeApi } from '@/lib/api';
import { SITE_URL } from '@/lib/env';

/** §11 — sitemap.ts: products, categories, areas, blog, legal, home. */
export const revalidate = 3600;

interface CatalogSitemap {
  products: { slug: string; updatedAt: string; itemType?: string }[];
  categories: { slug: string; updatedAt: string }[];
  verticals: string[];
}
interface ContentSitemap {
  blog: { slug: string; updatedAt: string }[];
  pages: string[];
}
interface AreaEntry {
  slug: string;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [catalog, content, areas] = await Promise.all([
    safeApi<CatalogSitemap>('/catalog/sitemap', { products: [], categories: [], verticals: [] }, 3600),
    safeApi<ContentSitemap>('/content/sitemap', { blog: [], pages: [] }, 3600),
    safeApi<{ villages: AreaEntry[] }>('/catalog/areas', { villages: [] }, 3600),
  ]);
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    // ⚠️ /khoj yahan nahi — wo page khud noindex hai (§11), sitemap me noindex URL nahi jaate.
    { url: `${SITE_URL}/faq`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
  ];
  // Categories live at /{slug} (the old /category/{slug} and /{vertical} URLs 308-redirect there).
  for (const c of catalog.categories) entries.push({ url: `${SITE_URL}/${c.slug}`, lastModified: new Date(c.updatedAt), changeFrequency: 'daily', priority: 0.8 });
  for (const p of catalog.products) entries.push({ url: `${SITE_URL}/${p.itemType === 'SERVICE' ? 'service' : 'product'}/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: 'daily', priority: 0.6 });
  for (const a of areas.villages ?? []) entries.push({ url: `${SITE_URL}/area/${a.slug}`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 });
  for (const b of content.blog) entries.push({ url: `${SITE_URL}/blog/${b.slug}`, lastModified: new Date(b.updatedAt), changeFrequency: 'monthly', priority: 0.4 });
  for (const slug of content.pages) entries.push({ url: `${SITE_URL}/${slug}`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 });
  return entries;
}
