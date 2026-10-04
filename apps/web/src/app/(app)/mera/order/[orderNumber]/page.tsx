import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { OrderDetail, TrackingSnapshot } from '@fb/shared-types';
import { DeliveryTimer } from '@/components/DeliveryTimer';
import { Icon } from '@/components/icons';
import { OrderActions } from '@/components/OrderActions';
import { OrderTracking } from '@/components/OrderTracking';
import { ProductVisual } from '@/components/ProductVisual';
import { UpiPay } from '@/components/UpiPay';
import { Badge, buttonClass } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { authed, getSettings } from '@/lib/data';
import { formatDate, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

const LIVE_STATUSES = new Set(['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'IN_PROGRESS']);

function Row({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: 'ok' }): ReactNode {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'border-t border-line pt-2 text-lg font-semibold text-ink' : ''} ${tone === 'ok' ? 'text-ok' : ''}`}>
      <dt>{label}</dt>
      <dd className={strong ? 'fb-price' : 'tabular-nums'}>{value}</dd>
    </div>
  );
}

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ placed?: string }>;
}): Promise<ReactNode> {
  const [{ orderNumber }, sp] = await Promise.all([params, searchParams]);
  const [lang, settings] = await Promise.all([currentLang(), getSettings()]);
  const t = dict(lang);

  let order: OrderDetail;
  try {
    order = await authed<OrderDetail>(`/orders/${encodeURIComponent(orderNumber)}`);
  } catch (e) {
    // ⚠️ Someone else's order → the API answers 404 (not 403) so existence never leaks.
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }

  const live = LIVE_STATUSES.has(order.status);
  const snapshot = live ? await authed<TrackingSnapshot>(`/orders/${encodeURIComponent(orderNumber)}/track`).catch(() => null) : null;
  const adjusted = order.finalGrandTotal !== null && order.finalGrandTotal !== order.grandTotal;
  const done = order.status === 'DELIVERED' || order.status === 'COMPLETED';
  const dead = ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED', 'RETURNED'].includes(order.status);
  const ship = order.ship;

  return (
    <div className="space-y-4">
      {sp.placed && !dead ? (
        <section className="flex items-start gap-3 rounded-[22px] border border-em-200 bg-em-50 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-em-700 text-au-200">
            <Icon name="check" size={22} />
          </span>
          <div>
            <p className="fb-display text-xl text-em-800">{t.order.placedTitle}</p>
            <p className="text-base text-ink-2">{t.order.placedSub}</p>
          </div>
        </section>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-ink-3">{t.order.number}</p>
          <h1 className="text-2xl font-semibold tabular-nums tracking-wide">{order.orderNumber}</h1>
          <p className="text-sm text-ink-3">
            {t.order.placedAt}: {formatDate(order.placedAt, lang)}
          </p>
        </div>
        <Badge tone={done ? 'ok' : dead ? 'danger' : 'info'}>{order.statusLabelHi}</Badge>
      </header>

      {/* Owner's rule: 30 min green → 30 min yellow → "delivered" the moment the rider marks it. */}
      <DeliveryTimer
        lang={lang}
        orderNumber={order.orderNumber}
        status={order.status}
        paymentStatus={order.paymentStatus}
        paymentMethod={order.paymentMethod}
        clockStartAt={order.clockStartAt}
        deliveredAt={order.deliveredAt}
        serverNow={order.serverNow}
        minutes={settings.timerMinutes}
        supportPhone={settings.supportPhone}
      />

      {/* A18 — the delivery code is shown only to the customer, large. */}
      {order.deliveryOtp ? (
        <section className="rounded-[22px] border border-au-300 bg-au-50 p-4 text-center shadow-gold">
          <p className="text-base font-semibold text-au-800">{t.order.deliveryCode}</p>
          <p className="fb-price my-1 text-4xl tracking-[0.3em] text-em-800">{order.deliveryOtp}</p>
          <p className="text-sm text-ink-2">{t.order.deliveryCodeHint}</p>
        </section>
      ) : null}

      {order.service ? (
        <section className="fb-card flex items-center gap-3 p-4">
          <Icon name="calendar" size={24} className="shrink-0 text-au-600" />
          <div>
            <p className="text-sm text-ink-3">{t.order.service}</p>
            <p className="text-body font-semibold">
              {order.service.date} · {order.service.slotStart.slice(0, 5)}–{order.service.slotEnd.slice(0, 5)}
            </p>
            {order.service.completionOtp ? (
              <p className="text-sm text-ink-2">
                {t.order.deliveryCode}: <span className="fb-price tracking-widest">{order.service.completionOtp}</span>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {snapshot || live ? <OrderTracking lang={lang} orderNumber={order.orderNumber} initial={snapshot} /> : null}

      {order.upi && order.paymentStatus === 'PENDING' && !dead ? <UpiPay lang={lang} orderNumber={order.orderNumber} upi={order.upi} /> : null}
      {order.paymentStatus === 'PAID' ? (
        <p className="flex items-center gap-2 rounded-xl bg-em-100 px-4 py-2.5 text-base font-semibold text-em-800">
          <Icon name="circle-check" size={18} /> {t.payment.verified}
        </p>
      ) : null}

      {/* A16 — after an adjustment both totals are shown plainly. */}
      {adjusted ? <p className="rounded-xl border border-au-200 bg-au-50 px-4 py-2.5 text-base text-au-800">{t.order.adjusted(order.grandTotal, order.finalGrandTotal ?? order.grandTotal)}</p> : null}
      {order.adjustmentNote ? <p className="text-base text-ink-2">{order.adjustmentNote}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="fb-card p-4">
          <h2 className="fb-display mb-2 text-xl">
            {t.order.items} <span className="font-sans text-base text-ink-3">· {order.items.length}</span>
          </h2>
          <ul className="divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.id} className={`flex items-center gap-3 py-2.5 ${i.isRemoved ? 'text-ink-3' : ''}`}>
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  <ProductVisual name={i.name} nameHi={i.nameHi} image={i.image} icon={null} family={null} lang={lang} size="xs" width={96} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-body leading-snug ${i.isRemoved ? 'line-through' : ''}`}>{lang === 'hi' ? (i.nameHi ?? i.name) : i.name}</span>
                  <span className="block text-sm text-ink-3">
                    {i.unit} × {i.finalQuantity ?? i.quantity}
                    {i.supplierName ? ` · ${i.supplierName}` : ''}
                  </span>
                </span>
                <span className="fb-price text-body">{rupees(i.finalLineTotal ?? i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-base text-ink-2">
            <Row label={t.cart.itemsTotal} value={rupees(order.finalItemsTotal ?? order.itemsTotal)} />
            <Row label={t.cart.deliveryFee} value={Number(order.deliveryFee) === 0 ? t.cart.free : rupees(order.deliveryFee)} />
            {Number(order.visitingCharge) > 0 ? <Row label={t.cart.visiting} value={rupees(order.visitingCharge)} /> : null}
            {Number(order.discount) > 0 ? <Row label={t.cart.discount} value={`− ${rupees(order.discount)}`} tone="ok" /> : null}
            {Number(order.walletUsed) > 0 ? <Row label={t.cart.wallet} value={`− ${rupees(order.walletUsed)}`} /> : null}
            <Row label={t.cart.grandTotal} value={rupees(order.payable)} strong />
            <Row label={t.order.payMode} value={order.paymentMethod === 'COD' ? t.order.cod : t.order.upi} />
          </dl>
        </section>

        <div className="space-y-4">
          <section className="fb-card p-4">
            <h2 className="fb-display mb-2 flex items-center gap-2 text-xl">
              <Icon name="map-pin" size={20} className="text-au-600" /> {t.order.shipTo}
            </h2>
            <p className="text-body font-semibold text-ink">
              {ship.name} · <span className="tabular-nums">{ship.phone}</span>
            </p>
            {ship.guardianName ? <p className="text-base text-ink-2">{t.addr2.guardian}: {ship.guardianName}</p> : null}
            <p className="text-base text-ink-2">{[ship.line1, ship.landmark, ship.village, ship.district, ship.pincode].filter(Boolean).join(', ')}</p>
            {ship.directions ? <p className="mt-1 text-base text-ink-2">{t.addr2.directions}: {ship.directions}</p> : null}
            {ship.altPhone ? <p className="text-base text-ink-2">{t.addr2.altPhone}: <span className="tabular-nums">{ship.altPhone}</span></p> : null}
            {ship.mapsUrl ? (
              <a href={ship.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-base font-semibold text-em-700">
                <Icon name="external-link" size={16} /> {t.order.openMap}
              </a>
            ) : null}
          </section>

          <section className="fb-card p-4">
            <h2 className="fb-display mb-3 text-xl">{t.order.progress}</h2>
            <ol className="relative space-y-3 border-l-2 border-em-200 pl-4">
              {order.timeline.map((s, n) => (
                <li key={`${s.status}-${s.at}`} className="relative text-base">
                  <span aria-hidden="true" className={`absolute -left-[23px] top-1.5 h-3 w-3 rounded-full ring-4 ring-card ${n === order.timeline.length - 1 ? 'bg-au-500' : 'bg-em-600'}`} />
                  <span className="block font-semibold text-ink">{s.labelHi}</span>
                  <span className="block text-sm text-ink-3">{formatDate(s.at, lang)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/mera/order/${encodeURIComponent(order.orderNumber)}/bill`} className={buttonClass('secondary', 'sm')}>
          <Icon name="receipt" size={16} /> {t.order.bill}
        </Link>
        <OrderActions lang={lang} order={order} supportPhone={settings.supportPhone} />
      </div>
    </div>
  );
}
