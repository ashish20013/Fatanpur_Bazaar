import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MeResponse, OrderSummary } from '@fb/shared-types';
import { EmptyState, Badge, buttonClass } from '@/components/ui';
import { authed, getMe } from '@/lib/data';
import { formatDate, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Paged<T> {
  items?: T[];
}

export default async function MeraPage(): Promise<ReactNode> {
  const [lang, me] = await Promise.all([currentLang(), getMe()]);
  const t = dict(lang);
  const user = me as MeResponse;
  const [orders, wallet] = await Promise.all([
    authed<OrderSummary[] | Paged<OrderSummary>>('/orders?perPage=5').catch(() => [] as OrderSummary[]),
    authed<{ balance: string }>('/users/me/wallet').catch(() => ({ balance: '0.00' })),
  ]);
  const list = Array.isArray(orders) ? orders : (orders.items ?? []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.account.title}</h1>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/mera/wallet" className="fb-card p-3 no-underline">
          <p className="text-sm text-ink-3">{t.account.balance}</p>
          <p className="fb-price text-lg">{rupees(wallet.balance)}</p>
        </Link>
        <div className="fb-card p-3">
          <p className="text-sm text-ink-3">{t.account.referralCode}</p>
          <p className="text-lg font-bold tracking-wider">{user.referralCode ?? '—'}</p>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg">{t.order.myOrders}</h2>
          <Link href="/mera/orders" className="text-base font-semibold text-g-700">
            {t.common.more}
          </Link>
        </div>
        {list.length ? (
          <ul className="space-y-2">
            {list.map((o) => (
              <li key={o.orderNumber}>
                <Link href={`/mera/order/${o.orderNumber}`} className="fb-card flex items-center justify-between gap-3 p-3 no-underline">
                  <span className="min-w-0">
                    <span className="block text-body font-semibold text-ink">{o.orderNumber}</span>
                    <span className="block text-sm text-ink-3">{formatDate(o.placedAt, lang)}</span>
                  </span>
                  <span className="text-right">
                    <Badge tone={o.status === 'DELIVERED' || o.status === 'COMPLETED' ? 'ok' : o.status === 'CANCELLED' ? 'danger' : 'info'}>{o.statusLabelHi}</Badge>
                    <span className="fb-price mt-1 block text-body">{rupees(o.payable)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="package"
            title={t.order.none}
            action={
              <Link href="/sabzi" className={buttonClass('primary', 'sm')}>
                {t.cart.emptyCta}
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
