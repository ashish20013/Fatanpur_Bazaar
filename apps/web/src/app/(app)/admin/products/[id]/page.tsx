import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LoadError } from '@/components/admin/form-kit';
import { ProductEditor } from '@/components/admin/ProductEditor';
import { ProductDanger, ProductPhotos, ProductStock } from '@/components/admin/ProductSideTools';
import type { CategoryOption, ProductDetail, SupplierOption } from '@/components/admin/product-form-model';
import { Icon } from '@/components/icons';
import { Badge } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { authed } from '@/lib/data';

export const dynamic = 'force-dynamic';

async function loadProduct(id: number): Promise<ProductDetail | null> {
  try {
    return await authed<ProductDetail>(`/admin/products/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    return null;
  }
}

/** Edit one product: full form + photos + stock + delete. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [p, categories, suppliers] = await Promise.all([loadProduct(id), authed<CategoryOption[]>('/admin/categories').catch(() => null), authed<SupplierOption[]>('/admin/suppliers').catch(() => [] as SupplierOption[])]);
  if (!p || !categories) return <LoadError what="this product" href={`/admin/products/${id}`} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-base text-ink-2">
            <span lang="hi">{p.name_hi ?? ''}</span>
            <Badge tone={p.is_available ? 'ok' : 'muted'}>{p.is_available ? 'On sale' : 'Hidden'}</Badge>
            <span className="text-sm text-ink-3">Sold {p.sold_count}</span>
          </p>
        </div>
        <Link href={`/product/${p.slug}`} target="_blank" className="inline-flex items-center gap-1 font-mono text-sm text-em-700">
          /product/{p.slug} <Icon name="external-link" size={14} />
        </Link>
      </div>
      {sp.created ? <p className="rounded border border-em-200 bg-em-50 px-3 py-2 text-base text-em-800">Product created. Add photos now so it looks good in the shop.</p> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="order-2 lg:order-1">
          <ProductEditor product={p} categories={categories} suppliers={suppliers} />
        </div>
        <aside className="order-1 space-y-4 lg:order-2">
          <ProductPhotos productId={p.id} images={p.images} defaultAlt={p.name_hi ?? p.name} />
          {p.item_type === 'PRODUCT' ? <ProductStock productId={p.id} stock={p.stock_qty} lowAt={p.low_stock_at} /> : null}
          <ProductDanger productId={p.id} name={p.name} />
        </aside>
      </div>
    </div>
  );
}
