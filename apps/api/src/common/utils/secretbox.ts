import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Small AES-256-GCM box for the handful of secrets the shopkeeper types into the admin panel.
 *
 * The rule in this codebase is "secrets live in .env", and it stays the rule for anything the
 * server needs before it can boot — the database password, the JWT keys, the OTP key. The payment
 * gateway is the one case that cannot follow it: the owner will be handed his Cashfree keys weeks
 * after the site is live, from his phone, and telling him to SSH into Hostinger and edit a file to
 * start taking payments is not a plan. So those keys are typed into Admin → Payments.
 *
 * Typed in, but not left lying in a table. Two of those columns (the API secret and the webhook
 * secret) are enough to mint payment confirmations for orders nobody paid for, so a database dump
 * — a backup mailed to himself, an export, a stolen phpMyAdmin session — must not be enough to use
 * them. They are encrypted here with a key derived from APP_SECRET, which lives in .env and is
 * never in the database. Whoever holds the dump alone holds ciphertext.
 *
 * ⚠️ This protects a leaked dump, not a compromised server. Anyone who can read .env AND the
 * database can decrypt, and that is the honest limit of what is possible when the application
 * itself has to use the key. It is not a substitute for .env for anything .env can hold.
 *
 * ⚠️ Rotating APP_SECRET makes every value stored here unreadable. That is the intended behaviour
 * — a wrong key must fail loudly, not silently return rubbish to a payment call — and it is why
 * `open()` returns null instead of throwing: the caller reports "gateway keys not configured" and
 * the owner types them in again, which is a two-minute job, rather than the API failing to boot.
 */

const PREFIX = 'enc:v1:';

function keyFrom(appSecret: string): Buffer {
  // A label in the digest so this key can never collide with another use of APP_SECRET.
  return createHash('sha256').update(`fb:settings-secret:${appSecret}`).digest();
}

/** Encrypt a value for storage. An empty string stays empty — "not set" must look like "not set". */
export function seal(plain: string, appSecret: string): string {
  if (!plain) return '';
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(appSecret), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

/**
 * Decrypt a stored value. Returns null when it cannot be read — a wrong key, a truncated column,
 * a tampered row. Anything that was never sealed comes back as-is, so a key pasted straight into
 * the database by hand still works and nothing has to be migrated.
 */
export function open(stored: string | null | undefined, appSecret: string): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    if (raw.length < 29) return null;
    const d = createDecipheriv('aes-256-gcm', keyFrom(appSecret), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Is there a value here at all? Answers the admin screen without decrypting anything. */
export function isSet(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.length > 0;
}

/**
 * What the admin screen shows instead of the value.
 *
 * Never the real thing, not even the last four characters: a gateway secret has no "last four"
 * that is safe to print, and a screenshot of the settings page travels further than anyone expects.
 */
export const MASK = '••••••••';
