'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORDER_STATUS_LABEL_EN, ORDER_TRANSITIONS, type OrderDetail, type OrderStatus } from '@fb/shared-types';
import { call, errText } from '@/lib/client';
import { rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { buttonClass } from '../ui';

interface Rider {
  id: number;
  name: string | null;
  phone: string;
  onDuty: 0 | 1;
}

/**
 * A15/A16/A18 admin actions.
 * ⚠️ Agla status shared-types ki state machine se aata hai — UI apni list nahi banati,
 *    warna frontend aur backend alag ho jaate hain (compile error hi nahi milta).
 * ⚠️ Adjustment me matra sirf GHAT sakti hai, aur delivery fee kabhi nahi badhti (A16).
 */
export function OrderAdmin({ lang, order, riders }: { lang: Lang; order: OrderDetail; riders: Rider[] }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [riderId, setRiderId] = useState<number | ''>('');
  const [adjust, setAdjust] = useState<Record<number, number>>({});
  const [showAdjust, setShowAdjust] = useState(false);

  // ⚠️ Allowed next statuses shared state machine se — UI apni list nahi banati.
  const next: readonly OrderStatus[] = ORDER_TRANSITIONS[order.orderType][order.status] ?? [];

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

  const adjustedTotal = order.items
    .filter((i) => !i.isRemoved)
    .reduce((sum, i) => {
      const q = adjust[i.id] ?? Number(i.finalQuantity ?? i.quantity);
      return sum + Math.round(Number(i.unitPrice) * 100) * q;
    }, 0);

  return (
    <div className="space-y-4">
      <section className="fb-card space-y-2 p-3">
        <h2 className="text-lg">{t.staff.changeStatus}</h2>
        <div className="flex flex-wrap gap-2">
          {next.length ? (
            next.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                className={buttonClass(s === 'CANCELLED' || s === 'REJECTED' ? 'danger' : 'primary', 'sm')}
                onClick={() =>
                  void run(async () => {
                    await call(`/admin/orders/${order.orderNumber}/status`, { method: 'PATCH', body: { status: s } });
                  })
                }
              >
                {ORDER_STATUS_LABEL_EN[s] ?? s}
              </button>
            ))
          ) : (
            <p className="text-base text-ink-2">{t.staff.noRows}</p>
          )}
        </div>
      </section>

      <section className="fb-card space-y-2 p-3">
        <h2 className="text-lg">{t.staff.assign}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={riderId} onChange={(e) => setRiderId(Number(e.target.value) || '')} aria-label={t.staff.assign} className="h-12 rounded border border-line px-3 text-body">
            <option value="">—</option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name ?? r.phone} {r.onDuty ? '' : `(${t.staff.dutyOff})`}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !riderId}
            className={buttonClass('primary', 'sm')}
            onClick={() =>
              void run(async () => {
                await call(`/admin/orders/${order.orderNumber}/assign`, { method: 'POST', body: { riderId } });
              })
            }
          >
            {t.staff.assign}
          </button>
          <button
            type="button"
            disabled={busy || !riderId}
            className={buttonClass('secondary', 'sm')}
            onClick={() =>
              void run(async () => {
                await call(`/admin/orders/${order.orderNumber}/reassign`, { method: 'POST', body: { riderId, reason: 'admin' } });
              })
            }
          >
            {t.staff.reassign}
          </button>
        </div>
      </section>

      <section className="fb-card space-y-2 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{t.staff.adjust}</h2>
          <button type="button" onClick={() => setShowAdjust(!showAdjust)} className={buttonClass('ghost', 'sm')}>
            {showAdjust ? t.common.close : t.address.edit}
          </button>
        </div>
        {showAdjust ? (
          <>
            <p className="text-base text-ink-2">{t.staff.adjustHint}</p>
            <ul className="divide-y divide-line">
              {order.items.map((i) => {
                const ordered = Number(i.finalQuantity ?? i.quantity);
                const value = adjust[i.id] ?? ordered;
                return (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block text-base">{i.nameHi ?? i.name}</span>
                      <span className="block text-sm text-ink-3">
                        {i.unit} × {ordered} · {rupees(i.unitPrice)}
                      </span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={ordered}
                      value={value}
                      aria-label={i.name}
                      onChange={(e) => {
                        /*
                         * An empty box is "still typing", not "remove this item". `Number('')` is 0,
                         * so clearing the field to type a new number used to mark the line for
                         * removal, and pressing Save in that moment took it off the order.
                         */
                        const raw = e.target.value.trim();
                        if (raw === '') {
                          const next = { ...adjust };
                          delete next[i.id];
                          setAdjust(next);
                          return;
                        }
                        const n = Math.floor(Number(raw));
                        if (!Number.isFinite(n)) return;
                        setAdjust({ ...adjust, [i.id]: Math.max(0, Math.min(ordered, n)) });
                      }}
                      className="h-10 w-20 rounded border border-line px-2 text-base"
                    />
                  </li>
                );
              })}
            </ul>
            <p className="text-body font-semibold">
              {/* Items only — the delivery fee, any coupon and wallet money are settled by the server,
                  so this is labelled for what it is rather than as the customer's new bill. */}
              {t.staff.newItemsTotal}: <span className="fb-price">{rupees((adjustedTotal / 100).toFixed(2))}</span>
            </p>
            <button
              type="button"
              disabled={busy}
              className={buttonClass('primary', 'sm')}
              onClick={() =>
                void run(async () => {
                  const items = Object.entries(adjust).map(([itemId, q]) => ({ itemId: Number(itemId), finalQuantity: q, remove: q === 0 }));
                  if (!items.length) return;
                  await call(`/admin/orders/${order.orderNumber}/adjust`, { method: 'POST', body: { items } });
                  setShowAdjust(false);
                  setAdjust({});
                })
              }
            >
              {t.common.save}
            </button>
          </>
        ) : null}
      </section>

      {order.paymentMethod !== 'COD' && order.paymentStatus !== 'PAID' ? (
        <button
          type="button"
          disabled={busy}
          className={buttonClass('secondary', 'sm')}
          onClick={() =>
            void run(async () => {
              await call(`/admin/orders/${order.orderNumber}/convert-cod`, { method: 'POST', body: {} });
            })
          }
        >
          {t.staff.convertCod}
        </button>
      ) : null}

      {err ? <p className="text-base font-semibold text-danger">{err}</p> : null}
    </div>
  );
}
