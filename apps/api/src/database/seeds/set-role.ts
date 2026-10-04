import type { Knex } from 'knex';
import { referralCode } from '../../common/utils/ids';

export type StaffRole = 'ADMIN' | 'SUPERVISOR' | 'DELIVERY_BOY';

/**
 * Operator-only role change (server shell + SETUP_TOKEN — never reachable over HTTP).
 * Used once at launch to move the owner's numbers into place (8576891104 → ADMIN,
 * 9616038670 → SUPERVISOR). Creates the user if it does not exist, ensures wallet + staff profile,
 * revokes every session of that user (their old token carried the old role), and is audited.
 * ⚠️ Refuses to leave the system without an ACTIVE ADMIN (same rule as the panel, A7).
 * ⚠️ Shell-only on purpose: it can create an ADMIN without the allow_admin_creation switch,
 *    because whoever has the server shell + SETUP_TOKEN already owns the system.
 */
export async function setStaffRole(db: Knex, phone10: string, role: StaffRole, name?: string): Promise<{ id: number; created: boolean; from: string | null }> {
  return db.transaction(async (trx) => {
    const phone = `91${phone10}`;
    const user = (await trx('users').where({ phone }).forUpdate().first('id', 'role', 'status', 'name')) as { id: number; role: string; status: string; name: string | null } | undefined;
    let id: number;
    let created = false;
    if (user) {
      id = user.id;
      if (user.role === 'ADMIN' && role !== 'ADMIN') {
        const others = await trx('users').where({ role: 'ADMIN', status: 'ACTIVE' }).whereNot({ id }).forUpdate().count<{ n: number }[]>({ n: '*' });
        if (!Number(others[0]?.n)) throw new Error('This is the last ACTIVE ADMIN — make another number ADMIN first, then run this again.');
      }
      await trx('users').where({ id }).update({ role, status: 'ACTIVE', ...(name ? { name } : {}) });
      // Per-person overrides were made for the OLD role; the new role starts from its own defaults.
      if (user.role !== role) await trx('user_permissions').where({ user_id: id }).delete();
    } else {
      [id] = await trx('users').insert({ phone, name: name ?? null, role, status: 'ACTIVE', referral_code: referralCode(10) });
      await trx('wallets').insert({ user_id: id, balance: 0 });
      created = true;
    }
    if (!(await trx('staff_profiles').where({ user_id: id }).first('id'))) {
      const code = `EMP-${String(id).padStart(3, '0')}`;
      await trx('staff_profiles').insert({ user_id: id, employee_code: code, designation: role === 'ADMIN' ? 'Owner' : role === 'SUPERVISOR' ? 'Supervisor' : 'Delivery partner', joined_on: trx.raw('CURDATE()') });
    }
    await trx('auth_sessions').where({ user_id: id }).whereNull('revoked_at').update({ revoked_at: trx.fn.now(), revoke_reason: 'role_change' });
    await trx('audit_logs').insert({ actor_id: null, actor_role: 'SYSTEM', action: 'staff.role_change', entity: 'user', entity_id: String(id), before_json: JSON.stringify({ role: user?.role ?? null }), after_json: JSON.stringify({ role, via: 'cli' }) });
    return { id, created, from: user?.role ?? null };
  });
}
