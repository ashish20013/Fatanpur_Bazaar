'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AddressView, PaymentMethod, PlaceOrderResponse, QuoteResponse, ServiceabilityResult } from '@fb/shared-types';
import { publishCart } from '@/lib/cart-bus';
import { call, ClientError, errText, newIdempotencyKey, savePrefs } from '@/lib/client';
import { rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { AddressForm, type AddressDefaults } from './AddressForm';
import { SorryScreen } from './area';
import { Icon } from './icons';
import { ProductVisual } from './ProductVisual';
import { Badge, buttonClass, Skeleton } from './ui';

export type AddressAPI = AddressView;

export interface CheckoutLine {
  productId: number;
  quantity: number;
  name: string;
  nameHi: string | null;
  unit: string;
  lineTotal: string;
  image: string | null;
  icon?: string | null;
  family?: string | null;
}

interface Props {
  lang: Lang;
  lines: CheckoutLine[];
  addresses: AddressView[];
  preferredAddressId: number | null;
  walletBalance: string;
  codEnabled: boolean;
  upiEnabled: boolean;
  supportPhone: string;
  defaults: AddressDefaults;
  /** Service booking (not from the bag): one service + a chosen slot. */
  slot?: { date: string; start: string; label: string } | null;
}

const addrText = (a: AddressView): string => [a.line1, a.landmark, a.villageNameHi ?? a.villageName ?? a.areaText].filter(Boolean).join(', ');

/**
 * Checkout = the owner's last three steps on ONE page: ① पता ② भुगतान ③ ऑर्डर पक्का.
 * Returning customers: default address + COD are pre-selected → one tap. Desktop: two columns with
 * a sticky order summary (the old page had a fixed bar that floated in mid-air on desktop).
 * Every rupee shown comes from the server quote (A12) — the client never computes totals.
 */
export function Checkout({ lang, lines, addresses, preferredAddressId, walletBalance, codEnabled, upiEnabled, supportPhone, defaults, slot = null }: Props): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [list, setList] = useState(addresses);
  const firstOk = (id: number | null): number | null =>
    list.find((a) => a.id === id && a.isServiceable)?.id ?? list.find((a) => a.isDefault && a.isServiceable)?.id ?? list.find((a) => a.isServiceable)?.id ?? null;
  const [addressId, setAddressId] = useState<number | null>(() => firstOk(preferredAddressId));
  const [adding, setAdding] = useState(addresses.length === 0);
  const [method, setMethod] = useState<PaymentMethod>(codEnabled ? 'COD' : 'UPI');
  const [useWallet, setUseWallet] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [sorry, setSorry] = useState<ServiceabilityResult | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);
  // ONE idempotency key for the whole checkout — a retry never makes a second order (A14 §3).
  const [idemKey] = useState(() => newIdempotencyKey());

  const items = useMemo(() => lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), [lines]);
  const current = list.find((a) => a.id === addressId) ?? null;

  const refreshQuote = useCallback(async (): Promise<void> => {
    if (!addressId) return;
    setQuoteErr(null);
    try {
      const q = await call<QuoteResponse>('/orders/quote', {
        method: 'POST',
        body: { addressId, items, couponCode: appliedCoupon ?? undefined, useWallet, paymentMethod: method, orderType: slot ? 'SERVICE' : undefined },
      });
      setQuote(q);
    } catch (e) {
      setQuote(null);
      if (e instanceof ClientError && e.code === 'OUT_OF_SERVICE_AREA') {
        setSorry({
          serviceable: false,
          method: 'UNKNOWN',
          zoneId: null,
          reason: 'OUT_OF_AREA',
          needsVillagePick: false,
          flagNewArea: false,
          distanceKm: typeof e.data?.distanceKm === 'number' ? e.data.distanceKm : null,
          etaMinutes: 0,
          deliveryFee: '0.00',
          minOrder: '0.00',
          servedAreas: Array.isArray(e.data?.servedAreas) ? (e.data.servedAreas as string[]) : [],
          nearestServedKm: typeof e.data?.nearestServedKm === 'number' ? e.data.nearestServedKm : null,
        });
      }
      if (e instanceof ClientError && e.code === 'COUPON_INVALID') setAppliedCoupon(null);
      setQuoteErr(errText(e, lang));
    }
  }, [addressId, appliedCoupon, useWallet, method, items, slot, lang]);

  useEffect(() => {
    void refreshQuote();
  }, [refreshQuote]);

  async function place(): Promise<void> {
    if (!addressId || !quote) return;
    setPlacing(true);
    setPlaceErr(null);
    try {
      const r = await call<PlaceOrderResponse>('/orders', {
        method: 'POST',
        idempotencyKey: idemKey,
        body: {
          addressId,
          items,
          couponCode: appliedCoupon ?? undefined,
          useWallet,
          paymentMethod: method,
          note: note.trim() || undefined,
          orderType: slot ? 'SERVICE' : undefined,
          slot: slot ? { date: slot.date, start: slot.start } : undefined,
        },
      });
      if (!slot) publishCart({ items: [], itemsTotal: '0.00', itemCount: 0, needsPrescription: false, warnings: [] });
      router.push(`/mera/order/${r.orderNumber}?placed=1`);
    } catch (e) {
      setPlaceErr(errText(e, lang));
      if (e instanceof ClientError && e.code === 'OUT_OF_SERVICE_AREA') void refreshQuote();
      setPlacing(false);
    }
  }

  const stepCls = (on: boolean): string => `grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${on ? 'bg-em-700 text-au-200' : 'bg-paper-2 text-ink-3'}`;
  const payCard = (m: PaymentMethod, icon: string, title: string, hint: string): React.ReactNode => (
    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors duration-150 ${method === m ? 'border-em-600 bg-em-50 ring-1 ring-em-600' : 'border-line-2 bg-card hover:border-em-300'}`}>
      <input type="radio" name="pay" className="h-5 w-5 accent-[#1c5735]" checked={method === m} onChange={() => setMethod(m)} />
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-au-50 text-em-700 ring-1 ring-au-200">
        <Icon name={icon} size={20} />
      </span>
      <span>
        <span className="block text-body font-semibold">{title}</span>
        <span className="block text-sm text-ink-3">{hint}</span>
      </span>
    </label>
  );

  const summary = (
    <div className="space-y-3">
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <li key={l.productId} className="flex items-center gap-3 py-2">
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
              <ProductVisual name={l.name} nameHi={l.nameHi} image={l.image} icon={l.icon} family={l.family} lang={lang} size="xs" width={96} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold">{lang === 'hi' ? (l.nameHi ?? l.name) : l.name}</span>
              <span className="block text-sm text-ink-3">
                {slot ? slot.label : `${l.quantity} × ${l.unit}`}
              </span>
            </span>
            {!slot ? <span className="fb-price text-base">{rupees(l.lineTotal)}</span> : null}
          </li>
        ))}
      </ul>
      <div className="space-y-1.5 border-t border-line pt-3">
        {quote ? (
          <>
            {quote.breakdown.map((b) => {
              // "डिलीवरी शुल्क ₹0" reads as a charge that happens to be nothing. The shop makes a
              // promise here — no delivery charge, ever — so the line says so in words.
              const zero = Number(b.amount) === 0;
              return (
                <div key={b.label} className="flex justify-between text-base text-ink-2">
                  <span>{b.label}</span>
                  <span className={zero ? 'font-semibold text-em-700' : 'tabular-nums'}>{zero ? t.cart.free : rupees(b.amount)}</span>
                </div>
              );
            })}
            <div className="flex items-baseline justify-between border-t border-dashed border-line-2 pt-2">
              <span className="text-body font-semibold">{t.cart.grandTotal}</span>
              <span className="fb-price text-2xl">{rupees(quote.grandTotal)}</span>
            </div>
            <p className="flex items-center gap-1.5 text-sm text-em-700">
              <Icon name="scooter" size={16} /> {t.checkout.eta(quote.etaMinutes)}
            </p>
            {quote.warnings.map((w) => {
              // The server sends codes, not sentences, so both languages read the same rule.
              // "Shop is shut" is the one a customer must not miss, so it gets a real notice.
              const closed = w.startsWith('CLOSED_NOW:');
              return closed ? (
                <p key={w} className="flex items-start gap-2 rounded-lg border border-au-200 bg-au-50 px-3 py-2 text-base text-au-800">
                  <Icon name="clock" size={18} className="mt-0.5 shrink-0" />
                  <span>{t.checkout.closedNow(w.slice('CLOSED_NOW:'.length))}</span>
                </p>
              ) : (
                <p key={w} className="text-sm text-au-800">
                  {w}
                </p>
              );
            })}
          </>
        ) : quoteErr ? (
          <p className="rounded-lg bg-[#fdf3f2] px-3 py-2 text-base font-semibold text-danger">{quoteErr}</p>
        ) : addressId ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <p className="text-base text-ink-3">{t.area.picker}</p>
        )}
      </div>
    </div>
  );

  const canPlace = Boolean(quote && current?.isServiceable && !placing && !adding);

  return (
    <div className="fb-container pb-32 pt-4 lg:pb-10">
      <h1 className="fb-display text-3xl">{t.checkout.title}</h1>
      <ol className="mt-3 flex items-center gap-2 text-sm text-ink-2" aria-label={t.bag.steps}>
        <li className="flex items-center gap-1.5">
          <span className={stepCls(true)}>1</span> {t.checkout.address}
        </li>
        <li aria-hidden="true" className="h-px w-6 bg-line-2" />
        <li className="flex items-center gap-1.5">
          <span className={stepCls(Boolean(addressId) && !adding)}>2</span> {t.checkout.payment}
        </li>
        <li aria-hidden="true" className="h-px w-6 bg-line-2" />
        <li className="flex items-center gap-1.5">
          <span className={stepCls(Boolean(quote))}>3</span> {t.checkout.place}
        </li>
      </ol>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-5">
          <section className="fb-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
              <Icon name="map-pin" size={20} className="text-au-600" /> {t.checkout.address}
            </h2>
            {adding ? (
              <AddressForm
                lang={lang}
                defaults={defaults}
                onSaved={(a) => {
                  setList([a, ...list.filter((x) => x.id !== a.id)]);
                  if (a.isServiceable) setAddressId(a.id);
                  setAdding(false);
                  void savePrefs({ addressId: a.id });
                }}
                onCancel={list.length ? () => setAdding(false) : undefined}
                onOutOfArea={(r) => setSorry(r)}
              />
            ) : (
              <>
                <ul className="space-y-2">
                  {list.map((a) => (
                    <li key={a.id}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors duration-150 ${addressId === a.id ? 'border-em-600 bg-em-50 ring-1 ring-em-600' : 'border-line-2 hover:border-em-300'} ${a.isServiceable ? '' : 'cursor-not-allowed bg-paper-2 text-ink-2'}`}>
                        <input type="radio" name="address" className="mt-1 h-5 w-5 accent-[#1c5735]" checked={addressId === a.id} disabled={!a.isServiceable} onChange={() => setAddressId(a.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-body font-semibold">
                            {a.receiverName}
                            {a.guardianName ? <span className="font-normal text-ink-3"> · {a.guardianName}</span> : null} · {a.phone}
                          </span>
                          <span className="block text-base text-ink-2">{addrText(a)}</span>
                          {a.directions ? <span className="block text-sm text-ink-3">{a.directions}</span> : null}
                          {!a.isServiceable ? <Badge tone="danger">{t.checkout.notServiceable}</Badge> : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setAdding(true)} className={`${buttonClass('secondary', 'md')} mt-3`}>
                  <Icon name="plus" size={18} /> {t.checkout.addAddress.replace(/^\+\s*/, '')}
                </button>
              </>
            )}
          </section>

          <section className="fb-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
              <Icon name="wallet" size={20} className="text-au-600" /> {t.checkout.payment}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {codEnabled ? payCard('COD', 'cash-banknote', t.checkout.cod, t.checkout.codHint) : null}
              {upiEnabled ? payCard('UPI', 'qrcode', t.checkout.upi, t.checkout.upiHint) : null}
            </div>
            {Number(walletBalance) > 0 ? (
              <label className="mt-3 flex items-center gap-2 text-base">
                <input type="checkbox" className="h-5 w-5 accent-[#1c5735]" checked={useWallet} onChange={(e) => setUseWallet(e.target.checked)} />
                {t.cart.wallet} ({rupees(walletBalance)})
              </label>
            ) : null}

            <details className="group mt-4 rounded-xl border border-line px-3.5 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-em-800">
                <span className="flex items-center gap-2">
                  <Icon name="ticket" size={18} /> {t.checkout.coupon}
                  {appliedCoupon && quote && Number(quote.discount) > 0 ? <Badge tone="ok">{appliedCoupon}</Badge> : null}
                </span>
                <Icon name="chevron-down" size={18} className="transition-transform duration-150 group-open:rotate-180" />
              </summary>
              <div className="mt-3 flex gap-2">
                <input
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase().slice(0, 30))}
                  placeholder={t.checkout.couponPlaceholder}
                  aria-label={t.checkout.coupon}
                  className="h-12 min-w-0 flex-1 rounded-xl border border-line-2 bg-card px-3 text-body uppercase outline-none focus:border-em-600"
                />
                <button type="button" onClick={() => setAppliedCoupon(coupon.trim() || null)} className={buttonClass('secondary', 'md')}>
                  {t.checkout.apply}
                </button>
              </div>
              {appliedCoupon && quote && Number(quote.discount) > 0 ? <p className="mt-2 text-base text-ok">{t.checkout.applied(appliedCoupon)}</p> : null}
            </details>

            <details className="group mt-2 rounded-xl border border-line px-3.5 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-em-800">
                <span className="flex items-center gap-2">
                  <Icon name="notes" size={18} /> {t.checkout.note}
                </span>
                <Icon name="chevron-down" size={18} className="transition-transform duration-150 group-open:rotate-180" />
              </summary>
              <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} aria-label={t.checkout.note} className="mt-3 w-full rounded-xl border border-line-2 bg-card p-3 text-body outline-none focus:border-em-600" />
            </details>
          </section>
        </div>

        <aside className="lg:sticky lg:top-[96px]">
          <section className="fb-card p-4 sm:p-5">
            <h2 className="mb-2 flex items-center gap-2 text-xl font-semibold">
              <Icon name="receipt" size={20} className="text-au-600" /> {t.bag.title}
            </h2>
            {summary}
            {placeErr ? <p className="mt-3 rounded-lg bg-[#fdf3f2] px-3 py-2 text-base font-semibold text-danger">{placeErr}</p> : null}
            <button type="button" disabled={!canPlace} onClick={() => void place()} className={`${buttonClass('primary', 'lg', true)} mt-4 hidden lg:inline-flex`}>
              {placing ? t.checkout.placing : t.checkout.place} <Icon name="arrow-right" size={18} />
            </button>
          </section>
        </aside>
      </div>

      {/* Phone: the total + place button stay under the thumb. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5 shadow-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-3">{t.cart.grandTotal}</p>
            <p className="fb-price text-xl">{quote ? rupees(quote.grandTotal) : '—'}</p>
          </div>
          <button type="button" disabled={!canPlace} onClick={() => void place()} className={`${buttonClass('primary', 'lg')} flex-[1.4]`}>
            {placing ? t.checkout.placing : t.checkout.place}
          </button>
        </div>
      </div>

      {sorry ? (
        <SorryScreen
          lang={lang}
          result={sorry}
          supportPhone={supportPhone}
          source="CHECKOUT"
          onClose={() => setSorry(null)}
          onPickAnother={() => {
            setSorry(null);
            setAdding(true);
          }}
        />
      ) : null}
    </div>
  );
}
