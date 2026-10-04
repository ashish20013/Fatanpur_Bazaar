import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { ROLE_HOME, type MeResponse, type Role } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { AppError, isDuplicateKey } from '../../common/errors';
import { Log } from '../../common/logger';
import { localPhone, maskPhone } from '../../common/utils/phone';
import { loginOtp, referralCode as newReferralCode } from '../../common/utils/ids';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { RateLimitService } from '../identity/rate-limit.service';
import { IdentityService } from '../identity/identity.service';
import { NotificationService } from '../notifications/notification.service';
import { Fast2SmsProvider, Msg91Provider, NullSmsProvider, type ISmsProvider } from './sms.provider';
import { MiniMothProvider } from './minimoth.provider';
import { REFRESH_RACE_GRACE_SEC, TokenService, type DeviceInfo } from './token.service';
import type { OtpSendDto, OtpVerifyDto } from './auth.schemas';

const BCRYPT_COST = 8; // ~15 ms on a shared core; OTPs are short-lived and attempt-limited
/** Pre-computed hash so "no OTP row" costs the same time as a real compare (enumeration). */
const DUMMY_HASH = bcrypt.hashSync('000000', BCRYPT_COST);

interface OtpRow {
  id: number;
  code_hash: string;
  purpose: 'LOGIN' | 'STAFF_LOGIN' | 'PHONE_CHANGE';
  attempts: number;
  expires_at: Date;
  /** Set only when an outside service owns the code (MiniMoth). NULL → we own it. */
  provider_ref: string | null;
}
interface UserRow {
  id: number;
  phone: string;
  name: string | null;
  role: Role;
  status: string;
  phone_verified: number;
  referral_code: string | null;
}

export interface VerifyResult {
  user: { id: number; name: string | null; phone: string; role: Role };
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  redirect: string;
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
    private readonly settings: SettingsService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimitService,
    private readonly identity: IdentityService,
    private readonly notify: NotificationService,
  ) {}

  // ───────────────────────── A2: send ─────────────────────────
  async sendOtp(dto: OtpSendDto, ip: string): Promise<{ sent: true; expiresIn: number; resendAfter: number }> {
    const phone = `91${dto.phone}`;
    await this.limiter.hit(`otp:send:${phone}`, 3, 900);
    await this.limiter.hit(`otp:send:ip:${ip}`, 10, 900);

    const resendSec = await this.settings.int('otp_resend_cooldown_sec', 60);
    const ttlSec = await this.settings.int('otp_ttl_seconds', 300);
    const recent = await this.db('otp_requests')
      .where({ phone })
      .where('created_at', '>', this.db.raw('NOW() - INTERVAL ? SECOND', [resendSec]))
      .first('id');
    if (recent) throw new AppError('OTP_COOLDOWN', {}, { headers: { 'Retry-After': String(resendSec) } });

    if (dto.purpose === 'STAFF_LOGIN') {
      // ⚠️ Staff login never CREATES an account (matrix §1). Unknown/customer phone → 401.
      const u = await this.db('users').where({ phone }).first('role', 'status');
      if (!u || u.role === 'CUSTOMER') {
        await bcrypt.compare('000000', DUMMY_HASH); // keep timing flat
        await this.audit.log({ actorId: null, action: 'login.staff_denied', entityType: 'phone', entityId: maskPhone(phone), ip });
        throw new AppError('STAFF_NOT_FOUND');
      }
    }

    /*
     * The login driver comes from .env and nowhere else.
     *
     * It used to fall back to a settings row, so the shopkeeper could switch it from the admin
     * panel. He asked for that to stop, and he is right: this one setting decides how every person
     * gets into the shop. A wrong value here does not degrade anything gracefully — it locks out
     * every customer at once, and the person who could fix it is the one who just changed it.
     *
     * It is also enforced at the other end: `otp_driver` is in the settings service's LOCKED list,
     * so the API refuses to change it at all. Neither half is decorative — this line means the DB
     * value is ignored even if a row somehow holds one, and the lock means no row can be written.
     */
    const driverName = this.env.SMS_DRIVER;
    const minimoth = driverName === 'minimoth' ? this.minimothProvider() : null;

    /*
     * Two shapes of OTP, one table.
     *
     * With a courier (Fast2SMS, MSG91, or the dev log) we mint the code ourselves and store its
     * bcrypt hash. With MiniMoth the code never exists on this server: it generates, delivers and
     * checks it, and all we keep is its reference.
     *
     * ⚠️ In that case `code_hash` is a hash of random bytes nobody holds. It is not a placeholder
     * for tidiness — the column is NOT NULL, and if it held something guessable then a bug that
     * took the local path for a MiniMoth row could let a guessed code through. This way that
     * compare can only ever fail.
     */
    const otp = minimoth ? null : loginOtp(); // crypto.randomInt
    const codeHash = await bcrypt.hash(otp ?? randomBytes(24).toString('hex'), BCRYPT_COST);
    const [otpId] = await this.db('otp_requests').insert({
      phone,
      code_hash: codeHash,
      purpose: dto.purpose,
      // The row records how the code ACTUALLY went out, not what was asked for: a MiniMoth
      // request that fell back to the courier path is an SMS (or a dev log), and a row that
      // claims WHATSAPP when nothing reached WhatsApp is a lie to whoever debugs this later.
      channel: minimoth ? 'WHATSAPP' : driverName === 'null' || !this.courierConfigured(driverName) ? 'DEV' : 'SMS',
      expires_at: this.db.raw('DATE_ADD(NOW(), INTERVAL ? SECOND)', [ttlSec]),
      ip_address: ip,
    });
    try {
      if (minimoth) {
        const challenge = await minimoth.send(localPhone(phone));
        await this.db('otp_requests').where({ id: otpId }).update({ provider_ref: challenge.ref });
      } else {
        await this.smsProvider(driverName).sendOtp(localPhone(phone), otp as string);
      }
    } catch (e) {
      await this.db('otp_requests').where({ id: otpId }).update({ consumed_at: this.db.fn.now() });
      Log.error('otp.send_failed', { driver: driverName, phone: maskPhone(phone), err: String(e) });
      throw new AppError('OTP_SEND_FAILED');
    }
    // ⚠️ Identical response for registered and unregistered phones (enumeration).
    return { sent: true, expiresIn: ttlSec, resendAfter: resendSec };
  }

  /**
   * A MiniMoth row whose key has since been removed, or MiniMoth being unreachable, must not be
   * read as "wrong OTP" — that would tell someone who typed the right code that they typed it
   * wrong, and burn one of their three attempts doing it.
   */
  private async verifyWithMiniMoth(phone10: string, otp: string): Promise<boolean> {
    const provider = this.minimothProvider();
    // OTP_CHECK_FAILED, not OTP_SEND_FAILED: nothing was being sent here, and its message ("OTP
    // नहीं भेज पाए") sends someone to ask for a new code when the one in their hand is fine.
    if (!provider) throw new AppError('OTP_CHECK_FAILED');
    try {
      return await provider.verify(phone10, otp);
    } catch {
      // The throw reaches here BEFORE the attempt counter is touched, which is deliberate: a fault
      // at our end must not spend one of the customer's three tries.
      throw new AppError('OTP_CHECK_FAILED');
    }
  }

  /** Null when no key is configured — the caller then falls back to the courier path. */
  private minimothProvider(): MiniMothProvider | null {
    if (!this.env.MINIMOTH_API_KEY) {
      Log.warn('otp.minimoth.no_key', { hint: 'otp_driver is minimoth but MINIMOTH_API_KEY is unset — falling back' });
      return null;
    }
    return new MiniMothProvider(this.env.MINIMOTH_API_KEY);
  }

  /** True when the named courier has the credentials it needs; false means NullSmsProvider. */
  private courierConfigured(driver: string): boolean {
    if (driver === 'fast2sms') return Boolean(this.env.SMS_API_KEY);
    if (driver === 'msg91') return Boolean(this.env.SMS_API_KEY && this.env.SMS_TEMPLATE_ID);
    return false;
  }

  private smsProvider(driver: string): ISmsProvider {
    if (driver === 'fast2sms' && this.env.SMS_API_KEY) return new Fast2SmsProvider(this.env.SMS_API_KEY, this.env.SMS_SENDER_ID, this.env.SMS_TEMPLATE_ID);
    if (driver === 'msg91' && this.env.SMS_API_KEY && this.env.SMS_TEMPLATE_ID) return new Msg91Provider(this.env.SMS_API_KEY, this.env.SMS_TEMPLATE_ID);
    return new NullSmsProvider(this.env.STORAGE_PATH, this.env.NODE_ENV === 'production');
  }

  // ───────────────────────── A3: verify + register ─────────────────────────
  async verifyOtp(dto: OtpVerifyDto, device: DeviceInfo): Promise<VerifyResult> {
    const phone = `91${dto.phone}`;
    await this.limiter.hit(`otp:verify:${phone}`, 5, 900);
    const maxAttempts = await this.settings.int('otp_max_attempts', 3);

    const row = (await this.db('otp_requests').where({ phone }).whereNull('consumed_at').orderBy('id', 'desc').first('id', 'code_hash', 'purpose', 'attempts', 'expires_at', 'provider_ref')) as OtpRow | undefined;
    if (!row) {
      await bcrypt.compare(dto.otp, DUMMY_HASH);
      throw new AppError('OTP_INVALID', { n: 0 });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) throw new AppError('OTP_EXPIRED');
    if (row.attempts >= maxAttempts) {
      await this.db('otp_requests').where({ id: row.id }).update({ consumed_at: this.db.fn.now() });
      throw new AppError('OTP_TOO_MANY');
    }
    /*
     * Who checks the code depends on who made it. The consequences of it being wrong — the attempt
     * counter, consuming the row on the last try, the Hindi message with the attempts left — are
     * identical either way, so those rules live here and not in the driver.
     */
    const ok = row.provider_ref
      ? await this.verifyWithMiniMoth(localPhone(phone), dto.otp)
      : await bcrypt.compare(dto.otp, row.code_hash);
    if (!ok) {
      await this.db('otp_requests').where({ id: row.id }).increment('attempts', 1);
      const left = Math.max(0, maxAttempts - row.attempts - 1);
      if (left === 0) await this.db('otp_requests').where({ id: row.id }).update({ consumed_at: this.db.fn.now() });
      throw new AppError('OTP_INVALID', { n: left });
    }
    // Replay protection: consume BEFORE creating the session.
    const consumed = await this.db('otp_requests').where({ id: row.id }).whereNull('consumed_at').update({ consumed_at: this.db.fn.now() });
    if (!consumed) throw new AppError('OTP_INVALID', { n: 0 });

    const { user, isNewUser } = await this.db.transaction(async (trx) => {
      const existing = (await trx('users').where({ phone }).forUpdate().first('id', 'phone', 'name', 'role', 'status', 'phone_verified', 'referral_code')) as UserRow | undefined;
      if (!existing) return { user: await this.createCustomer(trx, phone, dto.name, dto.referralCode, device.ip ?? null), isNewUser: true };
      if (existing.status !== 'ACTIVE') throw new AppError('ACCOUNT_DISABLED');
      if (row.purpose === 'STAFF_LOGIN' && existing.role === 'CUSTOMER') throw new AppError('STAFF_NOT_FOUND');
      await trx('users')
        .where({ id: existing.id })
        .update({ last_login_at: trx.fn.now(), phone_verified: 1, ...(dto.name && !existing.name ? { name: dto.name } : {}) });
      return { user: { ...existing, name: existing.name ?? dto.name ?? null }, isNewUser: false };
    });

    const issued = await this.tokens.issue({ id: user.id, role: user.role }, device);
    if (user.role !== 'CUSTOMER') await this.audit.log({ actorId: user.id, actorRole: user.role, action: 'login.staff', entityType: 'user', entityId: user.id, ip: device.ip });
    return {
      user: { id: user.id, name: user.name, phone: localPhone(user.phone), role: user.role },
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresIn: issued.expiresIn,
      redirect: ROLE_HOME[user.role],
      isNewUser,
    };
  }

  /**
   * THE ONLY public account-creation path. `role` is the literal CUSTOMER — never a variable,
   * parameter or spread (ROLE_PERMISSION_MATRIX §0 layer 3; CI greps for `...dto`).
   */
  private async createCustomer(trx: Knex.Transaction, phone: string, name: string | undefined, referral: string | undefined, ip: string | null): Promise<UserRow> {
    let userId = 0;
    let code = '';
    for (let attempt = 0; attempt < 5 && !userId; attempt++) {
      code = newReferralCode();
      try {
        [userId] = await trx('users').insert({
          phone,
          name: name ?? null,
          role: 'CUSTOMER',
          status: 'ACTIVE',
          phone_verified: 1,
          referral_code: code,
          last_login_at: trx.fn.now(),
        });
      } catch (e) {
        if (!isDuplicateKey(e) || String(e).includes('uq_users_phone')) throw e;
      }
    }
    if (!userId) throw new Error('Could not allocate a unique referral code');
    await trx('wallets').insert({ user_id: userId, balance: 0 });
    if (referral) {
      const referrer = await trx('users').where({ referral_code: referral, status: 'ACTIVE' }).first('id');
      // Reward is NOT paid here — only after the first genuine delivered order (A22).
      if (referrer && referrer.id !== userId) await trx('referrals').insert({ referrer_id: referrer.id, referred_id: userId, signup_ip: ip });
    }
    return { id: userId, phone, name: name ?? null, role: 'CUSTOMER', status: 'ACTIVE', phone_verified: 1, referral_code: code };
  }

  // ───────────────────────── A4: refresh rotation ─────────────────────────
  async refresh(token: string, device: DeviceInfo): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user: { id: number; role: Role } }> {
    const hash = this.tokens.hashRefresh(token);
    const s = await this.db('auth_sessions').where({ refresh_token_hash: hash }).first('id', 'user_id', 'revoked_at', 'revoke_reason', 'expires_at', 'device_id');
    if (!s) throw new AppError('UNAUTHENTICATED');
    if (s.revoked_at) {
      const ageSec = (Date.now() - new Date(s.revoked_at).getTime()) / 1000;
      if (s.revoke_reason === 'rotated' && ageSec <= REFRESH_RACE_GRACE_SEC) throw new AppError('REFRESH_RACE');
      // ⚠️ REUSE DETECTED — a rotated/revoked token came back: assume theft, kill every session.
      const n = await this.tokens.revokeAll(s.user_id, 'reuse_detected');
      this.identity.invalidate(s.user_id);
      await this.audit.log({ actorId: s.user_id, action: 'auth.refresh_reuse', entityType: 'user', entityId: s.user_id, after: { revokedSessions: n }, ip: device.ip });
      await this.notify.sendToRole('ADMIN', { type: 'security.refresh_reuse', title: 'सुरक्षा चेतावनी', body: `एक खाते (#${s.user_id}) का पुराना लॉगिन टोकन दोबारा इस्तेमाल हुआ — सभी डिवाइस लॉगआउट कर दिए गए।`, channels: ['IN_APP', 'PUSH'] });
      throw new AppError('UNAUTHENTICATED');
    }
    if (new Date(s.expires_at).getTime() < Date.now()) throw new AppError('UNAUTHENTICATED');
    const user = await this.db('users').where({ id: s.user_id }).first('id', 'role', 'status');
    if (!user || user.status !== 'ACTIVE') {
      await this.tokens.revokeSession(s.id, s.user_id, 'user_inactive');
      throw new AppError('ACCOUNT_DISABLED');
    }
    return this.db.transaction(async (trx) => {
      const revoked = await trx('auth_sessions').where({ id: s.id }).whereNull('revoked_at').update({ revoked_at: trx.fn.now(), revoke_reason: 'rotated', last_used_at: trx.fn.now() });
      if (!revoked) throw new AppError('REFRESH_RACE'); // lost a race with a parallel refresh — NOT an invalid login
      const issued = await this.tokens.issue({ id: user.id, role: user.role }, { ...device, deviceId: device.deviceId ?? s.device_id }, trx);
      return { accessToken: issued.accessToken, refreshToken: issued.refreshToken, expiresIn: issued.expiresIn, user: { id: user.id, role: user.role } };
    });
  }

  async logout(userId: number, sessionId: number | undefined, refreshToken?: string): Promise<void> {
    if (sessionId) await this.tokens.revokeSession(sessionId, userId, 'logout');
    if (refreshToken) await this.db('auth_sessions').where({ refresh_token_hash: this.tokens.hashRefresh(refreshToken), user_id: userId }).whereNull('revoked_at').update({ revoked_at: this.db.fn.now(), revoke_reason: 'logout' });
  }

  async logoutAll(userId: number): Promise<number> {
    return this.tokens.revokeAll(userId, 'logout_all');
  }

  async me(userId: number): Promise<MeResponse> {
    const u = await this.db('users').where({ id: userId }).first('id', 'name', 'phone', 'role', 'referral_code', 'phone_verified');
    const auth = await this.identity.loadAuthUser(userId);
    return {
      id: u.id,
      name: u.name,
      phone: localPhone(u.phone),
      role: u.role,
      permissions: auth ? [...auth.permissions] : [],
      referralCode: u.referral_code,
      phoneVerified: Boolean(u.phone_verified),
      isGlobalAdmin: auth?.isGlobalAdmin ?? false,
    };
  }

  async sessions(userId: number): Promise<unknown[]> {
    return this.db('auth_sessions')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .where('expires_at', '>', this.db.fn.now())
      .orderBy('id', 'desc')
      .select('id', 'platform', 'user_agent as userAgent', 'created_at as createdAt', 'last_used_at as lastUsedAt');
  }
}
