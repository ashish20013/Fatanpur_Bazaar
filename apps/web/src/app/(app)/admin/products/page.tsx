import type { ReactNode } from 'react';
import { LoadError } from '@/components/admin/form-kit';
import { ProductsAdmin, type AdminProductRow } from '@/components/admin/ProductsAdmin';
import { apiPaged } from '@/lib/api';
import { dict } from '@/lib/i18n';
import { accessToken, staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const [lang, sp, token] = await Promise.all([staffLang(), searchParams, accessToken()]);
  const t = dict(lang);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const qs = new URLSearchParams({ page: String(page) });
  // The API reads the search text from `q` (the page URL keeps `search` for readability).
  if (sp.search) qs.set('q', sp.search);
  const res = await apiPaged<AdminProductRow>(`/admin/products?${qs.toString()}`, { token }).catch(() => null);
  if (!res) return <LoadError what="products" href="/admin/products" />;
  const { items, meta } = res;
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">{t.staff.products}</h1>
      <ProductsAdmin lang={lang} rows={items} meta={meta} search={sp.search ?? ''} />
    </div>
  );
}
