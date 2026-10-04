import { Log } from '../../common/logger';

/**
 * MiniMoth — OTP over WhatsApp, with SMS as the fallback.
 *
 * Why it is not just another `ISmsProvider`: Fast2SMS and MSG91 are couriers — we make the code,
 * they carry it. MiniMoth owns the whole challenge. It generates the code, decides whether it goes
 * by WhatsApp or SMS, and is the one that says whether what the customer typed was right. So it
 * cannot be handed our code to deliver; it has to be asked.
 *
 * That difference matters here in particular. Most people in these villages have WhatsApp and
 * patchy SMS delivery, and a DLT-registered SMS template takes weeks to approve. WhatsApp-first
 * with an automatic SMS fallback is the delivery this shop actually needs on day one.
 *
 * ⚠️ We keep our own session. MiniMoth hands back an access and a refresh token of its own, and we
 * deliberately ignore them. Every guard in this codebase — roles read from the database on each
 * request, ownership checks, session revocation, the last-admin lock, the 15-minute access window
 * with rotating refresh — is built on OUR sessions. Adopting a third party's tokens would mean
 * rebuilding all of it and handing an outside service the power to log anyone in. MiniMoth's job
 * ends at one sentence: "this person controls this phone number." Everything after that is ours.
 */

const BASE = 'https://api.minimoth.dev';
const TIMEOUT_MS = 10_000;

export interface OtpChallenge {
  /** MiniMoth's id for this challenge — stored in otp_requests.provider_ref. */
  ref: string;
}

export class MiniMothProvider {
  constructor(private readonly apiKey: string) {}

  private headers(): Record<string, string> {
    return { 'X-Api-Key': this.apiKey, 'content-type': 'application/json' };
  }

  /** E.164, which is what their API takes. Our phones are stored as 91XXXXXXXXXX. */
  private e164(phone10: string): string {
    return `+91${phone10}`;
  }

  async send(phone10: string): Promise<OtpChallenge> {
    const res = await fetch(`${BASE}/v1/otp/send`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ phone: this.e164(phone10) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      /*
       * `providerCode`, not `code` — the logger redacts anything called `code`, because that is
       * what an OTP is called. Their error name is the one thing worth reading here, and logging
       * it under that name printed "[redacted]" on every failure.
       */
      Log.warn('otp.minimoth.send_failed', { status: res.status, providerCode: String(body.code ?? body.error ?? '') });
      throw new Error(`minimoth send ${res.status}`);
    }
    // Their REST layer is snake_case and their SDK is camelCase; accept either rather than break
    // on a naming detail we cannot see from here.
    const ref = String(body.otp_id ?? body.otpId ?? '');
    if (!ref) {
      Log.warn('otp.minimoth.no_id', { keys: Object.keys(body).join(',') });
      throw new Error('minimoth send: no otp id in response');
    }
    return { ref };
  }

  /**
   * Ask MiniMoth whether this code is right.
   *
   * Returns a plain boolean. Everything else that happens on a wrong code — counting the attempt,
   * consuming the row, the Hindi "{n} कोशिश बची हैं" — stays in AuthService, so the rules are the
   * same whichever driver is in use.
   *
   * ⚠️ The field is `code`, not `otp`.
   *
   * Their Node SDK reads `verify({ phone, otp })`, so this was written to send `otp` — and every
   * correct OTP came back rejected, because their REST layer validates a field called `code` and
   * never saw one. The giveaway was in the error name: `INVALID_OTP_CODE` is a 422 meaning "the
   * code field must be six digits", while a genuinely wrong code is `INVALID_OTP`, a 400. Two
   * codes one word apart, and the shopkeeper spent an evening convinced he was mistyping.
   *
   * `otp` is still sent alongside it. Their validator accepted the unknown `otp` field without
   * complaint while asking for `code`, which proves it ignores extra keys — so carrying both costs
   * nothing and survives them renaming it back.
   */
  async verify(phone10: string, otp: string): Promise<boolean> {
    let res: Response;
    try {
      res = await fetch(`${BASE}/v1/otp/verify`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ phone: this.e164(phone10), code: otp, otp }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // A network failure is not a wrong code. Saying "गलत OTP" to someone who typed it correctly
      // is the worse error, so this surfaces as a failure rather than a rejection.
      Log.error('otp.minimoth.verify_unreachable', { err: String(e) });
      throw new Error('minimoth verify unreachable');
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && body.valid !== false) return true;

    const providerCode = String(body.code ?? body.error ?? res.status);
    /*
     * Only a genuinely wrong code counts as a wrong code.
     *
     * Everything else in this list is our problem or theirs — a malformed request, a bad key, an
     * empty wallet, an OTP they have already locked. Returning `false` for those charges the
     * customer one of his three attempts for a fault that is not his, which is exactly what the
     * `code`/`otp` mix-up did: three strikes and a new OTP, forever, and the log said "wrong OTP"
     * every time. These throw instead, so the customer is told something went wrong rather than
     * being blamed, and keeps his attempts.
     */
    const OURS = new Set(['INVALID_OTP_CODE', 'INVALID_PHONE', 'MISSING_API_KEY', 'INVALID_API_KEY', 'INSUFFICIENT_BALANCE', 'VERIFY_RATE_LIMITED', 'OTP_REQUEST_NOT_FOUND']);
    if (res.status >= 500 || OURS.has(providerCode)) {
      Log.warn('otp.minimoth.verify_error', { status: res.status, providerCode });
      throw new Error(`minimoth verify ${providerCode}`);
    }
    // A wrong (or expired) code is an ordinary outcome.
    Log.info('otp.minimoth.verify_rejected', { providerCode });
    return false;
  }
}
