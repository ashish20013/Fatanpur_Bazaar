import type { ReactNode } from 'react';
import { CategoriesAdmin, type CategoryRow } from '@/components/admin/CategoriesAdmin';
import { LoadError } from '@/components/admin/form-kit';
import { authed } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** Category tree (verticals → categories → sub-categories). ADMIN only via the nav; API gates categories.manage. */
export default async function Page(): Promise<ReactNode> {
  const rows = await authed<CategoryRow[]>('/admin/categories').catch(() => null);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Categories</h1>
      {rows ? <CategoriesAdmin rows={rows} /> : <LoadError what="categories" href="/admin/categories" />}
    </div>
  );
}
