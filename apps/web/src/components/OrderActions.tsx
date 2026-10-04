'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderDetail } from '@fb/shared-types';
import { call, errText } from '@/lib/client';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';
import { buttonClass } from './ui';

/** Cancel / reorder / review — teeno actions server pe validate hote hain (A15 §PERMISSIONS). */
export function OrderActions({ lang, order, supportPhone }: { lang: Lang; order: OrderDetail; supportPhone: string }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(0);

  async function run(fn: () => Promise<void>): Promise<void> {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {order.canCancel ? (
        <button
          type="button"
          disabled={busy}
          className={buttonClass('danger', 'sm')}
          onClick={() =>
            void run(async () => {
              if (!window.confirm(t.order.cancelConfirm)) return;
              await call(`/orders/${order.orderNumber}/cancel`, { method: 'POST', body: { reason: 'customer' } });
            })
          }
        >
          {t.order.cancel}
        </button>
      ) : null}

      <button
        type="button"
        disabled={busy}
        className={buttonClass('secondary', 'sm')}
        onClick={() =>
          void run(async () => {
            await call(`/orders/${order.orderNumber}/reorder`, { method: 'POST', body: {} });
            router.push('/cart');
          })
        }
      >
        <Icon name="refresh" size={16} /> {t.order.reorder}
      </button>

      <a href={`tel:+91${supportPhone}`} className={buttonClass('ghost', 'sm')}>
        <Icon name="phone" size={16} /> {t.common.call}
      </a>

      {order.canReview ? (
        <div className="flex w-full items-center gap-2">
          <div className="flex" role="group" aria-label={t.order.review}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-label={`${n} / 5`} aria-pressed={n <= rating} onClick={() => setRating(n)} className="fb-tap grid place-items-center">
                <Icon name={n <= rating ? 'star-filled' : 'star'} size={26} className={n <= rating ? 'text-au-500' : 'text-line-2'} />
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || rating === 0}
            className={buttonClass('primary', 'sm')}
            onClick={() =>
              void run(async () => {
                await call(`/orders/${order.orderNumber}/review`, { method: 'POST', body: { targetType: 'ORDER', rating } });
              })
            }
          >
            {t.order.review}
          </button>
        </div>
      ) : null}

      {err ? <p className="w-full text-base text-danger">{err}</p> : null}
    </div>
  );
}
