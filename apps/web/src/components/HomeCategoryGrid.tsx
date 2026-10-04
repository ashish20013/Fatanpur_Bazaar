'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductCard } from '@fb/shared-types';
import { call } from '@/lib/client';
import { type Lang } from '@/lib/i18n';
import { ProductGridHome, ProductGridSkeleton } from './product';

/**
 * One category's shelf row on the home, loaded only when it is about to come into view.
 *
 * Each category shows ONE ROW of products (3 on mobile, up to 6 on xl). Six items are fetched —
 * the grid's visibility classes hide the surplus at narrower breakpoints. Lazy-loading keeps the
 * page inside the 50 KB 3G budget (§13) while still giving every category its shelf.
 *
 * `sort` matches the "अ से ज्ञ" order the section header promises, so the lazy grid and the "सब देखें"
 * page are in the same order.
 */
export function HomeCategoryGrid({ slug, lang }: { slug: string; lang: Lang }): React.ReactNode {
  const [items, setItems] = useState<ProductCard[] | null>(null);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Reveal ~600 px before it enters the viewport so the products are usually there by the time the
  // shopper reaches them. No IntersectionObserver (very old webview) → just load it.
  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  useEffect(() => {
    if (!show || items) return;
    let alive = true;
    const sort = lang === 'en' ? 'az_en' : 'az';
    call<ProductCard[]>(`/catalog/products?category=${encodeURIComponent(slug)}&perPage=${6}&sort=${sort}`)
      .then((d) => alive && setItems(d))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [show, items, slug, lang]);

  return <div ref={ref}>{items ? <ProductGridHome items={items} lang={lang} /> : <ProductGridSkeleton n={3} />}</div>;
}
