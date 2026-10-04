import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Breadcrumbs } from '@/components/list';
import { JsonLd } from '@/components/JsonLd';
import { ApiError, apiPaged, publicApi } from '@/lib/api';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl, formatDate } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { blogPostingLd, breadcrumbLd, buildMetadata } from '@/lib/seo';
import { currentLang } from '@/lib/session';

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

interface BlogPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  coverUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  readMinutes: number;
  publishedAt: string;
  updatedAt: string;
  author: string | null;
}
interface BlogListItem {
  slug: string;
  title: string;
}

async function loadPost(slug: string): Promise<BlogPost | null> {
  try {
    return await publicApi<BlogPost>(`/content/blog/${encodeURIComponent(slug)}`, 3600);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return null;
    throw e;
  }
}

/** Prev/next: dedicated endpoint nahi hai — chhoti si list (50) me se position nikaal lete hain. */
async function loadNeighbours(slug: string): Promise<{ prev: BlogListItem | null; next: BlogListItem | null }> {
  try {
    const list = await apiPaged<BlogListItem>('/content/blog?perPage=50', { revalidate: 3600 });
    const i = list.items.findIndex((p) => p.slug === slug);
    if (i < 0) return { prev: null, next: null };
    return { prev: list.items[i + 1] ?? null, next: list.items[i - 1] ?? null };
  } catch {
    return { prev: null, next: null };
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await loadPost(slug);
  if (!p) return buildMetadata({ title: 'नहीं मिला', description: 'यह लेख नहीं मिला', path: `/blog/${slug}`, noindex: true });
  return buildMetadata({
    title: p.seoTitle ?? p.title,
    description: p.seoDescription ?? p.excerpt ?? p.title,
    path: `/blog/${p.slug}`,
    image: imageUrl(p.coverUrl, PUBLIC_API_URL),
    type: 'article',
    publishedTime: p.publishedAt,
  });
}

export default async function BlogPostPage({ params }: Params): Promise<ReactNode> {
  const { slug } = await params;
  const p = await loadPost(slug);
  if (!p) notFound();
  const [lang, neighbours] = await Promise.all([currentLang(), loadNeighbours(slug)]);
  const t = dict(lang);
  const img = imageUrl(p.coverUrl, PUBLIC_API_URL);
  const crumbs = [
    { name: t.nav.home, path: '/' },
    { name: t.blog.title, path: '/blog' },
    { name: p.title, path: `/blog/${p.slug}` },
  ];

  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <Breadcrumbs items={crumbs} />
      <header className="space-y-1">
        <h1 className="fb-display text-3xl leading-tight">{p.title}</h1>
        <p className="text-sm text-ink-3">
          {formatDate(p.publishedAt, lang)} · {t.blog.readTime(p.readMinutes)}
        </p>
      </header>
      {img ? (
        // 3:1 to match what the Banners uploader produces. The declared size used to say 630 while
        // the file was 400 tall, so the article jumped as the cover loaded.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={p.title} width={1200} height={400} fetchPriority="high" decoding="sync" className="aspect-[3/1] w-full rounded object-cover" />
      ) : null}
      {/* ⚠️ Admin HTML save ke waqt sanitise ho chuki hai (ContentService.savePost) — isliye yahan surakshit hai */}
      <div className="fb-prose text-base text-ink-2" dangerouslySetInnerHTML={{ __html: p.bodyHtml }} />
      <nav className="flex items-center justify-between gap-3 border-t border-line pt-4 text-base">
        {neighbours.prev ? (
          <Link href={`/blog/${neighbours.prev.slug}`}>← {t.blog.prev}</Link>
        ) : (
          <span />
        )}
        {neighbours.next ? (
          <Link href={`/blog/${neighbours.next.slug}`}>{t.blog.next} →</Link>
        ) : (
          <span />
        )}
      </nav>
      <JsonLd data={[breadcrumbLd(crumbs), blogPostingLd({ title: p.title, slug: p.slug, excerpt: p.excerpt, publishedAt: p.publishedAt, coverUrl: img })]} />
    </article>
  );
}
