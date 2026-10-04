import type { ReactNode } from 'react';
import { CouponsAdmin, type CouponRow } from '@/components/admin/CouponsAdmin';
import { authed } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Page(): Promise<ReactNode> {
  const [lang, rows] = await Promise.all([staffLang(), authed<CouponRow[]>('/admin/coupons')]);
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.coupons}</h1>
      <CouponsAdmin lang={lang} rows={rows} />
    </div>
  );
}
