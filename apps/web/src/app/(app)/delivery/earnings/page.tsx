import type { ReactNode } from 'react';
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
  const [lang, e] = await Promise.all([staffLang(), authed<Earnings>('/delivery/earnings')]);
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.earnings}</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.account.wallet} value={rupees(e.walletBalance)} />
        <StatCard label={t.staff.codInHand} value={rupees(e.codInHand)} tone={Number(e.codInHand) > 3000 ? 'danger' : 'default'} hint="Deposit at the shop" />
        <StatCard label="Total deliveries" value={e.totalDeliveries} />
        <StatCard label="Rating" value={e.rating} />
      </div>
      <p className="text-base text-ink-2">
        Your "{t.staff.codInHand}" goes down only after you deposit the cash at the shop — the admin records the deposit slip.
      </p>
    </div>
  );
}
