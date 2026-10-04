import Link from 'next/link';
import type { ReactNode } from 'react';
import { ORDER_STATUS_LABEL_EN, type OrderStatus, type OrderSummary, type SalesReport } from '@fb/shared-types';
import { apiPaged } from '@/lib/api';
import { authed } from '@/lib/data';
import { formatDate, rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { accessToken } from '@/lib/session';
import { Badge, EmptyState, buttonClass } from '../ui';
import { Pagination } from '../list';
import { StatCard, TableWrap, Td, Th } from './table';

/**
 * ADMIN aur SUPERVISOR dono in screens ko use karte hain — sirf base path alag hota hai.
 * ⚠️ Yahan koi permission decide nahi hoti; API 403 dega to page error dikhayega.
 */
interface DashboardData {
  today: { orders: number; gmv: string };
  openOrders: Record<string, number>;
  lowStock: number;
  payments: Record<string, number>;
  prescriptionsPending: number;
  last7Days: { date: string; orders: number; gmv: string }[];
  villages: {
    top: { name: string; orderCount: number }[];
    zeroActive: { name: string }[];
    mostRequestedInactive: { villageGuess: string; requests: number }[];
  };
}

export async function DashboardScreen({ lang, base }: { lang: Lang; base: string }): Promise<ReactNode> {
  const t = dict(lang);
  const d = await authed<DashboardData>('/admin/dashboard');
  const open = Object.entries(d.openOrders).reduce((a, [, n]) => a + n, 0);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.staff.dashboard}</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.staff.todayOrders} value={d.today.orders} href={`${base}/orders`} />
        <StatCard label={t.staff.todaySales} value={rupees(d.today.gmv)} />
        <StatCard label={t.staff.orders} value={open} hint={Object.entries(d.openOrders).map(([s, n]) => `${ORDER_STATUS_LABEL_EN[s as OrderStatus] ?? s}: ${n}`).join(' · ')} href={`${base}/orders`} />
        <StatCard label={t.staff.lowStock} value={d.lowStock} tone={d.lowStock > 0 ? 'warn' : 'default'} href={`${base}/inventory`} />
        <StatCard
          label={t.staff.pendingPayments}
          value={Object.values(d.payments).reduce((a, b) => a + b, 0)}
          tone={Object.values(d.payments).some((n) => n > 0) ? 'danger' : 'default'}
          href="/admin/payments"
        />
        <StatCard label={t.account.prescriptions} value={d.prescriptionsPending} />
        <StatCard label={t.staff.areaRequests} value={d.villages.mostRequestedInactive.length} href="/admin/area-requests" />
        <StatCard label={t.staff.villages} value={d.villages.top.length} href={`${base}/villages`} />
      </div>

      <section>
        <h2 className="mb-2 text-lg">{t.staff.reports}</h2>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t.order.placedAt}</Th>
              <Th align="right">{t.staff.orders}</Th>
              <Th align="right">{t.staff.todaySales}</Th>
            </tr>
          </thead>
          <tbody>
            {d.last7Days.map((r) => (
              <tr key={r.date}>
                <Td>{r.date}</Td>
                <Td align="right">{r.orders}</Td>
                <Td align="right">{rupees(r.gmv)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      {/* A8.11 — teen list jo admin ko har hafte dekhni hain */}
      <section className="grid gap-3 md:grid-cols-3">
        <div className="fb-card p-3">
          <h3 className="mb-1 text-body font-bold">Villages with the most orders</h3>
          <ul className="text-base text-ink-2">
            {d.villages.top.map((v) => (
              <li key={v.name}>
                {v.name} · <span className="tabular-nums">{v.orderCount}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="fb-card p-3">
          <h3 className="mb-1 text-body font-bold">Active villages with 0 orders</h3>
          <ul className="text-base text-ink-2">
            {d.villages.zeroActive.map((v) => (
              <li key={v.name}>{v.name}</li>
            ))}
          </ul>
        </div>
        <div className="fb-card p-3">
          <h3 className="mb-1 text-body font-bold">Most-requested closed villages</h3>
          <ul className="text-base text-ink-2">
            {d.villages.mostRequestedInactive.map((v) => (
              <li key={v.villageGuess}>
                {v.villageGuess} · <span className="tabular-nums">{v.requests}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/area-requests" className="text-base font-semibold text-g-700">
            {t.staff.areaRequests} →
          </Link>
        </div>
      </section>
    </div>
  );
}

const STATUS_FILTERS = ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

export async function OrdersScreen({ lang, base, sp }: { lang: Lang; base: string; sp: Record<string, string | undefined> }): Promise<ReactNode> {
  const t = dict(lang);
  const token = await accessToken();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const qs = new URLSearchParams({ page: String(page) });
  if (sp.status) qs.set('status', sp.status);
  if (sp.q) qs.set('q', sp.q);
  const { items, meta } = await apiPaged<OrderSummary>(`/admin/orders?${qs.toString()}`, { token });

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.orders}</h1>
      <ul className="fb-scroll-x flex gap-2">
        <li className="shrink-0">
          <Link href={`${base}/orders`} className={`inline-flex h-9 items-center rounded-full border px-3 text-base no-underline ${!sp.status ? 'border-g-700 bg-g-700 text-white' : 'border-line bg-white text-ink-2'}`}>
            {t.common.all}
          </Link>
        </li>
        {STATUS_FILTERS.map((s) => (
          <li key={s} className="shrink-0">
            <Link
              href={`${base}/orders?status=${s}`}
              className={`inline-flex h-9 items-center rounded-full border px-3 text-base no-underline ${sp.status === s ? 'border-g-700 bg-g-700 text-white' : 'border-line bg-white text-ink-2'}`}
            >
              {s}
            </Link>
          </li>
        ))}
      </ul>

      {items.length ? (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>{t.order.number}</Th>
                <Th>{t.staff.status}</Th>
                <Th>{t.address.village}</Th>
                <Th align="right">{t.cart.grandTotal}</Th>
                <Th>{t.checkout.payment}</Th>
                <Th>{t.order.placedAt}</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.orderNumber}>
                  <Td>
                    <Link href={`${base}/orders/${o.orderNumber}`} className="font-semibold">
                      {o.orderNumber}
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={o.status === 'DELIVERED' || o.status === 'COMPLETED' ? 'ok' : o.status === 'CANCELLED' ? 'danger' : 'info'}>{ORDER_STATUS_LABEL_EN[o.status]}</Badge>
                  </Td>
                  <Td>{o.village ?? '—'}</Td>
                  <Td align="right" className="fb-price">{rupees(o.payable)}</Td>
                  <Td>
                    {o.paymentMethod} · {o.paymentStatus}
                  </Td>
                  <Td>{formatDate(o.placedAt, lang)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pagination lang={lang} basePath={`${base}/orders`} meta={meta} query={sp.status ? `status=${sp.status}` : ''} />
        </>
      ) : (
        <EmptyState icon="package" title={t.staff.noRows} />
      )}
    </div>
  );
}

interface LowStockRow {
  id: number;
  name: string;
  nameHi: string | null;
  stockQty: number;
  lowStockAt: number;
  price: string;
}

export async function InventoryScreen({ lang }: { lang: Lang }): Promise<ReactNode> {
  const t = dict(lang);
  const rows = await authed<LowStockRow[]>('/admin/inventory/low-stock').catch(() => [] as LowStockRow[]);
  if (!rows.length) return <EmptyState icon="package" title={t.staff.lowStock} body={t.staff.noRows} />;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.lowStock}</h1>
      <TableWrap>
        <thead>
          <tr>
            <Th>{t.staff.products}</Th>
            <Th align="right">{t.staff.stock}</Th>
            <Th align="right">{t.staff.price}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td>{p.nameHi ?? p.name}</Td>
              <Td align="right" className={p.stockQty <= 0 ? 'font-bold text-danger' : 'font-semibold text-a-700'}>
                {p.stockQty} / {p.lowStockAt}
              </Td>
              <Td align="right">{rupees(p.price)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}

interface CustomerRow {
  id: number;
  name: string | null;
  phone: string;
  status: string;
  orders: number;
  lastOrderAt: string | null;
}

export async function CustomersScreen({ lang }: { lang: Lang }): Promise<ReactNode> {
  const t = dict(lang);
  const token = await accessToken();
  const { items } = await apiPaged<CustomerRow>('/admin/customers', { token });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.customers}</h1>
      <TableWrap>
        <thead>
          <tr>
            <Th>{t.auth.name}</Th>
            <Th>{t.auth.phone}</Th>
            <Th align="right">{t.staff.orders}</Th>
            <Th>{t.staff.status}</Th>
            <Th>{t.order.placedAt}</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <Td>{c.name ?? '—'}</Td>
              <Td>{c.phone}</Td>
              <Td align="right">{c.orders}</Td>
              <Td>
                <Badge tone={c.status === 'ACTIVE' ? 'ok' : 'danger'}>{c.status}</Badge>
              </Td>
              <Td>{c.lastOrderAt ? formatDate(c.lastOrderAt, lang) : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </div>
  );
}

export async function ReportsScreen({ lang }: { lang: Lang }): Promise<ReactNode> {
  const t = dict(lang);
  const r = await authed<SalesReport>('/admin/reports/sales').catch(() => null);
  if (!r) return <EmptyState icon="chart-bar" title={t.staff.reports} body={t.staff.noRows} />;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.staff.reports}</h1>

      <section>
        <h2 className="mb-1 text-lg">{t.home.popular}</h2>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t.staff.products}</Th>
              <Th align="right">Qty</Th>
              <Th align="right">{t.staff.todaySales}</Th>
            </tr>
          </thead>
          <tbody>
            {r.topProducts.map((p) => (
              <tr key={p.productId}>
                <Td>{p.nameHi ?? p.name}</Td>
                <Td align="right">{p.qty}</Td>
                <Td align="right">{rupees(p.revenue)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      <section>
        <h2 className="mb-1 text-lg">{t.checkout.payment}</h2>
        <TableWrap>
          <thead>
            <tr>
              <Th>{t.checkout.payment}</Th>
              <Th align="right">{t.staff.orders}</Th>
              <Th align="right">{t.cart.grandTotal}</Th>
            </tr>
          </thead>
          <tbody>
            {r.byPayment.map((p) => (
              <tr key={p.method}>
                <Td>{p.method}</Td>
                <Td align="right">{p.orders}</Td>
                <Td align="right">{rupees(p.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      {/* A10 — zero-result searches = agla stock list */}
      <section>
        <h2 className="mb-1 text-lg">{t.search.zero}</h2>
        <ul className="flex flex-wrap gap-2">
          {r.zeroSearch.map((s) => (
            <li key={s.query}>
              <Badge tone="warn">
                {s.query} · {s.times}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function NoPermission({ lang }: { lang: Lang }): ReactNode {
  const t = dict(lang);
  return (
    <EmptyState
      icon="lock"
      title={t.common.error}
      body="You do not have access to this page."
      action={
        <Link href="/" className={buttonClass('secondary', 'sm')}>
          {t.nav.home}
        </Link>
      }
    />
  );
}
