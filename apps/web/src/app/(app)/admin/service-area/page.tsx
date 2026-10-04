import type { ReactNode } from 'react';
import { ZoneEditor, type ZoneRow } from '@/components/admin/ZoneEditor';
import { EmptyState } from '@/components/ui';
import { authed } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** A8.6 — डिलीवरी क्षेत्र. Map editor की जगह radius + GeoJSON fallback (देखें ZoneEditor का नोट). */
export default async function Page(): Promise<ReactNode> {
  const [lang, zones] = await Promise.all([staffLang(), authed<ZoneRow[]>('/admin/service-area/zones')]);
  const t = dict(lang);
  const zone = zones[0];
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.serviceArea}</h1>
      {zone ? <ZoneEditor lang={lang} zone={zone} /> : <EmptyState icon="map-2" title={t.staff.noRows} />}
    </div>
  );
}
