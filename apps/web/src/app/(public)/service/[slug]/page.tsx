import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { ProductDetail } from '@fb/shared-types';
import { Breadcrumbs } from '@/components/list';
import { Icon } from '@/components/icons';
import { JsonLd } from '@/components/JsonLd';
import { ProductVisual } from '@/components/ProductVisual';
import { ServiceBooking } from '@/components/ServiceBooking';
import { Badge } from '@/components/ui';
import { ApiError, publicApi } from '@/lib/api';
import { PUBLIC_API_URL, SITE_URL } from '@/lib/env';
import { imageUrl, rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { breadcrumbLd, buildMetadata } from '@/lib/seo';
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
  if (!p || p.itemType !== 'SERVICE') return buildMetadata({ title: 'नहीं मिला', description: 'यह सेवा नहीं मिली', path: `/service/${slug}`, noindex: true });
  return buildMetadata({ title: p.seo.title, description: p.seo.description, path: `/service/${p.slug}`, image: imageUrl(p.image?.url, PUBLIC_API_URL) });
}

/** A24 service page: what it costs, how long, then pick a day + slot and book (no bag needed). */
export default async function ServicePage({ params }: Params): Promise<ReactNode> {
  const { slug } = await params;
  const p = await load(slug);
  // Wrong route type → 404 (/product/[slug] owns PRODUCT slugs — no duplicate URLs).
  if (!p || p.itemType !== 'SERVICE') notFound();
  const s = await getShell();
  const { lang } = s;
  const t = dict(lang);
  const nm = (x: { name: string; nameHi: string | null }): string => (lang === 'hi' ? (x.nameHi ?? x.name) : x.name);
  const title = nm(p);
  const crumbs = [
    { name: t.nav.home, path: '/' },
    ...(p.root ? [{ name: nm(p.root), path: `/${p.root.slug}` }] : []),
    { name: nm(p.category), path: `/${p.category.slug}` },
    { name: title, path: `/service/${p.slug}` },
  ];
  const quote = p.isQuoteBased || Number(p.price) === 0;
  const serviceLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: title,
    description: (p.description ?? '').replace(/<[^>]+>/g, ' ').trim().slice(0, 300) || title,
    provider: { '@id': `${SITE_URL}#store` },
    areaServed: { '@type': 'AdministrativeArea', name: 'Raniganj tehsil, Pratapgarh, Uttar Pradesh' },
    offers: quote ? undefined : { '@type': 'Offer', priceCurrency: 'INR', price: p.price },
  };

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
          </div>
          {quote ? <Badge tone="info">{t.service.quoteBased}</Badge> : <p className="fb-price text-4xl">{rupees(p.price)}</p>}
          <ul className="grid gap-2 rounded-2xl border border-au-200 bg-au-50 p-4 text-base text-ink-2">
            {Number(p.visitingCharge) > 0 ? (
              <li className="flex items-center gap-2">
                <Icon name="scooter" size={18} className="text-em-700" /> {t.service.visitingCharge}: {rupees(p.visitingCharge)}
              </li>
            ) : null}
            {p.serviceDurationMin ? (
              <li className="flex items-center gap-2">
                <Icon name="clock-hour-4" size={18} className="text-em-700" /> {t.service.duration(p.serviceDurationMin)}
              </li>
            ) : null}
            <li className="flex items-center gap-2">
              <Icon name="cash-banknote" size={18} className="text-em-700" /> {t.hero.p3}
            </li>
          </ul>
          <ServiceBooking lang={lang} slug={p.slug} />
          {p.serviceNote ? (
            <section className="rounded-xl border border-em-200 bg-em-50 px-4 py-3">
              <p className="mb-1 text-base font-semibold text-em-800">{t.service.howItWorks}</p>
              <p className="whitespace-pre-line text-base text-ink-2">{p.serviceNote}</p>
            </section>
          ) : null}
          {p.supplierNote ? (
            <p className="flex items-start gap-2 rounded-xl border border-line bg-paper-2/70 px-3 py-2 text-base text-ink-2">
              <Icon name="building-store" size={18} className="mt-0.5 shrink-0 text-em-700" />
              {p.supplierNote}
            </p>
          ) : null}
          {p.description ? <div className="fb-prose text-body text-ink-2" dangerouslySetInnerHTML={{ __html: p.description }} /> : null}
        </div>
      </div>
      <JsonLd data={[breadcrumbLd(crumbs), serviceLd]} />
    </div>
  );
}
