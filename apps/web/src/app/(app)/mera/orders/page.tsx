import Link from 'next/link';
import type { ReactNode } from 'react';
import type { OrderSummary } from '@fb/shared-types';
import { Pagination } from '@/components/list';
import { Badge, EmptyState, buttonClass } from '@/components/ui';
import { apiPaged } from '@/lib/api';
import { formatDate, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { accessToken, currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const [lang, sp, token] = await Promise.all([currentLang(), searchParams, accessToken()]);
  const t = dict(lang);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { items, meta } = await apiPaged<OrderSummary>(`/orders?page=${page}`, { token });

  if (!items.length) {
    return (
      <EmptyState
        icon="package"
        title={t.order.none}
        action={
          <Link href="/sabzi" className={buttonClass('primary', 'sm')}>
            {t.cart.emptyCta}
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.order.myOrders}</h1>
      <ul className="space-y-2">
        {items.map((o) => (
          <li key={o.orderNumber}>
            <Link href={`/mera/order/${o.orderNumber}`} className="fb-card flex items-center justify-between gap-3 p-3 no-underline">
              <span className="min-w-0">
                <span className="block text-body font-semibold text-ink">{o.orderNumber}</span>
                <span className="block text-sm text-ink-3">
                  {formatDate(o.placedAt, lang)} · {t.cart.items(o.itemCount)}
                </span>
                {o.village ? <span className="block text-sm text-ink-3">{o.village}</span> : null}
              </span>
              <span className="text-right">
                <Badge tone={o.status === 'DELIVERED' || o.status === 'COMPLETED' ? 'ok' : o.status === 'CANCELLED' ? 'danger' : 'info'}>{o.statusLabelHi}</Badge>
                <span className="fb-price mt-1 block text-body">{rupees(o.payable)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination lang={lang} basePath="/mera/orders" meta={meta} />
    </div>
  );
}
