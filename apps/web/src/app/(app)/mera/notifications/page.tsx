import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui';
import { apiPaged } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { accessToken, currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Note {
  id: number;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export default async function NotificationsPage(): Promise<ReactNode> {
  const [lang, token] = await Promise.all([currentLang(), accessToken()]);
  const t = dict(lang);
  const { items } = await apiPaged<Note>('/users/me/notifications', { token });
  if (!items.length) return <EmptyState icon="bell" title={t.account.notifications} />;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.account.notifications}</h1>
      <ul className="divide-y divide-line rounded border border-line bg-card">
        {items.map((n) => (
          <li key={n.id} className={n.isRead ? 'p-3' : 'bg-g-50 p-3'}>
            {n.linkUrl ? (
              <Link href={n.linkUrl} className="no-underline">
                <span className="block text-body font-semibold text-ink">{n.title}</span>
                <span className="block text-base text-ink-2">{n.body}</span>
              </Link>
            ) : (
              <>
                <span className="block text-body font-semibold">{n.title}</span>
                <span className="block text-base text-ink-2">{n.body}</span>
              </>
            )}
            <span className="block text-sm text-ink-3">{formatDate(n.createdAt, lang)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
