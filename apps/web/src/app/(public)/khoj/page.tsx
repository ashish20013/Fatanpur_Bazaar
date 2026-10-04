import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { SearchResponse } from '@fb/shared-types';
import { Breadcrumbs } from '@/components/list';
import { ProductGrid } from '@/components/product';
import { EmptyState, SectionTitle, buttonClass } from '@/components/ui';
import { api, ApiError, publicApi } from '@/lib/api';
import { getCart } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { buildMetadata } from '@/lib/seo';
import { currentLang } from '@/lib/session';

type Params = { searchParams: Promise<Record<string, string | undefined>> };

async function loadSearch(q: string): Promise<SearchResponse> {
  if (q.length < 2) return { query: q, items: [], suggestions: [], total: 0 };
  try {
    // ISR 60s — same query cached briefly; rate limit (120/5min/ip) hits the API rarely.
    return await publicApi<SearchResponse>(`/catalog/search?q=${encodeURIComponent(q)}`, 60);
  } catch (e) {
    if (e instanceof ApiError) return { query: q, items: [], suggestions: [], total: 0 };
    throw e;
  }
}

export async function generateMetadata({ searchParams }: Params): Promise<Metadata> {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 60);
  return buildMetadata({
    title: q ? `"${q}" के लिए खोज परिणाम — फतनपुर बाज़ार` : 'खोजें — फतनपुर बाज़ार पर सामान ढूंढें',
    description: q
      ? `फतनपुर बाज़ार पर "${q}" के लिए खोज परिणाम — ताज़ी सब्ज़ी, फल और किराना घर तक डिलीवरी, कैश ऑन डिलीवरी और UPI।`
      : 'फतनपुर बाज़ार पर सब्ज़ी, फल, किराना और सेवाएं खोजें — रानीगंज, प्रतापगढ़ में 6 किमी तक घर पर डिलीवरी।',
    path: '/khoj',
    noindex: true,
  });
}

/**
 * A10 §6 — zero result pe "हमें बताएं" form. Server Action (JS ke bina bhi kaam kare) —
 * poore page ke liye alag client component ki zaroorat nahi (§13 bundle budget).
 */
async function requestProduct(formData: FormData): Promise<void> {
  'use server';
  const query = String(formData.get('query') ?? '').trim().slice(0, 100);
  const name = String(formData.get('name') ?? '').trim().slice(0, 120);
  const phone = String(formData.get('phone') ?? '').replace(/\D/g, '').slice(0, 10);
  let ok = false;
  if (query.length >= 2 && name.length >= 1 && /^[6-9]\d{9}$/.test(phone)) {
    try {
      await api('/catalog/product-request', { method: 'POST', body: { query, name, phone } });
      ok = true;
    } catch {
      ok = false;
    }
  }
  redirect(`/khoj?q=${encodeURIComponent(query)}&requested=${ok ? '1' : '0'}`);
}

export default async function SearchPage({ searchParams }: Params): Promise<ReactNode> {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const requested = sp.requested;
  const [lang, result, cart] = await Promise.all([currentLang(), loadSearch(q), getCart()]);
  const t = dict(lang);
  const cartMap = new Map((cart?.items ?? []).map((i) => [i.productId, { itemId: i.id, quantity: i.quantity }]));
  const crumbs = [
    { name: t.nav.home, path: '/' },
    { name: t.search.title, path: '/khoj' },
  ];

  return (
    <div className="space-y-4">
      <Breadcrumbs items={crumbs} />
      {/* One h1 for every state of the page — the empty landing has no visible heading, so without
          this a search with no query would be a page with no h1 at all. */}
      <h1 className="sr-only">{q ? t.search.results(result.total, q) : t.search.title}</h1>

      {/* Plain GET form — JS ke bina bhi chalta hai, HeaderSearch (client) isi URL pattern pe bhejta hai */}
      {/* min-w-0 on the input: a text field refuses to shrink below its intrinsic size, so without
          it the "खोजें" button is pushed off the right edge of a 320 px screen. */}
      <form action="/khoj" method="GET" role="search" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t.search.placeholder}
          aria-label={t.search.title}
          className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-body outline-none focus:border-g-600"
        />
        <button type="submit" className={`shrink-0 ${buttonClass('primary', 'md')}`}>
          {t.search.title}
        </button>
      </form>

      {q.length < 2 ? (
        <EmptyState icon="search" title={t.search.placeholder} />
      ) : result.items.length ? (
        <>
          <h2 className="fb-display text-3xl leading-tight">{t.search.results(result.total, q)}</h2>
          <ProductGrid items={result.items} lang={lang} cartMap={cartMap} />
        </>
      ) : (
        <div className="space-y-4">
          <h2 className="fb-display text-3xl leading-tight">{t.search.results(0, q)}</h2>
          <EmptyState icon="basket" title={t.search.zero} />

          {result.suggestions.length ? (
            <section>
              <SectionTitle>{t.search.zeroSuggest}</SectionTitle>
              <ProductGrid items={result.suggestions} lang={lang} cartMap={cartMap} />
            </section>
          ) : null}

          <section className="fb-card p-4">
            {requested === '1' ? (
              <p className="text-base font-semibold text-ok">{t.search.tellUsDone}</p>
            ) : (
              <form action={requestProduct} className="space-y-2">
                <p className="text-base font-semibold">{t.search.tellUs}</p>
                <input type="hidden" name="query" value={q} />
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder={t.auth.name}
                  aria-label={t.auth.name}
                  className="h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600"
                />
                <input
                  name="phone"
                  required
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="9876543210"
                  aria-label={t.address.phone}
                  className="h-12 w-full rounded border border-line px-3 text-body outline-none focus:border-g-600"
                />
                <button type="submit" className={buttonClass('primary', 'md', true)}>
                  {t.search.submit}
                </button>
                {requested === '0' ? <p className="text-base text-danger">{t.common.error}</p> : null}
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
