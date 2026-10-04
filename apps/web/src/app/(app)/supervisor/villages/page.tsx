import type { ReactNode } from 'react';
import { VillagesAdmin, type VillageRow } from '@/components/admin/VillagesAdmin';
import { authed } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** A8.10 — गाँव manage (SUPERVISOR को भी मिलता है, यह रोज़ का काम है). */
export default async function Page(): Promise<ReactNode> {
  const [lang, rows] = await Promise.all([staffLang(), authed<VillageRow[]>('/admin/villages')]);
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.villages}</h1>
      <VillagesAdmin lang={lang} rows={rows} />
    </div>
  );
}
