import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Pagination } from '@/components/list';
import { EmptyState } from '@/components/ui';
import { apiPaged } from '@/lib/api';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl, formatDate } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { buildMetadata } from '@/lib/seo';
import { currentLang } from '@/lib/session';

export const revalidate = 3600;

type Params = { searchParams: Promise<Record<string, string | undefined>> };

interface BlogListItem {
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  readMinutes: number;
  publishedAt: string;
}

export const metadata: Metadata = buildMetadata({
  title: 'लेख — सब्ज़ी, किराना और खेती की जानकारी',
  description: 'फतनपुर बाज़ार के ब्लॉग पर सब्ज़ी, किराना, खेती और ऑनलाइन ऑर्डर से जुड़ी उपयोगी जानकारी हिंदी में पढ़ें।',
  path: '/blog',
});

export default async function BlogListPage({ searchParams }: Params): Promise<ReactNode> {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [lang, list] = await Promise.all([currentLang(), apiPaged<BlogListItem>(`/content/blog?page=${page}`, { revalidate: 3600 })]);
  const t = dict(lang);

  return (
    <div className="space-y-4">
      <h1 className="fb-display text-3xl leading-tight">{t.blog.title}</h1>
      {list.items.length ? (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.items.map((p, i) => {
              const img = imageUrl(p.coverUrl, PUBLIC_API_URL);
              return (
                <li key={p.slug} className="fb-card overflow-hidden p-0">
                  <Link href={`/blog/${p.slug}`} className="block no-underline">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt={p.title}
                        width={600}
                        height={340}
                        loading={i === 0 ? 'eager' : 'lazy'}
                        decoding={i === 0 ? 'sync' : 'async'}
                        className="h-auto w-full object-cover"
                      />
                    ) : null}
                    <div className="space-y-1 p-3">
                      <h2 className="text-lg font-semibold text-ink">{p.title}</h2>
                      {p.excerpt ? <p className="line-clamp-2 text-base text-ink-2">{p.excerpt}</p> : null}
                      <p className="text-sm text-ink-3">
                        {formatDate(p.publishedAt, lang)} · {t.blog.readTime(p.readMinutes)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination lang={lang} basePath="/blog" meta={list.meta} />
        </>
      ) : (
        <EmptyState icon="article" title={t.blog.empty} />
      )}
    </div>
  );
}
