import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { ProductCard } from '@fb/shared-types';
import { Breadcrumbs } from '@/components/list';
import { ProductGrid } from '@/components/product';
import { JsonLd } from '@/components/JsonLd';
import { Card, EmptyState, SectionTitle } from '@/components/ui';
import { ApiError, apiPaged, publicApi, safeApi } from '@/lib/api';
import { getCart } from '@/lib/data';
import { SITE_URL } from '@/lib/env';
import { rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { breadcrumbLd, buildMetadata, faqLd } from '@/lib/seo';
import { currentLang } from '@/lib/session';


type Params = { params: Promise<{ slug: string }> };

interface AreaPayload {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  distanceKm: number | null;
  etaMinutes: number;
  deliveryFee: string;
  introHtml: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  lat: number | null;
  lng: number | null;
}
interface Faq {
  id: number;
  question: string;
  answer: string;
}

async function loadArea(slug: string): Promise<AreaPayload | null> {
  try {
    return await publicApi<AreaPayload>(`/catalog/areas/${encodeURIComponent(slug)}`, 3600);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return null;
    throw e;
  }
}

// This page shows a per-shopper cart badge and respects the Hindi/English cookie, so it renders
// per request (SSR) rather than as one static file — crawlers still get complete HTML, and each
// API call below keeps its own 1-hour fetch cache, so the shop data is not re-fetched every hit.
// (Earlier it declared generateStaticParams + revalidate; that forced a static prerender that the
//  cookie reads cannot satisfy — DYNAMIC_SERVER_USAGE — so every area page 500'd. §11)
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const v = await loadArea(slug);
  if (!v) return buildMetadata({ title: 'नहीं मिला', description: 'यह क्षेत्र नहीं मिला', path: `/area/${slug}`, noindex: true });
  const nameHi = v.nameHi ?? v.name;
  return buildMetadata({
    title: v.seoTitle ?? `${nameHi} में ऑनलाइन सब्ज़ी और किराना — घर तक डिलीवरी`,
    description:
      v.seoDescription ??
      `${nameHi} में फतनपुर बाज़ार से ताज़ी सब्ज़ी, फल और किराना ऑर्डर करें — लगभग ${v.etaMinutes} मिनट में डिलीवरी, कैश ऑन डिलीवरी और UPI से भुगतान।`,
    path: `/area/${slug}`,
  });
}

export default async function AreaPage({ params }: Params): Promise<ReactNode> {
  const { slug } = await params;
  const v = await loadArea(slug);
  if (!v) notFound();
  const [lang, popular, faqs, cart] = await Promise.all([
    currentLang(),
    apiPaged<ProductCard>('/catalog/products?sort=popular&perPage=8', { revalidate: 3600 }),
    safeApi<Faq[]>('/content/faqs?scope=general', [], 3600),
    getCart(),
  ]);
  const t = dict(lang);
  const nameHi = v.nameHi ?? v.name;
  const cartMap = new Map((cart?.items ?? []).map((i) => [i.productId, { itemId: i.id, quantity: i.quantity }]));
  const crumbs = [
    { name: t.nav.home, path: '/' },
    { name: nameHi, path: `/area/${v.slug}` },
  ];

  const pageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t.villagePage.title(nameHi),
    about: { '@id': `${SITE_URL}#store` },
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="fb-display text-3xl leading-tight">{t.villagePage.title(nameHi)}</h1>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {v.distanceKm !== null ? (
          <li className="fb-card px-3 py-2">
            <p className="text-sm text-ink-3">{t.villagePage.distanceLabel}</p>
            <p className="text-body font-semibold">{t.area.distanceKm(v.distanceKm)}</p>
          </li>
        ) : null}
        <li className="fb-card px-3 py-2">
          <p className="text-sm text-ink-3">{t.villagePage.etaLabel}</p>
          <p className="text-body font-semibold">{t.checkout.eta(v.etaMinutes)}</p>
        </li>
        <li className="fb-card px-3 py-2">
          <p className="text-sm text-ink-3">{t.villagePage.deliveryFeeLabel}</p>
          <p className="text-body font-semibold">{Number(v.deliveryFee) > 0 ? rupees(v.deliveryFee) : t.cart.free}</p>
        </li>
      </ul>

      {/* ⚠️ Unique intro — DB se, har gaon ka apna paragraph (§11 duplicate content se bachav) */}
      {v.introHtml ? <section className="fb-prose fb-card p-4 text-base text-ink-2" dangerouslySetInnerHTML={{ __html: v.introHtml }} /> : null}

      {popular.items.length ? (
        <section>
          <SectionTitle>{t.villagePage.popular}</SectionTitle>
          <ProductGrid items={popular.items} lang={lang} cartMap={cartMap} />
        </section>
      ) : (
        <EmptyState icon="basket" title={t.common.loading} />
      )}

      <section>
        <SectionTitle>{t.villagePage.howToOrder(nameHi)}</SectionTitle>
        <Card>
          <ol className="list-decimal space-y-2 pl-5 text-base text-ink-2">
            <li>{t.villagePage.step1}</li>
            <li>{t.villagePage.step2}</li>
            <li>{t.villagePage.step3}</li>
          </ol>
        </Card>
      </section>

      {faqs.length ? (
        <section>
          <SectionTitle>{t.footer.faq}</SectionTitle>
          <div className="fb-card divide-y divide-line p-0">
            {faqs.slice(0, 6).map((f) => (
              <details key={f.id} className="px-4 py-3">
                <summary className="cursor-pointer text-body font-semibold text-ink">{f.question}</summary>
                <div className="fb-prose pt-2 text-base text-ink-2" dangerouslySetInnerHTML={{ __html: f.answer }} />
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <JsonLd data={faqs.length ? [breadcrumbLd(crumbs), pageLd, faqLd(faqs.slice(0, 6).map((f) => ({ question: f.question, answer: f.answer })))] : [breadcrumbLd(crumbs), pageLd]} />
    </div>
  );
}
