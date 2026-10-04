import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { ProductDetail } from '@fb/shared-types';
import { Checkout, type CheckoutLine } from '@/components/Checkout';
import { EmptyState, buttonClass } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { authed } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { buildMetadata } from '@/lib/seo';
import { getShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = buildMetadata({ title: 'ऑर्डर पक्का करें', description: 'पता, भुगतान और ऑर्डर', path: '/checkout', noindex: true });

type Search = Promise<Record<string, string | undefined>>;

/** Service booking comes straight here (not through the bag): ?service=<slug>&date=YYYY-MM-DD&slot=HH:MM */
async function serviceLine(sp: Record<string, string | undefined>): Promise<{ line: CheckoutLine; slot: { date: string; start: string; label: string } } | null> {
  const slug = sp.service ?? '';
  const date = sp.date ?? '';
  const start = sp.slot ?? '';
  if (!/^[a-z0-9-]{1,220}$/.test(slug) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) return null;
  const p = await publicApi<ProductDetail>(`/catalog/products/${slug}`, 60).catch(() => null);
  if (!p || p.itemType !== 'SERVICE') return null;
  return {
    line: { productId: p.id, quantity: 1, name: p.name, nameHi: p.nameHi, unit: p.unit, lineTotal: p.price, image: p.image?.urlSm ?? null, icon: p.icon, family: p.family },
    slot: { date, start, label: `${date.split('-').reverse().join('-')} · ${start}` },
  };
}

export default async function CheckoutPage({ searchParams }: { searchParams: Search }): Promise<ReactNode> {
  const sp = await searchParams;
  const s = await getShell();
  const t = dict(s.lang);
  if (!s.me) {
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string')).toString();
    redirect(`/login?next=${encodeURIComponent(`/checkout${qs ? `?${qs}` : ''}`)}`);
  }
  const service = sp.service ? await serviceLine(sp) : null;
  const lines: CheckoutLine[] = service
    ? [service.line]
    : (s.cart?.items ?? [])
        .filter((i) => i.itemType === 'PRODUCT')
        .map((i) => ({ productId: i.productId, quantity: i.quantity, name: i.name, nameHi: i.nameHi, unit: i.unit, lineTotal: i.lineTotal, image: i.image, icon: i.icon, family: i.family }));

  if (!lines.length) {
    return (
      <div className="fb-container">
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

  const wallet = await authed<{ balance: string }>('/users/me/wallet').catch(() => ({ balance: '0.00' }));
  return (
    <Checkout
      lang={s.lang}
      lines={lines}
      addresses={s.addresses}
      preferredAddressId={s.addressId}
      walletBalance={wallet.balance}
      codEnabled={s.settings.codEnabled}
      upiEnabled={s.settings.upiEnabled}
      supportPhone={s.settings.supportPhone}
      defaults={{ receiverName: s.me?.name ?? '', phone: s.me?.phone ?? '', district: s.settings.defaultDistrict, pincode: s.settings.defaultPincode, requireLocation: s.settings.requireLocation }}
      slot={service?.slot ?? null}
    />
  );
}
