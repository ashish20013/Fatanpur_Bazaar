import type { ReactNode } from 'react';
import { SettingsAdmin, type SettingRow } from '@/components/admin/SettingsAdmin';
import { authed } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** ⚠️ Settings ADMIN-only hai (permissions matrix) — SUPERVISOR ko grant ke baad bhi nahi milti. */
export default async function Page(): Promise<ReactNode> {
  const [lang, rows] = await Promise.all([staffLang(), authed<SettingRow[]>('/admin/settings')]);
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.settings}</h1>
      <SettingsAdmin lang={lang} rows={rows} />
    </div>
  );
}
