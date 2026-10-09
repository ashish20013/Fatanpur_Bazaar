import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Icon } from '@/components/icons';
import { BannerStrip } from '@/components/BannerStrip';
import { ProductGridHome } from '@/components/product';
import { HomeCategoryGrid } from '@/components/HomeCategoryGrid';
import { Breaker, SectionHead } from '@/components/SectionHead';
import { EmptyState } from '@/components/ui';
import { JsonLd } from '@/components/JsonLd';

import { dict } from '@/lib/i18n';
import { buildMetadata, itemListLd } from '@/lib/seo';
import { getShell } from '@/lib/shell';

export const metadata: Metadata = buildMetadata({
  title: 'फतनपुर बाज़ार — रानीगंज में किराना, सब्ज़ी घर तक',
  description:
    'फतनपुर बाज़ार (रानीगंज तहसील, प्रतापगढ़) से आसपास के गाँवों में 30–60 मिनट में होम डिलीवरी — किराना, फल-सब्ज़ी, मिठाई, कपड़े, बिजली का सामान, डॉक्टर और भाड़ा गाड़ी। कैश ऑन डिलीवरी / UPI।',
  path: '/',
});

/**
 * Home = owner's wireframe: a short welcome, then EVERY category one after another in his order,
 * each showing its items अ→ज्ञ (A→Z in English), separated by a gold breaker line.
 */
export default async function HomePage(): Promise<ReactNode> {
  const s = await getShell();
  const { lang, home, settings, cart, villages } = s;
  const t = dict(lang);
  const cartMap = new Map(
    (cart?.items ?? []).map((i) => [i.productId, { itemId: i.id, quantity: i.quantity }]),
  );
  const name = (x: { name: string; nameHi: string | null }): string =>
    lang === 'hi' ? (x.nameHi ?? x.name) : x.name;

  return (
    <>
      <h1 className="sr-only">
        फतनपुर बाज़ार — रानीगंज, प्रतापगढ़ में किराना, फल-सब्ज़ी और ज़रूरी सामान की होम डिलीवरी
      </h1>

      {/* The advertising strip, above the goods and below nothing else. It renders only when the
          owner has it switched on AND has uploaded at least one banner — otherwise there is no
          empty band where an advert would have been. */}
      {settings.banner.enabled && home.banners.length ? (
        <BannerStrip lang={lang} banners={home.banners} seconds={settings.banner.seconds} />
      ) : null}

      {home.sections.length ? (
        home.sections.map((sec, i) => (
          // Each category is ONE ROW of products. The first five are SSR'd (they fill the first
          // screen on both phone and desktop); sections further down lazy-load as the shopper scrolls.
          <div key={sec.category.id} className={i > 4 ? 'fb-defer' : undefined}>
            {i > 0 ? <Breaker /> : <div className="h-0.5 md:h-1 lg:h-1" />}
            <section
              id={sec.category.slug}
              aria-labelledby={`h-${sec.category.slug}`}
              className="fb-container scroll-mt-40"
            >
              <SectionHead
                slug={sec.category.slug}
                icon={sec.category.icon}
                image={sec.category.image}
                title={name(sec.category)}
                sub={`${lang === 'hi' ? t.sections.aToZ : t.sections.aToZEn} · ${sec.total}`}
                href={`/${sec.category.slug}`}
                more={t.sections.seeAll(sec.total)}
              />
              {/* First 5 categories: server-rendered (one row each — light enough for 3G).
                  The rest lazy-load their row as the shopper scrolls to them. */}
              {i < 5 ? (
                <ProductGridHome items={sec.items} lang={lang} cartMap={cartMap} eager={i === 0} />
              ) : (
                <HomeCategoryGrid slug={sec.category.slug} lang={lang} />
              )}
            </section>
          </div>
        ))
      ) : (
        <div className="fb-container">
          <EmptyState icon="basket" title={t.common.loading} body={t.common.retry} />
        </div>
      )}

      <Breaker />

      {/* How it works — for people ordering online for the first time. */}
      <section className="fb-container">
        <h2 className="fb-display mb-3 text-xl md:mb-4 md:text-2xl">{t.sections.howTitle}</h2>
        <ol className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
          {[
            { icon: 'hand-click', text: t.sections.how1 },
            { icon: 'device-mobile', text: t.sections.how2 },
            { icon: 'map-pin', text: t.sections.how3 },
            { icon: 'clock-hour-4', text: t.sections.how4 },
          ].map((step, n) => (
            <li key={step.icon} className="fb-card flex items-start gap-3 p-3 md:p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-em-700 text-sm font-bold text-au-200">
                {n + 1}
              </span>
              <span className="flex-1 pt-1 text-body text-ink">{step.text}</span>
              <Icon name={step.icon} size={22} className="mt-1 shrink-0 text-au-600" />
            </li>
          ))}
        </ol>
      </section>

      {/* Areas served — real village pages (local SEO + a clear answer to "do you come to my village?"). */}
      {villages.length ? (
        <section className="fb-container mt-6 md:mt-8">
          <h2 className="fb-display mb-2.5 text-xl md:mb-3 md:text-2xl">{t.sections.areasTitle}</h2>
          <ul className="flex flex-wrap gap-2">
            {villages.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/area/${v.slug}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-2 bg-card px-3.5 text-base text-ink-2 no-underline hover:border-em-300 hover:text-em-800"
                >
                  <Icon name="map-pin" size={15} className="text-au-600" />
                  {lang === 'hi' ? (v.nameHi ?? v.name) : v.name}
                  {v.distanceKm !== null ? (
                    <span className="text-xs text-ink-3">
                      · {v.distanceKm} {lang === 'hi' ? 'किमी' : 'km'}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Plain facts, written for people — not keyword stuffing. */}

      <JsonLd
        data={itemListLd(
          home.sections.map((x) => ({
            name: x.category.nameHi ?? x.category.name,
            path: `/${x.category.slug}`,
          })),
        )}
      />
    </>
  );
}
