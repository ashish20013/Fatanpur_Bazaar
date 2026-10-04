import type { ReactNode } from 'react';
import { ContentAdmin } from '@/components/admin/ContentAdmin';
import type { FaqRow, MessageRow, PageRow, PostRow } from '@/components/admin/content-types';
import { LoadError } from '@/components/admin/form-kit';
import { authed } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** Content: blog, legal pages, FAQs, customer messages (API: content.manage). */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const [sp, pages, posts, messages, faqs] = await Promise.all([
    searchParams,
    authed<PageRow[]>('/admin/content/pages').catch(() => null),
    authed<PostRow[]>('/admin/content/posts').catch(() => null),
    authed<MessageRow[]>('/admin/content/messages').catch(() => [] as MessageRow[]),
    authed<FaqRow[]>('/admin/content/faqs').catch(() => [] as FaqRow[]),
  ]);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Blog, pages & FAQ</h1>
      {pages && posts ? <ContentAdmin pages={pages} posts={posts} faqs={faqs} messages={messages} initialTab={sp.tab} /> : <LoadError what="content" href="/admin/content" />}
    </div>
  );
}
