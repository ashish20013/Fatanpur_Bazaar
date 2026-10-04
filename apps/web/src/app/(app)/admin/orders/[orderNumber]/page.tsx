import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ORDER_STATUS_LABEL_EN, type OrderDetail } from '@fb/shared-types';
import { OrderAdmin } from '@/components/admin/OrderAdmin';
import type { BoardData } from '@/components/admin/DeliveryBoard';
import { Badge } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/data';
import { formatDate, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ orderNumber: string }> }): Promise<ReactNode> {
  const { orderNumber } = await params;
  const lang = await staffLang();
  const t = dict(lang);
  let order: OrderDetail;
  try {
    order = await authed<OrderDetail>(`/admin/orders/${encodeURIComponent(orderNumber)}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const board = await authed<BoardData>('/admin/delivery/board').catch(() => ({ riders: [], ready: [], active: [] } as BoardData));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{order.orderNumber}</h1>
        <Badge tone={order.status === 'DELIVERED' || order.status === 'COMPLETED' ? 'ok' : order.status === 'CANCELLED' ? 'danger' : 'info'}>{ORDER_STATUS_LABEL_EN[order.status]}</Badge>
      </div>
      <p className="text-base text-ink-2">
        {formatDate(order.placedAt, lang)} · {order.paymentMethod} · {order.paymentStatus} · {order.ship.village ?? ''}
      </p>

      <section className="fb-card p-4">
        <h2 className="mb-2 text-lg">Delivery address</h2>
        <dl className="grid gap-x-6 gap-y-1 text-base sm:grid-cols-[160px_1fr]">
          <dt className="text-ink-3">Receiver</dt>
          <dd>
            {order.ship.name} · <a href={`tel:+91${order.ship.phone}`} className="font-semibold text-em-700">{order.ship.phone}</a>
          </dd>
          {order.ship.guardianName ? (<><dt className="text-ink-3">Father / guardian</dt><dd>{order.ship.guardianName}</dd></>) : null}
          {order.ship.altPhone ? (<><dt className="text-ink-3">Alternate phone</dt><dd><a href={`tel:+91${order.ship.altPhone}`} className="font-semibold text-em-700">{order.ship.altPhone}</a></dd></>) : null}
          <dt className="text-ink-3">Address</dt>
          <dd>{[order.ship.line1, order.ship.landmark, order.ship.village, order.ship.district, order.ship.pincode].filter(Boolean).join(', ')}</dd>
          {order.ship.directions ? (<><dt className="text-ink-3">Route</dt><dd>{order.ship.directions}</dd></>) : null}
          {order.ship.deliveryNote ? (<><dt className="text-ink-3">Note for rider</dt><dd>{order.ship.deliveryNote}</dd></>) : null}
          {order.ship.orderedFromHere === false ? (
            <><dt className="text-ink-3">Ordered from</dt><dd className="font-semibold text-au-800">Somewhere else — the phone position below is NOT the drop point</dd></>
          ) : null}
          {order.ship.originLat !== null && order.ship.originLng !== null ? (
            <><dt className="text-ink-3">Phone position</dt><dd>
              <a className="font-semibold text-em-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${order.ship.originLat},${order.ship.originLng}`} target="_blank" rel="noopener noreferrer">
                {order.ship.originLat.toFixed(5)}, {order.ship.originLng.toFixed(5)}
              </a>
              {order.ship.originAccuracyM !== null ? ` (±${order.ship.originAccuracyM} m)` : ''}
            </dd></>
          ) : null}
          {order.ship.locationMethod ? (<><dt className="text-ink-3">Location</dt><dd>{order.ship.locationMethod === 'GPS' ? 'Phone GPS at the address' : order.ship.locationMethod === 'MAP_PIN' ? 'Pinned on map' : 'Described route only'}</dd></>) : null}
        </dl>
        {order.ship.mapsUrl ? (
          <a className="mt-2 inline-block text-base font-semibold text-em-700 underline" href={order.ship.mapsUrl} target="_blank" rel="noopener noreferrer">
            {t.staff.navigate} (Google Maps)
          </a>
        ) : null}
      </section>

      <section className="fb-card p-3">
        <h2 className="mb-1 text-lg">Items</h2>
        <ul className="divide-y divide-line">
          {order.items.map((i) => (
            <li key={i.id} className={`flex justify-between gap-2 py-2 ${i.isRemoved ? 'text-ink-3 line-through' : ''}`}>
              <span>
                {i.name}{i.nameHi && i.nameHi !== i.name ? <span className="text-ink-3"> · {i.nameHi}</span> : null}
                <span className="block text-sm text-ink-3">{i.unit} × {i.finalQuantity ?? i.quantity}{i.supplierName ? ` · ${i.supplierName}` : ''}</span>
              </span>
              <span className="fb-price">{rupees(i.finalLineTotal ?? i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-line pt-2 text-right text-lg font-bold">
          {t.cart.grandTotal}: <span className="fb-price">{rupees(order.payable)}</span>
        </p>
      </section>

      <OrderAdmin lang={lang} order={order} riders={board.riders} />

      <div className="flex flex-wrap gap-4">
        <Link href="/admin/orders" className="text-base font-semibold text-em-700">
          ← {t.staff.orders}
        </Link>
        <Link href={`/mera/order/${encodeURIComponent(order.orderNumber)}/bill`} className="text-base font-semibold text-em-700">
          Print bill
        </Link>
      </div>
    </div>
  );
}
