import type { ReactNode } from 'react';
import type { AssignmentView, AvailableOrder } from '@fb/shared-types';
import { RiderPanel } from '@/components/delivery/RiderPanel';
import { authed } from '@/lib/data';
import { dict } from '@/lib/i18n';
import { staffLang } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Page(): Promise<ReactNode> {
  const [lang, assignments, pool, earnings] = await Promise.all([
    staffLang(),
    authed<AssignmentView[]>('/delivery/assignments').catch(() => [] as AssignmentView[]),
    authed<AvailableOrder[]>('/delivery/pool').catch(() => [] as AvailableOrder[]),
    authed<{ onDuty: boolean }>('/delivery/earnings'),
  ]);
  const t = dict(lang);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">{t.staff.assignments}</h1>
      <RiderPanel lang={lang} assignments={assignments} pool={pool} onDuty={earnings.onDuty} />
    </div>
  );
}
