import type { ReactNode } from 'react';
import { BannersAdmin, type BannerRow } from '@/components/admin/BannersAdmin';
import { LoadError } from '@/components/admin/form-kit';
import { authed } from '@/lib/data';

export const dynamic = 'force-dynamic';

/** Home / category banners (API: content.manage). */
export default async function Page(): Promise<ReactNode> {
  const rows = await authed<BannerRow[]>('/admin/banners').catch(() => null);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Banners</h1>
      {rows ? <BannersAdmin rows={rows} /> : <LoadError what="banners" href="/admin/banners" />}
    </div>
  );
}
