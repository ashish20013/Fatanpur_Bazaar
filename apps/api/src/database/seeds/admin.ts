import type { Knex } from 'knex';
import { referralCode } from '../../common/utils/ids';

/** One-time first-ADMIN bootstrap. Refuses to run if any ADMIN already exists. Audited as system.bootstrap. */
export async function bootstrapAdmin(db: Knex, phone10: string, name: string): Promise<{ id: number }> {
  return db.transaction(async (trx) => {
    const existing = await trx('users').where({ role: 'ADMIN' }).forUpdate().first('id');
    if (existing) throw new Error('An ADMIN already exists — create further admins from the admin panel (needs allow_admin_creation=1).');
    const phone = `91${phone10}`;
    const user = await trx('users').where({ phone }).first('id');
    let id: number;
    if (user) {
      id = user.id;
      await trx('users').where({ id }).update({ role: 'ADMIN', status: 'ACTIVE', name });
    } else {
      [id] = await trx('users').insert({ phone, name, role: 'ADMIN', status: 'ACTIVE', referral_code: referralCode(10) });
      await trx('wallets').insert({ user_id: id, balance: 0 });
    }
    if (!(await trx('staff_profiles').where({ user_id: id }).first('id'))) await trx('staff_profiles').insert({ user_id: id, employee_code: 'EMP-001', designation: 'Owner', joined_on: trx.raw('CURDATE()') });
    await trx('audit_logs').insert({ actor_id: id, actor_role: 'SYSTEM', action: 'system.bootstrap', entity: 'user', entity_id: String(id), after_json: JSON.stringify({ role: 'ADMIN' }) });
    return { id };
  });
}
