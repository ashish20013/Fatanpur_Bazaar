'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { CartView } from '@fb/shared-types';
import { publishCart, useCartLine } from '@/lib/cart-bus';
import { call, errText } from '@/lib/client';
import { rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { lineTotal, multiplyUnit } from '@/lib/units';
import { Icon } from './icons';
import { ProductVisual } from './ProductVisual';
import { Sheet } from './Sheet';
import { buttonClass } from './ui';

/**
 * Owner's buying flow (instead of a bare "Add"):
 *   खरीदें → "कितना चाहिए?" (in the item's own unit) → two buttons at the bottom:
 *   [ और सामान खरीदना है ]  [ बस इतना ही — आगे बढ़ें → ]
 * Left keeps shopping, right goes on to login (if needed) → address → payment.
 * The cart lives on the server (A11); every change broadcasts the fresh CartView so the bag bar
 * and all buttons update instantly.
 */
export interface BuyProduct {
  id: number;
  name: string;
  nameHi: string | null;
  unit: string;
  price: string;
  mrp?: string;
  image: string | null;
  icon: string | null;
  family: string | null;
  maxQty?: number;
}

async function setLine(productId: number, itemId: number | undefined, quantity: number): Promise<CartView> {
  if (itemId && quantity <= 0) return call<CartView>(`/cart/items/${itemId}`, { method: 'DELETE' });
  if (itemId) return call<CartView>(`/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } });
  return call<CartView>('/cart/items', { method: 'POST', body: { productId, quantity } });
}

export function BuyButton({
  lang,
  product,
  disabled,
  inCart,
  size = 'sm',
  compact = false,
  tight = false,
}: {
  lang: Lang;
  product: BuyProduct;
  disabled?: boolean;
  inCart?: { itemId: number; quantity: number };
  size?: 'sm' | 'md';
  /** A 44 px round control that sits on a picture instead of taking its own row. */
  compact?: boolean;
  /**
   * Product-card sizing: the same full-width button with the word on it, two pixels shorter and a
   * point smaller on a phone so three cards still fit across a 390 px screen and two rows still
   * fit down it. It is never an icon-only button — plenty of these customers are placing their
   * first online order, and "+" is a convention you have to have learnt somewhere.
   */
  tight?: boolean;
}): React.ReactNode {
  const t = dict(lang);
  const line = useCartLine(product.id, inCart);
  const [open, setOpen] = useState(false);

  if (disabled) {
    // Compact has no room for the words, so it just goes away — the card still reads as a product,
    // and the product page says why it cannot be bought. Responsive keeps the words from `sm` up.
    if (compact) return null;
    return (
      <button type="button" disabled className={`${buttonClass('secondary', size === 'md' ? 'md' : 'sm', true)} !text-ink-3 ${tight ? TIGHT : ''}`}>
        {t.product.outOfStock}
      </button>
    );
  }
  if (line && line.quantity > 0) {
    return <QtyStepper lang={lang} productId={product.id} itemId={line.itemId} quantity={line.quantity} max={product.maxQty} size={size} compact={compact} tight={tight} />;
  }
  const label = `${t.buy.buy} — ${lang === 'hi' ? (product.nameHi ?? product.name) : product.name}`;
  if (compact) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} aria-label={label} className={ROUND}>
          <Icon name="plus" size={19} />
        </button>
        {open ? <BuySheet lang={lang} product={product} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} className={`${buttonClass('primary', size === 'md' ? 'md' : 'sm', true)} tracking-wide ${tight ? TIGHT : ''}`}>
        <Icon name="shopping-bag" size={tight ? 15 : 18} className={tight ? 'sm:hidden' : ''} />
        {tight ? <Icon name="shopping-bag" size={18} className="hidden sm:block" /> : null}
        {t.buy.buy}
      </button>
      {open ? <BuySheet lang={lang} product={product} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** The round "+" used where there is genuinely no room for a word (the bag bar, not a card). */
const ROUND = 'grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-em-700 text-white shadow-2 transition-transform duration-150 active:scale-95';
/**
 * Product-card sizing on a phone: 34 px tall and a point smaller, so the word still fits on a
 * 115 px card and two complete rows still fit on a 390 × 844 screen. Full size from `sm` up.
 */
const TIGHT = '!h-[30px] !gap-1 !text-[12px] sm:!h-9 sm:!gap-1.5 sm:!text-body lg:!h-[28px] lg:!text-[12px]';

function BuySheet({ lang, product, onClose }: { lang: Lang; product: BuyProduct; onClose: () => void }): React.ReactNode {
  const t = dict(lang);
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<'more' | 'go' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const max = Math.max(1, product.maxQty ?? 20);
  const title = lang === 'hi' ? (product.nameHi ?? product.name) : product.name;
  const presets = [1, 2, 3, 5].filter((n) => n <= max);

  async function commit(next: 'more' | 'go'): Promise<void> {
    setBusy(next);
    setErr(null);
    try {
      const cart = await setLine(product.id, undefined, qty);
      publishCart(cart);
      if (next === 'go') {
        router.push('/checkout');
      } else {
        onClose();
        start(() => router.refresh());
      }
    } catch (e) {
      setErr(errText(e, lang));
      setBusy(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t.buy.howMuch}
      closeLabel={t.common.close}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!!busy} onClick={() => void commit('more')} className={`${buttonClass('secondary', 'lg', true)} !px-2 text-base leading-tight`}>
            {busy === 'more' ? t.common.saving : t.buy.moreShopping}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void commit('go')} className={`${buttonClass('primary', 'lg', true)} !px-2 text-base leading-tight`}>
            {busy === 'go' ? t.common.saving : t.buy.proceed} <Icon name="arrow-right" size={18} />
          </button>
        </div>
      }
    >
      <div className="space-y-5 px-5 py-4">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-line">
            <ProductVisual name={product.name} nameHi={product.nameHi} image={product.image} icon={product.icon} family={product.family} lang={lang} size="sm" width={160} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-snug text-ink">{title}</p>
            <p className="text-base text-ink-3">{t.buy.unitEach(product.unit)} · <span className="fb-price text-ink">{rupees(product.price)}</span></p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-5">
          <button type="button" aria-label="−" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-14 w-14 place-items-center rounded-full border border-line-2 text-em-800 disabled:opacity-40">
            <Icon name="minus" size={24} />
          </button>
          <div className="min-w-[120px] text-center" aria-live="polite">
            <p className="fb-price text-4xl text-ink">{qty}</p>
            <p className="text-base font-semibold text-em-700">{multiplyUnit(product.unit, qty)}</p>
          </div>
          <button type="button" aria-label="+" disabled={qty >= max} onClick={() => setQty((q) => Math.min(max, q + 1))} className="grid h-14 w-14 place-items-center rounded-full bg-em-700 text-white disabled:opacity-40">
            <Icon name="plus" size={24} />
          </button>
        </div>

        {presets.length > 1 ? (
          <div className="flex justify-center gap-2">
            {presets.map((n) => (
              <button key={n} type="button" onClick={() => setQty(n)} className={`h-10 min-w-12 rounded-full border px-3 text-base font-semibold ${qty === n ? 'border-em-700 bg-em-700 text-white' : 'border-line-2 bg-card text-ink-2'}`}>
                {n}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-xl bg-au-50 px-4 py-3 ring-1 ring-au-200">
          <span className="text-base text-ink-2">{t.buy.total}</span>
          <span className="fb-price text-2xl text-ink">₹{lineTotal(product.price, qty)}</span>
        </div>
        {qty >= max ? <p className="text-center text-sm text-ink-3">{t.buy.max(max)}</p> : null}
        {err ? <p className="text-center text-base font-semibold text-danger">{err}</p> : null}
      </div>
    </Sheet>
  );
}

/** − n + stepper once an item is in the bag (tiles, product page, cart page). */
export function QtyStepper({
  lang,
  productId,
  itemId,
  quantity,
  max,
  size = 'sm',
  compact = false,
  tight = false,
}: {
  lang: Lang;
  productId: number;
  itemId: number;
  quantity: number;
  max?: number;
  size?: 'sm' | 'md';
  compact?: boolean;
  /** Product card: 34 px tall on a phone, full height from `sm` up — matches the Buy button. */
  tight?: boolean;
}): React.ReactNode {
  const router = useRouter();
  const [qty, setQty] = useState(quantity);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  if (qty !== quantity && !busy) setQty(quantity);

  async function change(next: number): Promise<void> {
    setBusy(true);
    setErr(null);
    const prev = qty;
    setQty(next);
    try {
      publishCart(await setLine(productId, itemId, next));
      start(() => router.refresh());
    } catch (e) {
      setQty(prev);
      setErr(errText(e, lang));
    } finally {
      setBusy(false);
    }
  }
  if (compact) {
    // The same three controls, sized to sit on a picture. Each half is 36×44, comfortably past
    // the 44 px the rest of the site holds itself to in the direction that matters for a thumb.
    return (
      <div className="flex h-9 items-stretch overflow-hidden rounded-full border-2 border-white bg-em-700 text-white shadow-2">
        <button type="button" aria-label="−" disabled={busy} onClick={() => void change(qty - 1)} className="grid w-8 place-items-center active:bg-em-800">
          <Icon name={qty <= 1 ? 'trash' : 'minus'} size={16} />
        </button>
        <span className="grid min-w-6 place-items-center px-0.5 text-base font-bold tabular-nums">{qty}</span>
        <button type="button" aria-label="+" disabled={busy || (max !== undefined && qty >= max)} onClick={() => void change(qty + 1)} className="grid w-8 place-items-center active:bg-em-800 disabled:opacity-50">
          <Icon name="plus" size={16} />
        </button>
      </div>
    );
  }
  // The stepper replaces the Buy button in place, so it has to be exactly as tall as it was —
  // otherwise every card in the row jumps a few pixels the moment one item goes into the bag.
  const h = tight ? 'h-[30px] sm:h-9 lg:h-[28px]' : size === 'md' ? 'h-12' : 'h-10';
  return (
    <div className="w-full">
      <div className={`flex ${h} items-stretch overflow-hidden rounded border border-em-700 bg-em-700 text-white`}>
        <button type="button" aria-label="−" disabled={busy} onClick={() => void change(qty - 1)} className="grid w-11 place-items-center hover:bg-em-600">
          <Icon name={qty <= 1 ? 'trash' : 'minus'} size={18} />
        </button>
        <span className="flex flex-1 items-center justify-center gap-1 bg-card text-body font-semibold text-em-800 tabular-nums">{qty}</span>
        <button type="button" aria-label="+" disabled={busy || (max !== undefined && qty >= max)} onClick={() => void change(qty + 1)} className="grid w-11 place-items-center hover:bg-em-600 disabled:opacity-50">
          <Icon name="plus" size={18} />
        </button>
      </div>
      {err ? <p className="mt-1 text-sm text-danger">{err}</p> : null}
    </div>
  );
}

/** Cart page stepper. */
export function CartQty({ lang, itemId, quantity, max, productId = 0 }: { lang: Lang; itemId: number; quantity: number; max?: number; productId?: number }): React.ReactNode {
  return <QtyStepper lang={lang} productId={productId} itemId={itemId} quantity={quantity} max={max} />;
}

/** Service cards book on the service page (slot needed). */
export function BookLink({ lang, href }: { lang: Lang; href: string }): React.ReactNode {
  const t = dict(lang);
  return (
    <Link href={href} className={`${buttonClass('secondary', 'sm', true)}`}>
      <Icon name="calendar" size={18} /> {t.buy.book}
    </Link>
  );
}
