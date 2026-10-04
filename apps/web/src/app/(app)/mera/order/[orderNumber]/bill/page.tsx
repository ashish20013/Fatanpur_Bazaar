import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { OrderDetail } from '@fb/shared-types';
import { Icon } from '@/components/icons';
import { PrintButton } from '@/components/PrintButton';
import { buttonClass } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { authed, getSettings } from '@/lib/data';
import { formatDate, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { currentLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Printable bill. Rendered on our own origin with the session cookie (the old link pointed straight
 * at the API, where the browser has no bearer token, so it always failed). Totals follow A16:
 * final_* ?? original.
 */
export default async function BillPage({ params }: { params: Promise<{ orderNumber: string }> }): Promise<ReactNode> {
  const { orderNumber } = await params;
  const [lang, settings] = await Promise.all([currentLang(), getSettings()]);
  const t = dict(lang);
  let o: OrderDetail;
  try {
    o = await authed<OrderDetail>(`/orders/${encodeURIComponent(orderNumber)}/bill`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const items = o.items.filter((i) => !i.isRemoved);

  return (
    <div className="space-y-4">
      <div className="fb-noprint flex flex-wrap gap-2">
        <Link href={`/mera/order/${encodeURIComponent(o.orderNumber)}`} className={buttonClass('secondary', 'sm')}>
          <Icon name="arrow-left" size={16} /> {t.order.backToOrder}
        </Link>
        <PrintButton label={t.order.printBill} />
      </div>

      <article className="fb-print mx-auto max-w-[720px] rounded-xl border border-line bg-white p-5 text-ink sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-em-700 pb-4">
          <div>
            <p className="fb-display text-2xl text-em-800">फतनपुर बाज़ार</p>
            <p className="text-sm text-ink-2">Fatanpur Bazaar, Raniganj, Pratapgarh, Uttar Pradesh — 230301</p>
            {settings.supportPhone ? <p className="text-sm text-ink-2">+91 {settings.supportPhone}</p> : null}
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{lang === 'hi' ? 'बिल' : 'Bill'} · {o.orderNumber}</p>
            <p className="text-ink-2">{formatDate(o.placedAt, lang)}</p>
            <p className="text-ink-2">{o.statusLabelHi}</p>
          </div>
        </header>

        <section className="mt-4 text-sm">
          <p className="font-semibold">{o.ship.name} · {o.ship.phone}</p>
          <p className="text-ink-2">{[o.ship.line1, o.ship.landmark, o.ship.village, o.ship.district, o.ship.pincode].filter(Boolean).join(', ')}</p>
        </section>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-2">
              <th className="py-2 pr-2 font-semibold">{t.order.items}</th>
              <th className="py-2 pr-2 text-right font-semibold">{lang === 'hi' ? 'मात्रा' : 'Qty'}</th>
              <th className="py-2 pr-2 text-right font-semibold">{lang === 'hi' ? 'दर' : 'Rate'}</th>
              <th className="py-2 text-right font-semibold">{lang === 'hi' ? 'रकम' : 'Amount'}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-line/70">
                <td className="py-2 pr-2">{lang === 'hi' ? (i.nameHi ?? i.name) : i.name} <span className="text-ink-3">({i.unit})</span></td>
                <td className="py-2 pr-2 text-right tabular-nums">{i.finalQuantity ?? i.quantity}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{rupees(i.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{rupees(i.finalLineTotal ?? i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 max-w-[300px] space-y-1 text-sm">
          <div className="flex justify-between"><dt>{t.cart.itemsTotal}</dt><dd className="tabular-nums">{rupees(o.finalItemsTotal ?? o.itemsTotal)}</dd></div>
          <div className="flex justify-between"><dt>{t.cart.deliveryFee}</dt><dd className="tabular-nums">{rupees(o.deliveryFee)}</dd></div>
          {Number(o.visitingCharge) > 0 ? <div className="flex justify-between"><dt>{t.cart.visiting}</dt><dd className="tabular-nums">{rupees(o.visitingCharge)}</dd></div> : null}
          {Number(o.discount) > 0 ? <div className="flex justify-between"><dt>{t.cart.discount}</dt><dd className="tabular-nums">− {rupees(o.discount)}</dd></div> : null}
          {Number(o.walletUsed) > 0 ? <div className="flex justify-between"><dt>{t.cart.wallet}</dt><dd className="tabular-nums">− {rupees(o.walletUsed)}</dd></div> : null}
          <div className="flex justify-between border-t-2 border-em-700 pt-1.5 text-base font-semibold"><dt>{t.cart.grandTotal}</dt><dd className="tabular-nums">{rupees(o.payable)}</dd></div>
          <div className="flex justify-between text-ink-2"><dt>{t.order.payMode}</dt><dd>{o.paymentMethod === 'COD' ? t.order.cod : t.order.upi} · {o.paymentStatus === 'PAID' ? (lang === 'hi' ? 'भुगतान हो गया' : 'Paid') : lang === 'hi' ? 'बाकी' : 'Due'}</dd></div>
        </dl>

        <p className="mt-6 border-t border-line pt-3 text-center text-xs text-ink-3">{t.timer.deliveredSub}</p>
      </article>
    </div>
  );
}
