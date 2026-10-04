import type { ReactNode } from 'react';
import { LoadError } from '@/components/admin/form-kit';
import { ProductEditor } from '@/components/admin/ProductEditor';
import type { CategoryOption, SupplierOption } from '@/components/admin/product-form-model';
import { authed } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** New product/service. Photos are added on the edit page right after it is created. */
export default async function Page(): Promise<ReactNode> {
  const [categories, suppliers] = await Promise.all([authed<CategoryOption[]>('/admin/categories').catch(() => null), authed<SupplierOption[]>('/admin/suppliers').catch(() => [] as SupplierOption[])]);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">New product</h1>
      {categories ? <ProductEditor product={null} categories={categories} suppliers={suppliers} /> : <LoadError what="categories" href="/admin/products/new" />}
    </div>
  );
}
