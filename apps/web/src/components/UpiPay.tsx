'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UpiDetails } from '@fb/shared-types';
import { call, errText } from '@/lib/client';
import { rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { Icon } from './icons';
import { buttonClass } from './ui';

/**
 * A17 (UPI direct, HDFC) — pay, then one tap.
 *
 * This screen used to demand the UTR number before it would record anything: pay in GPay, switch
 * back, find the reference number, type twelve characters correctly. That is four steps too many
 * for a customer who has already paid, and the ones who gave up left an order stuck at
 * PENDING_PAYMENT with the money already sent — the worst outcome for everyone.
 *
 * Now the button says what the customer just did. Tapping it records the payment and, under
 * `upi_auto_accept_limit`, confirms the order immediately. The UTR is still offered, folded away,
 * because it makes the shopkeeper's check quicker — but it never stands between a paying customer
 * and his order.
 *
 * ⚠️ A plain UPI VPA cannot tell a website that money arrived — there is no callback to listen to.
 * So the shopkeeper still eyeballs his bank app and presses Verify; that is what
 * `payments.verify` is for, and it is the only real protection a direct-VPA shop has. True
 * automatic confirmation needs a payment gateway, whose driver is already written and switched off
 * (`gateway_enabled`).
 */
export function UpiPay({ lang, orderNumber, upi }: { lang: Lang; orderNumber: string; upi: UpiDetails }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [utr, setUtr] = useState('');
  const [showUtr, setShowUtr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Through the BFF, so the browser's session cookie authenticates it. Pointed straight at the API
  // the <img> carried no token and every customer saw a broken-image box where the QR should be.
  const qr = `/api/bff/payments/upi-qr/${encodeURIComponent(orderNumber)}.png`;

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-em-300 bg-g-50 px-4 py-3 text-base font-semibold text-em-800">
        <Icon name="circle-check" size={20} className="shrink-0" /> {t.payment.confirmed}
      </p>
    );
  }

  async function confirmPaid(): Promise<void> {
    const v = utr.trim();
    // Typed but malformed is worth saying; leaving it empty is not an error at all.
    if (v && !/^[A-Za-z0-9]{10,22}$/.test(v)) {
      setErr(t.payment.utr);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await call('/payments/upi/claim', { method: 'POST', body: v ? { orderNumber, utr: v } : { orderNumber } });
      setDone(true);
      router.refresh();
    } catch (e) {
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="fb-card space-y-3 p-4 sm:p-5">
      <h2 className="fb-display flex items-center gap-2 text-xl">
        <Icon name="qrcode" size={22} className="text-au-600" /> {t.payment.upiTitle}
      </h2>
      <p className="text-base text-ink-2">
        {t.payment.payTo}: <span className="font-semibold">{upi.payeeName}</span> · <span className="font-mono">{upi.vpa}</span>
      </p>
      <p className="fb-price text-3xl text-em-800">{rupees(upi.amount)}</p>

      {/* Step 1 — pay. On a phone the UPI app opens; on a desktop there is the QR. */}
      <a href={upi.intentUrl} className={`${buttonClass('primary', 'md', true)} sm:hidden`}>
        {t.payment.openApp}
      </a>
      <div className="hidden sm:block">
        <p className="mb-1 text-base text-ink-2">{t.payment.scan}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={t.payment.scan} width={220} height={220} className="rounded-xl border border-line bg-white p-2 shadow-1" />
      </div>

      {/* Step 2 — say so. One tap, and the order is confirmed. */}
      <div className="border-t border-line pt-3">
        <button type="button" disabled={busy} onClick={() => void confirmPaid()} className={buttonClass('primary', 'lg', true)}>
          <Icon name="circle-check" size={20} /> {busy ? t.payment.confirming : t.payment.paidCta}
        </button>
        <p className="mt-1.5 text-center text-sm text-ink-3">{t.payment.paidHint}</p>
      </div>

      {/* Optional, and out of the way — it helps the shopkeeper, it is not the customer's job. */}
      {showUtr ? (
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-2" htmlFor="fb-utr">
            {t.payment.utrOptional}
          </label>
          <input
            id="fb-utr"
            value={utr}
            onChange={(e) => setUtr(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
            maxLength={22}
            placeholder="426512345678"
            inputMode="text"
            autoComplete="off"
            className="h-12 w-full rounded border border-line-2 bg-card px-3 text-body tabular-nums outline-none focus:border-em-600"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowUtr(true)} className="text-sm text-ink-3 underline underline-offset-2">
          {t.payment.utrOptional}
        </button>
      )}

      {err ? <p className="text-base text-danger">{err}</p> : null}
    </section>
  );
}
