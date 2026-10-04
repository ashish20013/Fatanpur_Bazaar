import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CartQty } from '@/components/cart-buttons';
import { Icon } from '@/components/icons';
import { ProductVisual } from '@/components/ProductVisual';
import { Badge, EmptyState, buttonClass } from '@/components/ui';
import { rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { buildMetadata } from '@/lib/seo';
import { getShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'आपका थैला', description: 'आपका थैला', path: '/cart', noindex: true });

/** The bag ("थैला") — same on phone and desktop; desktop gets a two-column layout. */
export default async function CartPage(): Promise<ReactNode> {
  const s = await getShell();
  const { lang, cart, settings } = s;
  const t = dict(lang);
  const items = cart?.items ?? [];
  const total = Number(cart?.itemsTotal ?? '0');
  const minOrder = Number(settings.minOrder);
  const belowMin = total > 0 && total < minOrder;

  if (!items.length) {
    return (
      <div className="fb-container">
        <h1 className="sr-only">{t.bag.title}</h1>
        <EmptyState
          icon="shopping-bag"
          title={t.bag.empty}
          body={t.bag.emptyBody}
          action={
            <Link href="/" className={buttonClass('primary', 'md')}>
              {t.bag.shopMore}
            </Link>
          }
        />
      </div>
    );
  }

  const cta = (
    <Link href="/checkout" aria-disabled={belowMin} className={`${buttonClass('primary', 'lg', true)} ${belowMin ? 'pointer-events-none opacity-50' : ''}`}>
      {t.bag.proceed} <Icon name="arrow-right" size={18} />
    </Link>
  );

  return (
    <div className="fb-container pb-28 pt-4 lg:pb-10">
      <h1 className="fb-display text-3xl">{t.bag.title}</h1>
      <p className="mt-1 text-base text-ink-3">{t.bag.steps}</p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-3">
          {cart?.warnings.length ? (
            <ul className="space-y-1">
              {cart.warnings.map((w, i) => (
                <li key={`${w.productId}-${i}`} className="rounded-xl bg-au-100 px-3 py-2 text-base text-au-800">
                  {w.message}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="fb-card divide-y divide-line px-4">
            {items.map((i) => (
              <li key={i.id} className="flex gap-3 py-4">
                <Link href={`/${i.itemType === 'SERVICE' ? 'service' : 'product'}/${i.slug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-line" tabIndex={-1}>
                  <ProductVisual name={i.name} nameHi={i.nameHi} image={i.image} icon={i.icon} family={i.family} lang={lang} size="sm" width={160} />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link href={`/product/${i.slug}`} className="line-clamp-2 text-body font-semibold text-ink no-underline">
                    {lang === 'hi' ? (i.nameHi ?? i.name) : i.name}
                  </Link>
                  <p className="text-sm text-ink-3">
                    {i.unit} · {rupees(i.price)}
                  </p>
                  {i.issues.map((code) => (
                    <Badge key={code} tone={code === 'UNAVAILABLE' || code === 'VERTICAL_OFF' ? 'danger' : 'warn'}>
                      {t.cart.warn[code]}
                    </Badge>
                  ))}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="fb-price text-lg">{rupees(i.lineTotal)}</span>
                    <div className="w-[132px]">
                      <CartQty lang={lang} itemId={i.id} quantity={i.quantity} max={i.maxQty} productId={i.productId} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <aside className="lg:sticky lg:top-[96px]">
          <div className="fb-card space-y-2 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-body">{t.cart.itemsTotal}</span>
              <span className="fb-price text-2xl">{rupees(cart?.itemsTotal ?? '0')}</span>
            </div>
            <p className="text-sm text-ink-3">{t.cart.freeAbove(settings.freeDeliveryAbove)}</p>
            {belowMin ? <p className="text-base font-semibold text-danger">{t.cart.minOrder(settings.minOrder)}</p> : null}
            {cart?.needsPrescription ? <p className="text-base font-semibold text-au-800">{t.checkout.rxNeeded}</p> : null}
            <div className="hidden pt-2 lg:block">{cta}</div>
            <Link href="/" className="hidden items-center justify-center gap-1 pt-1 text-base font-semibold text-em-700 no-underline lg:flex">
              <Icon name="plus" size={16} /> {t.buy.moreShopping}
            </Link>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5 shadow-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink-3">{t.cart.itemsTotal}</p>
            <p className="fb-price text-xl">{rupees(cart?.itemsTotal ?? '0')}</p>
          </div>
          <div className="flex-[1.4]">{cta}</div>
        </div>
      </div>
    </div>
  );
}
