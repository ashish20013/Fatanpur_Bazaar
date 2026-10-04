'use client';

import { useState, type ReactNode } from 'react';
import { ContentFaqs } from './ContentFaqs';
import { ContentMessages } from './ContentMessages';
import { ContentPages } from './ContentPages';
import { ContentPosts } from './ContentPosts';
import type { FaqRow, MessageRow, PageRow, PostRow } from './content-types';
import { Tabs } from './form-kit';

type Tab = 'posts' | 'pages' | 'faqs' | 'messages';

/**
 * Blog, legal pages, FAQs and customer messages in one screen.
 * ⚠️ All HTML is allowlist-sanitised by the API on write (stored-XSS guard) — this editor is plain text.
 */
export function ContentAdmin({ pages, posts, faqs, messages, initialTab }: { pages: PageRow[]; posts: PostRow[]; faqs: FaqRow[]; messages: MessageRow[]; initialTab?: string }): ReactNode {
  const valid: Tab[] = ['posts', 'pages', 'faqs', 'messages'];
  const [tab, setTab] = useState<Tab>(valid.includes(initialTab as Tab) ? (initialTab as Tab) : 'posts');

  function change(t: Tab): void {
    setTab(t);
    // Keep the tab in the URL so a refresh (or router.refresh after a save) stays on it.
    window.history.replaceState(null, '', `?tab=${t}`);
  }

  const newMsgs = messages.filter((m) => m.status === 'NEW').length;
  return (
    <div className="space-y-4">
      <Tabs<Tab>
        active={tab}
        onChange={change}
        tabs={[
          { key: 'posts', label: 'Blog posts', count: posts.length },
          { key: 'pages', label: 'Pages', count: pages.length },
          { key: 'faqs', label: 'FAQs', count: faqs.length },
          { key: 'messages', label: 'Messages', count: newMsgs },
        ]}
      />
      <div role="tabpanel">
        {tab === 'posts' ? <ContentPosts rows={posts} /> : null}
        {tab === 'pages' ? <ContentPages rows={pages} /> : null}
        {tab === 'faqs' ? <ContentFaqs rows={faqs} /> : null}
        {tab === 'messages' ? <ContentMessages rows={messages} /> : null}
      </div>
    </div>
  );
}
