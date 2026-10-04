import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { ProductDetail } from '@fb/shared-types';
import { BuyButton } from '@/components/cart-buttons';
import { Icon } from '@/components/icons';
import { NotifyMe } from '@/components/NotifyMe';
import { Breadcrumbs } from '@/components/list';
import { ProductRow } from '@/components/product';
import { ProductVisual } from '@/components/ProductVisual';
import { JsonLd } from '@/components/JsonLd';
import { Badge, Stars } from '@/components/ui';
import { ApiError, publicApi } from '@/lib/api';
import { PUBLIC_API_URL } from '@/lib/env';
import { imageUrl, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { breadcrumbLd, buildMetadata, productLd } from '@/lib/seo';
import { getShell } from '@/lib/shell';

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string): Promise<ProductDetail | null> {
  if (!/^[a-z0-9-]{1,220}$/.test(slug)) return null;
  try {
    return await publicApi<ProductDetail>(`/catalog/products/${slug}`, 60);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p || p.itemType !== 'PRODUCT') return buildMetadata({ title: 'नहीं मिला', description: 'यह सामान नहीं मिला', path: `/product/${slug}`, noindex: true });
  return buildMetadata({ title: p.seo.title, description: p.seo.description, path: `/product/${p.slug}`, image: imageUrl(p.image?.url, PUBLIC_API_URL) });
}

/** Product page: stays 200 when out of stock (A9) — "notify me" + alternatives instead of a 404. */
export default async function ProductPage({ params }: Params): Promise<ReactNode> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p || p.itemType !== 'PRODUCT') notFound();
  const s = await getShell();
  const { lang, cart, settings } = s;
  const t = dict(lang);
  const line = cart?.items.find((i) => i.productId === p.id);
  const cartMap = new Map((cart?.items ?? []).map((i) => [i.productId, { itemId: i.id, quantity: i.quantity }]));
  const nm = (x: { name: string; nameHi: string | null }): string => (lang === 'hi' ? (x.nameHi ?? x.name) : x.name);
  const title = nm(p);
  const crumbs = [
    { name: t.nav.home, path: '/' },
    ...(p.root ? [{ name: nm(p.root), path: `/${p.root.slug}` }] : []),
    { name: nm(p.category), path: `/${p.category.slug}` },
    { name: title, path: `/product/${p.slug}` },
  ];

  return (
    <div className="fb-container pt-4">
      <Breadcrumbs items={crumbs} />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10">
        <div className="min-w-0 overflow-hidden rounded-[22px] border border-line bg-card shadow-1">
          <div className="aspect-square w-full">
            <ProductVisual name={p.name} nameHi={p.nameHi} image={p.image?.url ?? null} icon={p.icon} family={p.family} lang={lang} size="lg" priority width={600} />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <h1 className="fb-display text-3xl leading-tight md:text-4xl">{title}</h1>
            <p className="mt-1 text-base text-ink-3">{lang === 'hi' ? p.name : (p.nameHi ?? '')}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="muted">{p.unit}</Badge>
              {p.inStock ? <Badge tone="ok">{lang === 'hi' ? 'उपलब्ध' : 'In stock'}</Badge> : <Badge tone="danger">{t.product.outOfStock}</Badge>}
              <Stars avg={p.rating.avg} count={p.rating.count} />
            </div>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="fb-price text-4xl">{rupees(p.price)}</span>
            {p.discountPercent > 0 ? (
              <>
                <s className="text-lg text-ink-3">{rupees(p.mrp)}</s>
                <span className="rounded-full bg-[linear-gradient(180deg,#efdba2,#cba954)] px-2.5 py-0.5 text-sm font-bold text-em-900">{t.product.off(p.discountPercent)}</span>
              </>
            ) : null}
          </div>

          <div className="max-w-sm">
            {p.inStock ? (
              <BuyButton
                lang={lang}
                size="md"
                inCart={line ? { itemId: line.id, quantity: line.quantity } : undefined}
                product={{ id: p.id, name: p.name, nameHi: p.nameHi, unit: p.unit, price: p.price, mrp: p.mrp, image: p.image?.urlSm ?? null, icon: p.icon, family: p.family, maxQty: p.maxQtyPerOrder }}
              />
            ) : (
              <NotifyMe lang={lang} productId={p.id} />
            )}
            {p.maxQtyPerOrder > 0 && p.maxQtyPerOrder < 100 ? <p className="mt-2 text-sm text-ink-3">{t.product.perOrderMax(p.maxQtyPerOrder)}</p> : null}
          </div>

          <ul className="grid gap-2 rounded-2xl border border-au-200 bg-au-50 p-4 text-base text-ink-2">
            <li className="flex items-center gap-2">
              <Icon name="scooter" size={18} className="text-em-700" /> {t.header.deliveryIn(settings.deliveryWindow)}
            </li>
            <li className="flex items-center gap-2">
              <Icon name="cash-banknote" size={18} className="text-em-700" /> {t.hero.p3}
            </li>
            {p.isWeighted ? (
              <li className="flex items-center gap-2">
                <Icon name="discount" size={18} className="text-em-700" /> {t.product.weighed}
              </li>
            ) : null}
            {p.supplier ? (
              <li className="flex items-center gap-2">
                <Icon name="building-store" size={18} className="text-em-700" /> {t.product.from(p.supplier.name)}
                {p.supplier.village ? ` · ${p.supplier.village}` : ''}
              </li>
            ) : null}
          </ul>
          {p.supplierNote ? (
            <p className="flex items-start gap-2 rounded-xl border border-line bg-paper-2/70 px-3 py-2 text-base text-ink-2">
              <Icon name="truck-delivery" size={18} className="mt-0.5 shrink-0 text-em-700" />
              {p.supplierNote}
            </p>
          ) : null}
          {/* Prescription goods: say it in red, before the buy button — not after the order. */}
          {p.prescriptionRequired ? (
            <p className="flex items-start gap-2 rounded-xl border border-[#f3c9c4] bg-[#fdf0ee] px-3 py-2 text-base font-semibold text-danger">
              <Icon name="file-text" size={18} className="mt-0.5 shrink-0" />
              {t.product.rxBlock}
            </p>
          ) : null}

          {p.description ? (
            <section>
              <h2 className="mb-1 text-lg font-semibold">{t.product.description}</h2>
              <div className="fb-prose text-body text-ink-2" dangerouslySetInnerHTML={{ __html: p.description }} />
            </section>
          ) : null}
          {p.root ? (
            <Link href={`/${p.root.slug}`} className="inline-flex items-center gap-1 text-base font-semibold text-em-700 no-underline">
              {nm(p.root)} <Icon name="chevron-right" size={16} />
            </Link>
          ) : null}
        </div>
      </div>

      {p.related.length ? (
        <section className="mt-10">
          <h2 className="fb-display mb-4 text-2xl">{t.product.alternatives}</h2>
          <ProductRow items={p.related} lang={lang} cartMap={cartMap} />
        </section>
      ) : null}

      <JsonLd data={[breadcrumbLd(crumbs), productLd(p, imageUrl(p.image?.url, PUBLIC_API_URL))]} />
    </div>
  );
}
