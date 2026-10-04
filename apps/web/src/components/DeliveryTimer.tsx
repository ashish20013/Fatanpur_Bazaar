'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderDetail, OrderStatus } from '@fb/shared-types';
import { call } from '@/lib/client';
import { formatDate } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';

const DONE: OrderStatus[] = ['DELIVERED', 'COMPLETED'];
const DEAD: OrderStatus[] = ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED', 'RETURNED'];

/**
 * Owner's timer: after the order, a 30-minute countdown in GREEN; when it runs out, another 30 in
 * YELLOW; the moment the delivery partner marks it delivered → "सफलतापूर्वक डिलीवर हो गया".
 * Time comes from the SERVER (clockStartAt + serverNow) — many village phones have a wrong clock,
 * so we only use the phone to count seconds, never to know what time it is.
 * Status is re-checked every 20 s (and instantly via the tracking socket when a rider is live).
 */
export function DeliveryTimer({
  lang,
  orderNumber,
  status: initialStatus,
  paymentStatus,
  paymentMethod,
  clockStartAt,
  deliveredAt,
  serverNow,
  minutes,
  supportPhone,
}: {
  lang: Lang;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  paymentMethod: string;
  clockStartAt: string;
  deliveredAt: string | null;
  serverNow: string;
  minutes: number;
  supportPhone: string;
}): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const offset = useRef(new Date(serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now() + offset.current);
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => setStatus(initialStatus), [initialStatus]);
  useEffect(() => {
    if (DONE.includes(status) || DEAD.includes(status)) return;
    const tick = setInterval(() => setNow(Date.now() + offset.current), 1000);
    const poll = setInterval(async () => {
      try {
        const o = await call<OrderDetail>(`/orders/${orderNumber}`);
        if (o.status !== status) {
          setStatus(o.status);
          router.refresh();
        }
      } catch {
        /* a flaky network just waits for the next poll */
      }
    }, 20_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [status, orderNumber, router]);

  if (DONE.includes(status)) {
    return (
      <section className="overflow-hidden rounded-[22px] bg-em-700 text-white shadow-2" aria-live="polite">
        <div className="flex items-center gap-4 px-5 py-6">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-au-300 text-em-900">
            <Icon name="circle-check" size={38} />
          </span>
          <div>
            <p className="fb-display text-2xl leading-tight text-[#fbf4df]">{t.timer.delivered}</p>
            <p className="text-base text-em-100">{deliveredAt ? formatDate(deliveredAt, lang) : t.timer.deliveredSub}</p>
          </div>
        </div>
      </section>
    );
  }
  if (DEAD.includes(status)) {
    return (
      <section className="rounded-[22px] border border-line bg-card p-5 text-center">
        <p className="text-lg font-semibold text-danger">{t.timer.cancelled}</p>
      </section>
    );
  }
  if (status === 'PENDING_PAYMENT' && paymentMethod !== 'COD') {
    return (
      <section className="flex items-center gap-3 rounded-[22px] border border-au-300 bg-au-50 p-5">
        <Icon name="hourglass" size={28} className="shrink-0 text-au-700" />
        <p className="text-body font-semibold text-au-800">{paymentStatus === 'AWAITING_VERIFICATION' ? t.payment.claimed : t.timer.waitingPay}</p>
      </section>
    );
  }

  const phaseMs = minutes * 60_000;
  const elapsed = Math.max(0, now - new Date(clockStartAt).getTime());
  const phase = elapsed < phaseMs ? 1 : elapsed < 2 * phaseMs ? 2 : 3;
  const left = phase === 1 ? phaseMs - elapsed : phase === 2 ? 2 * phaseMs - elapsed : 0;
  const frac = phase === 3 ? 0 : left / phaseMs;
  const mm = String(Math.floor(left / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');
  const color = phase === 1 ? { ring: '#1e8a4c', bg: 'bg-em-50', text: 'text-em-800', border: 'border-em-200' } : { ring: '#d4a017', bg: 'bg-[#fff6d9]', text: 'text-[#7a5a00]', border: 'border-[#f1d98a]' };
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <section className={`rounded-[22px] border p-5 ${phase === 3 ? 'border-au-300 bg-au-50' : `${color.border} ${color.bg}`}`} aria-live="polite">
      <p className="text-sm font-semibold text-ink-2">{t.timer.title}</p>
      {phase === 3 ? (
        <div className="mt-2 space-y-3">
          <p className="text-body text-au-800">{t.timer.late}</p>
          {supportPhone ? (
            <a href={`tel:+91${supportPhone}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-em-700 px-5 text-base font-semibold text-white no-underline">
              <Icon name="phone" size={18} /> {t.timer.callShop}
            </a>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-5">
          <svg suppressHydrationWarning width="128" height="128" viewBox="0 0 128 128" className="shrink-0" role="img" aria-label={`${mm}:${ss} ${t.timer.left}`}>
            <circle cx="64" cy="64" r={R} fill="none" stroke="#e8e2d0" strokeWidth="10" />
            <circle cx="64" cy="64" r={R} fill="none" stroke={color.ring} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 64 64)" />
            <text suppressHydrationWarning x="64" y="62" textAnchor="middle" fontSize="28" fontWeight="600" fill="#16261c" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {mm}:{ss}
            </text>
            <text x="64" y="84" textAnchor="middle" fontSize="12" fill="#5f6b62">
              {t.timer.left}
            </text>
          </svg>
          <div className="min-w-0">
            <p className={`fb-display text-2xl leading-tight ${color.text}`}>{phase === 1 ? t.timer.phase1 : t.timer.phase2}</p>
            <p className="mt-1 text-base text-ink-2">{t.order.number}: <span className="font-semibold tabular-nums">{orderNumber}</span></p>
          </div>
        </div>
      )}
    </section>
  );
}
