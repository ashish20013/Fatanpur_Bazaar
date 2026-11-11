import type { Knex } from 'knex';

/**
 * The customer name the review account carries.
 *
 * ⚠️ This is the safety mechanism, not decoration. Nothing in the order pipeline knows or cares
 * that a review account exists — so instead of a flag threaded through the order transaction, the
 * warning rides on the one field that every screen, every push and every alert already shows: the
 * customer's name. The shopkeeper sees "saman na bhejein" on the order card, on the delivery
 * board, in the rider's alert and in the bill, with no change to the code that builds any of them.
 */
const REVIEW_NAME = 'Google Play Review (TEST — saman na bhejein)';
const REVIEW_LINE1 = 'TEST ADDRESS — Google Play review account';
const REVIEW_LANDMARK = 'TEST — is pate par koi saman na bhejein';

export interface ReviewSetupResult {
  userId: number;
  created: boolean;
  village: string;
  addressId: number;
}

/**
 * Makes the Google Play review account usable, and nothing more.
 *
 * A reviewer sitting outside India cannot add a village address to our 6 km service area, so a
 * login alone would leave them staring at a checkout they cannot complete — which is itself a
 * rejection reason. This gives the account one ready address in an active village, a wallet row
 * like any customer, and the warning name above.
 *
 * ⚠️ The role is the literal 'CUSTOMER'. This function is not a way to make staff, and it refuses
 * outright if the number already belongs to staff rather than quietly rewriting their row.
 */
export async function setupPlayReviewAccount(db: Knex, phone10: string): Promise<ReviewSetupResult> {
  const phone = `91${phone10}`;
  const existing = (await db('users').where({ phone }).first('id', 'role')) as { id: number; role: string } | undefined;
  if (existing && existing.role !== 'CUSTOMER') {
    throw new Error(`${phone10} is already a ${existing.role}. Pick a different PLAY_REVIEW_PHONE — this command will not touch a staff account.`);
  }

  const village = (await db('villages').where({ is_active: 1 }).orderBy([{ column: 'is_popular', order: 'desc' }, { column: 'distance_km', order: 'asc' }]).first('id', 'name')) as
    | { id: number; name: string }
    | undefined;
  if (!village) throw new Error('No active village found — run the seed first, or activate a village in the admin panel.');

  let userId = existing?.id ?? 0;
  let created = false;
  if (!userId) {
    const [id] = await db('users').insert({
      phone,
      name: REVIEW_NAME,
      role: 'CUSTOMER', // literal — never a variable (ROLE_PERMISSION_MATRIX §0 layer 3)
      status: 'ACTIVE',
      phone_verified: 1,
      referral_code: `PLAY${String(Date.now()).slice(-4)}`,
    });
    userId = id;
    created = true;
  } else {
    // Keep the warning name current even if someone renamed the account by hand.
    await db('users').where({ id: userId }).update({ name: REVIEW_NAME, status: 'ACTIVE', phone_verified: 1 });
  }

  const wallet = await db('wallets').where({ user_id: userId }).first('id');
  if (!wallet) await db('wallets').insert({ user_id: userId });

  let address = (await db('addresses').where({ user_id: userId }).whereNull('deleted_at').first('id')) as { id: number } | undefined;
  if (!address) {
    const [id] = await db('addresses').insert({
      user_id: userId,
      village_id: village.id,
      label: 'Ghar',
      receiver_name: REVIEW_NAME,
      phone: phone10,
      line1: REVIEW_LINE1,
      landmark: REVIEW_LANDMARK,
      // VILLAGE, because that is how it was decided: the village is the gate (A8.3), and this
      // account has no GPS reading to record. Writing RADIUS here would claim a check we never ran.
      check_method: 'VILLAGE',
      is_serviceable: 1,
      is_default: 1,
    });
    address = { id };
  }

  return { userId, created, village: village.name, addressId: address.id };
}

export { REVIEW_NAME };
