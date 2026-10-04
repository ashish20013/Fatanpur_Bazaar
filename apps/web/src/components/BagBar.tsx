'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { CartView } from '@fb/shared-types';
import { useCart } from '@/lib/cart-bus';
import { rupees } from '@/lib/format';
import { dict, type Lang } from '@/lib/i18n';
import { QtyStepper } from './cart-buttons';
import { Icon } from './icons';
import { ProductVisual } from './ProductVisual';
import { Sheet } from './Sheet';
import { buttonClass } from './ui';

const HIDE_ON = ['/cart', '/checkout', '/login', '/mera/order/'];

/**
 * The "थैला" (bag) bar — owner's brief: once something is chosen, a bar at the bottom always shows
 * what is in the bag and how much, with one clear way forward: आगे बढ़ें → login → address →
 * payment. Tapping the left part opens the bag to change quantities without leaving the page.
 * Same on phone and desktop (desktop had no way to reach the cart before — that was the bug).
 */
export function BagBar({ lang, initial }: { lang: Lang; initial: CartView | null }): React.ReactNode {
  const t = dict(lang);
  const cart = useCart(initial);
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const count = cart?.itemCount ?? 0;
  const visible = Boolean(cart) && count > 0 && !HIDE_ON.some((p) => path === p || path.startsWith(p));

  // Publish the bag bar's height so the page body can leave exactly that much room at the bottom —
  // otherwise the last row of goods hides behind the bar and its "खरीदें" button can't be reached.
  // 72px covers the card and its lift; 0 when the bar is gone, so no dead space when it isn't shown.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--fb-bag-h', visible ? '72px' : '0px');
    return () => {
      root.style.setProperty('--fb-bag-h', '0px');
    };
  }, [visible]);

  if (!visible || !cart) return null;
  const thumbs = cart.items.slice(0, 3);

  return (
    <>
      {/* Sits exactly on top of the call/app strip: its bottom padding is the safe-area inset plus
          the strip's live height (--fb-strip-h). When the strip is closed that variable is 0 and
          the bag bar drops to the floor — so the two bars never overlap, on any screen. */}
      <aside
        aria-label={t.bag.title}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px + var(--fb-strip-h, 0px))' }}
      >
        <div className="fb-sheet pointer-events-auto mx-auto flex max-w-2xl items-center gap-3 rounded-[20px] bg-em-800 p-2 pl-3 text-white shadow-3 ring-1 ring-au-500/40">
          <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t.bag.open}>
            <span className="flex shrink-0 -space-x-3">
              {thumbs.map((i) => (
                <span key={i.id} className="block h-10 w-10 overflow-hidden rounded-full ring-2 ring-em-800">
                  <ProductVisual name={i.name} nameHi={i.nameHi} image={i.image} icon={i.icon} family={i.family} lang={lang} size="xs" width={80} />
                </span>
              ))}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-body font-semibold leading-tight">
                {t.bag.summary(count, rupees(cart.itemsTotal))}
              </span>
              <span className="flex items-center gap-1 truncate text-xs text-au-200">
                {t.bag.steps} <Icon name="chevron-up" size={14} />
              </span>
            </span>
          </button>
          <Link href="/checkout" className={`${buttonClass('gold', 'md')} shrink-0 !h-12 !px-4`}>
            {t.bag.proceed} <Icon name="arrow-right" size={18} />
          </Link>
        </div>
      </aside>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t.bag.title}
        closeLabel={t.common.close}
        footer={
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-3">{t.cart.itemsTotal}</p>
              <p className="fb-price text-xl">{rupees(cart.itemsTotal)}</p>
            </div>
            <Link href="/checkout" onClick={() => setOpen(false)} className={`${buttonClass('primary', 'lg')} flex-1`}>
              {t.bag.proceed} <Icon name="arrow-right" size={18} />
            </Link>
          </div>
        }
      >
        <ul className="divide-y divide-line px-4">
          {cart.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3">
              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-line">
                <ProductVisual name={i.name} nameHi={i.nameHi} image={i.image} icon={i.icon} family={i.family} lang={lang} size="sm" width={112} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{lang === 'hi' ? (i.nameHi ?? i.name) : i.name}</span>
                <span className="block text-sm text-ink-3">
                  {i.unit} · <span className="fb-price text-ink">{rupees(i.lineTotal)}</span>
                </span>
              </span>
              <span className="w-[112px] shrink-0">
                <QtyStepper lang={lang} productId={i.productId} itemId={i.id} quantity={i.quantity} max={i.maxQty} />
              </span>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
