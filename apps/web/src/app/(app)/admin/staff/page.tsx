import type { ReactNode } from 'react';
import { StaffAdmin, type StaffRow } from '@/components/admin/StaffAdmin';
import { authed, getMe, getSettings } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** A7 — staff banane ka ek hi rasta. ⚠️ CUSTOMER yahan se nahi banta, aur ADMIN sirf tab jab allow_admin_creation ON ho. */
export default async function Page(): Promise<ReactNode> {
  const [lang, rows, settings, me] = await Promise.all([staffLang(), authed<StaffRow[]>('/admin/staff'), getSettings(), getMe()]);
  const t = dict(lang);
  const allowAdminCreation = settings.raw.allow_admin_creation === '1';
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.staff}</h1>
      <StaffAdmin lang={lang} rows={rows} allowAdminCreation={allowAdminCreation} viewerIsOwner={Boolean(me?.isGlobalAdmin)} />
    </div>
  );
}
