import type { ReactNode } from 'react';
import { AddressManager } from '@/components/AddressManager';
import { dict } from '@/lib/i18n';
import { getShell } from '@/lib/shell';

export const dynamic = 'force-dynamic';

export default async function AddressesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }): Promise<ReactNode> {
  const [s, sp] = await Promise.all([getShell(), searchParams]);
  const t = dict(s.lang);
  return (
    <div className="space-y-4">
      <h1 className="fb-display text-3xl">{t.menu.addresses}</h1>
      <AddressManager
        lang={s.lang}
        initial={s.addresses}
        supportPhone={s.settings.supportPhone}
        startAdding={sp.new === '1'}
        defaults={{ receiverName: s.me?.name ?? '', phone: s.me?.phone ?? '', district: s.settings.defaultDistrict, pincode: s.settings.defaultPincode, requireLocation: s.settings.requireLocation }}
      />
    </div>
  );
}
