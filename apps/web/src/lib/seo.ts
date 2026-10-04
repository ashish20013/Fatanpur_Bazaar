import type { Metadata } from 'next';
import type { ProductDetail } from '@fb/shared-types';
import { BRAND, SITE_URL } from './env';

/**
 * §11 — har page pe unique title (50–60), description (150–160), canonical, OG.
 * Pattern: "{Page} — फतनपुर बाज़ार | रानीगंज, प्रतापगढ़"
 */
const SUFFIX = 'फतनपुर बाज़ार | रानीगंज, प्रतापगढ़';
const SUFFIX_SHORT = 'फतनपुर बाज़ार';
/** Google shows roughly this much of a title; Devanagari is wide, so we stay on the short side. */
const TITLE_MAX = 62;

/**
 * Append the brand only while it still fits. A long page name used to produce an 97-character
 * title that Google cut mid-word, which loses both the brand and the place name — the two things
 * a local shop most needs in the result.
 */
function withBrand(pageTitle: string): string {
  const t = pageTitle.trim();
  if (t.includes('फतनपुर बाज़ार')) return t;
  if (`${t} — ${SUFFIX}`.length <= TITLE_MAX) return `${t} — ${SUFFIX}`;
  if (`${t} — ${SUFFIX_SHORT}`.length <= TITLE_MAX) return `${t} — ${SUFFIX_SHORT}`;
  return `${t.slice(0, Math.max(10, TITLE_MAX - SUFFIX_SHORT.length - 3)).replace(/[\s—–\-,:;.]+$/, '')} — ${SUFFIX_SHORT}`;
}

export interface SeoInput {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  noindex?: boolean;
  type?: 'website' | 'article';
  publishedTime?: string;
}

export function buildMetadata(i: SeoInput): Metadata {
  const url = `${SITE_URL}${i.path.startsWith('/') ? i.path : `/${i.path}`}`;
  const title = withBrand(i.title);
  // 155–160 is what Google shows; anything past that is dead weight in the HTML.
  const description = i.description.length > 158 ? `${i.description.slice(0, 157).replace(/[\s,;:—–-]+$/, '')}…` : i.description;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: i.noindex ? { index: false, follow: false, nocache: true } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: BRAND.nameHi,
      locale: 'hi_IN',
      type: i.type ?? 'website',
      images: [{ url: i.image ?? `${SITE_URL}/og.jpg`, ...(i.image ? {} : { width: 1200, height: 630 }) }],
      publishedTime: i.publishedTime,
    },
    twitter: { card: 'summary_large_image', title, description, images: [i.image ?? `${SITE_URL}/og.jpg`] },
  };
}

type Json = Record<string, unknown>;

export function organizationLd(supportPhone: string): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND.nameHi,
    alternateName: BRAND.nameEn,
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    image: `${SITE_URL}/og.jpg`,
    contactPoint: [{ '@type': 'ContactPoint', telephone: `+91${supportPhone}`, contactType: 'customer service', areaServed: 'IN', availableLanguage: ['hi', 'en'] }],
  };
}

/**
 * LocalBusiness (GroceryStore) — NAP exactly as on the Google Business Profile, geo, hours, and
 * areaServed = the real village list (each a Place inside Raniganj tehsil, Pratapgarh). This is what
 * search and answer engines read when somebody asks "delivery in <village>".
 */
export function localBusinessLd(o: { supportPhone: string; openTime: string; closeTime: string; villages: { name: string; nameEn: string }[] }): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'GroceryStore',
    '@id': `${SITE_URL}#store`,
    name: BRAND.nameHi,
    alternateName: [BRAND.nameEn, 'Fatanpur Bazar', 'फतनपुर बाजार'],
    description: 'फतनपुर बाज़ार, रानीगंज (प्रतापगढ़) की ऑनलाइन दुकान — आसपास के गाँवों में किराना, फल-सब्ज़ी, मिठाई और ज़रूरी सामान की होम डिलीवरी।',
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    image: `${SITE_URL}/og.jpg`,
    telephone: o.supportPhone ? `+91${o.supportPhone}` : undefined,
    priceRange: '₹',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Fatanpur Bazaar',
      addressLocality: BRAND.locality,
      addressRegion: BRAND.region,
      postalCode: BRAND.pincode,
      addressCountry: 'IN',
    },
    geo: { '@type': 'GeoCoordinates', latitude: BRAND.lat, longitude: BRAND.lng },
    areaServed: o.villages.slice(0, 30).map((v) => ({
      '@type': 'Place',
      name: v.name,
      alternateName: v.nameEn,
      containedInPlace: { '@type': 'AdministrativeArea', name: 'Raniganj tehsil, Pratapgarh, Uttar Pradesh' },
    })),
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: o.openTime, closes: o.closeTime },
    ],
    paymentAccepted: 'Cash, UPI',
    currenciesAccepted: 'INR',
    knowsLanguage: ['hi', 'en'],
  };
}

export function websiteLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND.nameHi,
    url: SITE_URL,
    inLanguage: 'hi-IN',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/khoj?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}

export function itemListLd(items: { name: string; path: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: `${SITE_URL}${it.path}` })),
  };
}

/**
 * Product + Offer. ⚠️ aggregateRating SIRF tab jab ratingCount >= 1 ho aur wahi number page pe dikhe —
 * khaali/fake aggregateRating Google penalty hai (A23).
 */
export function productLd(p: ProductDetail, imageAbs: string | null): Json {
  const ld: Json = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.nameHi ? `${p.nameHi} (${p.name})` : p.name,
    description: (p.description ?? '').replace(/<[^>]+>/g, ' ').trim().slice(0, 300) || `${p.name} — ${BRAND.nameHi}`,
    sku: String(p.id),
    brand: { '@type': 'Brand', name: p.brand ?? BRAND.nameHi },
    image: imageAbs ? [imageAbs] : undefined,
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/product/${p.slug}`,
      priceCurrency: 'INR',
      price: p.price,
      availability: p.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: BRAND.nameHi },
    },
  };
  if (p.rating.count >= 1) {
    ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating.avg, reviewCount: p.rating.count };
  }
  return ld;
}

export function faqLd(faqs: { question: string; answer: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer.replace(/<[^>]+>/g, ' ').trim() } })),
  };
}

export function blogPostingLd(p: { title: string; slug: string; excerpt: string | null; publishedAt: string; coverUrl?: string | null }): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title.slice(0, 110),
    description: p.excerpt ?? undefined,
    datePublished: p.publishedAt,
    dateModified: p.publishedAt,
    inLanguage: 'hi-IN',
    mainEntityOfPage: `${SITE_URL}/blog/${p.slug}`,
    image: p.coverUrl ?? undefined,
    author: { '@type': 'Organization', name: BRAND.nameHi },
    publisher: { '@type': 'Organization', name: BRAND.nameHi, logo: { '@type': 'ImageObject', url: `${SITE_URL}/icons/icon-512.png` } },
  };
}
