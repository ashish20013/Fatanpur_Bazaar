import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LoadError } from '@/components/admin/form-kit';
import { RidersAdmin } from '@/components/admin/RidersAdmin';
import type { StaffRow } from '@/components/admin/StaffAdmin';
import { EmptyState } from '@/components/ui';
import { authed, getMe } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * Delivery partners — SUPERVISOR with staff.manage_riders (ADMIN also works).
 * ⚠️ This check is only UX; the API rejects anything outside the rider scope.
 */
export default async function Page(): Promise<ReactNode> {
  const me = await getMe();
  if (!me) redirect('/login');
  const isAdmin = me.role === 'ADMIN';
  const allowed = isAdmin || (me.role === 'SUPERVISOR' && me.permissions.includes('staff.manage_riders'));
  if (!allowed) {
    return (
      <div className="fb-card">
        <EmptyState icon="lock" title="No access" body="Managing delivery partners needs the “Manage delivery partners” permission. Ask the admin." />
      </div>
    );
  }
  const rows = await authed<StaffRow[]>('/admin/staff').catch(() => null);
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">Delivery partners</h1>
        <p className="text-base text-ink-2">Add riders, and disable anyone who has left. Disabling logs them out on every phone immediately.</p>
      </div>
      {rows ? <RidersAdmin rows={rows.filter((r) => r.role === 'DELIVERY_BOY')} actorPermissions={me.permissions} isAdmin={isAdmin} /> : <LoadError what="delivery partners" href="/supervisor/riders" />}
    </div>
  );
}
