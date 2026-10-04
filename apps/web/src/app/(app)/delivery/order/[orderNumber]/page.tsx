import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import type { AssignmentView } from '@fb/shared-types';
import { RiderPanel } from '@/components/delivery/RiderPanel';
import { authed } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Ek hi assignment ka detail — wahi actions, sirf ek order pe (push notification isi pe le aati hai). */
export default async function Page({ params }: { params: Promise<{ orderNumber: string }> }): Promise<ReactNode> {
  const { orderNumber } = await params;
  const [lang, all] = await Promise.all([staffLang(), authed<AssignmentView[]>('/delivery/assignments').catch(() => [] as AssignmentView[])]);
  const t = dict(lang);
  const one = all.filter((a) => a.orderNumber === orderNumber);
  if (!one.length) notFound();
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{orderNumber}</h1>
      <RiderPanel lang={lang} assignments={one} onDuty showPool={false} />
      <Link href="/delivery" className="text-base font-semibold text-g-700">
        ← {t.staff.dashboard}
      </Link>
    </div>
  );
}
