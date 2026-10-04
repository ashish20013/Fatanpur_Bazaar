import type { ReactNode } from 'react';
import type { AssignmentView, AvailableOrder } from '@fb/shared-types';
import { RiderPanel } from '@/components/delivery/RiderPanel';
import { StatCard } from '@/components/admin/table';
import { authed } from '@/lib/data';
import { rupees } from '@/lib/format';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface Earnings {
  walletBalance: string;
  codInHand: string;
  totalDeliveries: number;
  rating: string;
  onDuty: boolean;
  today: { deliveries: number; earning: string };
}

export default async function Page(): Promise<ReactNode> {
  const [lang, assignments, pool, earnings] = await Promise.all([
    staffLang(),
    authed<AssignmentView[]>('/delivery/assignments').catch(() => [] as AssignmentView[]),
    authed<AvailableOrder[]>('/delivery/pool').catch(() => [] as AvailableOrder[]),
    authed<Earnings>('/delivery/earnings'),
  ]);
  const t = dict(lang);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t.staff.dashboard}</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.staff.todayOrders} value={earnings.today.deliveries} />
        <StatCard label={t.staff.earnings} value={rupees(earnings.today.earning)} />
        <StatCard label={t.staff.codInHand} value={rupees(earnings.codInHand)} tone={Number(earnings.codInHand) > 3000 ? 'danger' : 'default'} />
        <StatCard label={t.account.wallet} value={rupees(earnings.walletBalance)} href="/delivery/earnings" />
      </div>
      <RiderPanel lang={lang} assignments={assignments} pool={pool} onDuty={earnings.onDuty} />
    </div>
  );
}
