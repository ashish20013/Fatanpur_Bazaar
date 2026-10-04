import type { Knex } from 'knex';
import { SCOPED_ADMIN_DEFAULT_PERMISSIONS } from '@fb/shared-types';
import { referralCode } from '../../common/utils/ids';

/**
 * Who owns this shop, and who merely helps run it.
 *
 * The owner asked for two admin accounts: his own number as the global admin, and a second admin
 * on the shop's support number whose access he decides. That is a fact about this business, not a
 * schema change, so it lives in the seed: `npm run db:seed` can be run again on a database in any
 * state and this lands correctly. A migration could not — it runs once, and on a database where
 * neither user existed yet it would have matched nothing, marked itself applied, and left the shop
 * with no owner. That is precisely how the category pictures went missing, and losing the owner
 * account is a worse version of the same mistake.
 *
 * Idempotent and deliberately conservative:
 *  • the owner is promoted or created, and any other row still carrying the flag loses it — there
 *    is exactly one global admin, always;
 *  • the second admin is created only if that number is not already someone (an existing customer
 *    is promoted, keeping his orders and wallet; existing staff are left completely alone);
 *  • his permissions are seeded ONLY on the run that creates him. After that the owner owns that
 *    list, and a later `db:seed` must never hand back access he deliberately took away.
 */

export interface GlobalAdminSeedResult {
  ownerId: number;
  secondAdminId: number | null;
}

export async function seedGlobalAdmin(db: Knex, log: (m: string) => void): Promise<GlobalAdminSeedResult> {
  const ownerPhone10 = (await db('settings').where({ key: 'global_admin_phone' }).first('value'))?.value || '8576891104';
  const supportPhone10 = (await db('settings').where({ key: 'support_phone' }).first('value'))?.value || '9616038670';

  return db.transaction(async (trx) => {
    const ownerId = await upsertAdmin(trx, String(ownerPhone10), 'मालिक (Owner)', 'Owner', log);
    // One owner. If a flag was ever set by hand on another row, it is cleared here rather than
    // left to produce two accounts that both bypass every check.
    await trx('users').update({ is_global_admin: 0 }).whereNot({ id: ownerId }).where({ is_global_admin: 1 });
    await trx('users').where({ id: ownerId }).update({ is_global_admin: 1, role: 'ADMIN', status: 'ACTIVE' });
    log(`global admin: ${mask(String(ownerPhone10))} (user #${ownerId})`);

    let secondAdminId: number | null = null;
    if (String(supportPhone10) !== String(ownerPhone10)) {
      const phone = `91${supportPhone10}`;
      const existing = await trx('users').where({ phone }).forUpdate().first('id', 'role');
      /*
       * "Newly an admin" means anything that was not an ADMIN a moment ago — not just a customer.
       *
       * A supervisor promoted here would otherwise land with nothing: the ADMIN role deliberately
       * no longer reads `role_permissions`, so the supervisor grants he used to inherit from his
       * role vanish the instant his role changes, and he would open the panel to find every screen
       * shut. Only an account that was already an ADMIN keeps its list untouched, because that
       * list is the owner's decision and a re-run of the seed must never undo it.
       */
      const isNewAdmin = !existing || existing.role !== 'ADMIN';
      secondAdminId = await upsertAdmin(trx, String(supportPhone10), 'दुकान एडमिन', 'Shop admin', log);
      await trx('users').where({ id: secondAdminId }).update({ is_global_admin: 0 });
      if (isNewAdmin) {
        // Only on creation — see the note above. `INSERT IGNORE`-style so a re-run is harmless.
        for (const code of SCOPED_ADMIN_DEFAULT_PERMISSIONS) {
          // (user_id, permission_code) is the primary key, so this upsert is the whole story.
          await trx('user_permissions')
            .insert({ user_id: secondAdminId, permission_code: code, granted: 1, granted_by: ownerId })
            .onConflict(['user_id', 'permission_code'])
            .merge({ granted: 1, granted_by: ownerId });
        }
        log(`second admin: ${mask(String(supportPhone10))} (user #${secondAdminId}) — ${SCOPED_ADMIN_DEFAULT_PERMISSIONS.length} permissions granted`);
      } else {
        log(`second admin: ${mask(String(supportPhone10))} already exists — permissions left untouched`);
      }
    }
    return { ownerId, secondAdminId };
  });
}

/** Never print a full phone number into a log file that gets pasted into a chat. */
function mask(p: string): string {
  return p.length >= 10 ? `${p.slice(0, 2)}******${p.slice(-2)}` : '**********';
}

async function upsertAdmin(trx: Knex.Transaction, phone10: string, nameHi: string, designation: string, log: (m: string) => void): Promise<number> {
  const phone = `91${phone10}`;
  const row = await trx('users').where({ phone }).forUpdate().first('id', 'role', 'name');
  let id: number;
  if (row) {
    id = row.id;
    if (row.role !== 'ADMIN') {
      // A customer being promoted keeps his cart, orders and wallet (A7 §3) — but every session
      // he already holds is minted with the old role, so they go.
      await trx('users').where({ id }).update({ role: 'ADMIN', status: 'ACTIVE', name: row.name || nameHi });
      await trx('auth_sessions').where({ user_id: id }).whereNull('revoked_at').update({ revoked_at: trx.fn.now(), revoke_reason: 'promoted' });
      log(`promoted ${mask(phone10)} to ADMIN — its old sessions were revoked`);
    }
  } else {
    [id] = await trx('users').insert({ phone, name: nameHi, role: 'ADMIN', status: 'ACTIVE', referral_code: referralCode(10) });
    await trx('wallets').insert({ user_id: id, balance: 0 });
  }
  if (!(await trx('staff_profiles').where({ user_id: id }).first('user_id'))) {
    await trx('staff_profiles').insert({ user_id: id, employee_code: await nextEmployeeCode(trx), designation, joined_on: trx.raw('CURDATE()') });
  }
  return id;
}

async function nextEmployeeCode(trx: Knex.Transaction): Promise<string> {
  const [{ n }] = (await trx('staff_profiles').count({ n: '*' })) as { n: number }[];
  for (let i = Number(n) + 1; i < Number(n) + 200; i++) {
    const code = `EMP-${String(i).padStart(3, '0')}`;
    if (!(await trx('staff_profiles').where({ employee_code: code }).first('user_id'))) return code;
  }
  throw new Error('Could not allocate an employee code');
}
