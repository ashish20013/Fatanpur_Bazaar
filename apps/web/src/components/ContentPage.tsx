import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ApiError, publicApi } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';

/**
 * §8 item 5 — about/privacy/terms/refund/shipping/contact sab isi se render hote hain.
 * Har `(legal)/*\/page.tsx` sirf `slug` pass karta hai — content DB (`pages` table) se aata hai.
 */
interface PageData {
  slug: string;
  title: string;
  bodyHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
}

async function loadPage(slug: string): Promise<PageData | null> {
  try {
    return await publicApi<PageData>(`/content/pages/${encodeURIComponent(slug)}`, 3600);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return null;
    throw e;
  }
}

/** Har legal page ka `generateMetadata` isi se banta hai — DB ke seoTitle/seoDescription se. */
export async function contentPageMetadata(slug: string): Promise<Metadata> {
  const p = await loadPage(slug);
  if (!p) return buildMetadata({ title: 'नहीं मिला', description: 'यह पेज नहीं मिला', path: `/${slug}`, noindex: true });
  return buildMetadata({ title: p.seoTitle ?? p.title, description: p.seoDescription ?? p.title, path: `/${slug}` });
}

export async function ContentPage({ slug, children }: { slug: string; children?: ReactNode }): Promise<ReactNode> {
  const p = await loadPage(slug);
  if (!p) notFound();
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <h1 className="fb-display text-3xl leading-tight">{p.title}</h1>
      {/* ⚠️ Admin HTML save ke waqt sanitise ho chuki hai (ContentService.savePage, allowlist) — isliye yahan surakshit hai */}
      <div className="fb-prose text-base text-ink-2" dangerouslySetInnerHTML={{ __html: p.bodyHtml }} />
      {children}
    </article>
  );
}
