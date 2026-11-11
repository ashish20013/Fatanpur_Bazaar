import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { notFound } from '../../common/errors';
import { localPhone } from '../../common/utils/phone';
import { mapsUrl } from '../../common/utils/geo';
import { Log } from '../../common/logger';
import { AppError } from '../../common/errors';
import { TERMINAL_STATUSES, type AddressView } from '@fb/shared-types';
import { EXTRA_COLUMNS, extrasRow, extrasView, type ExtrasInput } from './address-extras';
import { SettingsService } from '../settings/settings.service';
import { ServiceAreaService } from '../service-area/service-area.service';
import { IdentityService } from '../identity/identity.service';

export interface AddressInput extends ExtrasInput {
  label?: string;
  receiverName: string;
  phone: string;
  line1: string;
  landmark?: string | null;
  villageId?: number | null;
  areaText?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  isDefault?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly sa: ServiceAreaService,
    private readonly settings: SettingsService,
    private readonly identity: IdentityService,
  ) {}

  async profile(userId: number): Promise<unknown> {
    const u = await this.db('users').where({ id: userId }).first('id', 'name', 'phone', 'email', 'role', 'language', 'referral_code as referralCode', 'phone_verified as phoneVerified', 'created_at as createdAt');
    return { ...u, phone: localPhone(u.phone) };
  }

  /** PATCH /users/me — name/email/language only. `role` is not in the schema, so it can't arrive here. */
  async updateProfile(userId: number, b: { name?: string; email?: string | null; language?: 'hi' | 'en' }): Promise<unknown> {
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.email !== undefined) patch.email = b.email;
    if (b.language !== undefined) patch.language = b.language;
    if (Object.keys(patch).length) await this.db('users').where({ id: userId }).update(patch);
    return this.profile(userId);
  }

  async addresses(userId: number, onlyId?: number): Promise<AddressView[]> {
    const q = this.db('addresses as a')
      .leftJoin('villages as v', 'v.id', 'a.village_id')
      .leftJoin('address_area_flags as f', 'f.address_id', 'a.id')
      .leftJoin('address_extras as x', 'x.address_id', 'a.id')
      .where('a.user_id', userId)
      .whereNull('a.deleted_at')
      .orderBy('a.is_default', 'desc')
      .orderBy('a.id', 'desc')
      .select('a.id', 'a.label', 'a.receiver_name as receiverName', 'a.phone', 'a.line1', 'a.landmark', 'a.village_id as villageId', 'v.name as villageName', 'v.name_hi as villageNameHi', 'v.is_active as villageActive', 'a.latitude as lat', 'a.longitude as lng', 'a.distance_km as distanceKm', 'a.is_serviceable as isServiceable', 'a.is_default as isDefault', 'f.area_text as areaText')
      .select(EXTRA_COLUMNS.map((c) => `x.${c}`));
    if (onlyId) q.where('a.id', onlyId);
    const rows = (await q) as Record<string, unknown>[];
    return rows.map((r) => {
      const lat = r.lat === null ? null : Number(r.lat);
      const lng = r.lng === null ? null : Number(r.lng);
      return {
        id: Number(r.id),
        label: String(r.label),
        receiverName: String(r.receiverName),
        phone: localPhone(String(r.phone)),
        line1: String(r.line1),
        landmark: (r.landmark as string | null) ?? null,
        villageId: r.villageId === null ? null : Number(r.villageId),
        villageName: (r.villageName as string | null) ?? null,
        villageNameHi: (r.villageNameHi as string | null) ?? null,
        areaText: (r.areaText as string | null) ?? null,
        lat,
        lng,
        distanceKm: r.distanceKm === null ? null : Number(r.distanceKm),
        // Live re-evaluation: a village switched off after saving must also disable the address at checkout.
        isServiceable: Number(r.isServiceable) === 1 && (r.villageId === null || Number(r.villageActive) === 1),
        isDefault: Number(r.isDefault) === 1,
        mapsUrl: mapsUrl(lat, lng),
        ...extrasView(r),
      };
    });
  }

  /**
   * A8.4(2) — WARN but save. An out-of-area address is saved (the user never re-types the form);
   * it is flagged and disabled at checkout instead.
   */
  async saveAddress(userId: number, id: number | null, b: AddressInput): Promise<AddressView & { serviceability: unknown }> {
    const threshold = await this.settings.int('gps_accuracy_threshold_m', 500);
    // A map pin is placed by the customer on purpose → treated as exact (accuracy 0).
    if (b.locationMethod === 'MAP_PIN' && typeof b.lat === 'number' && typeof b.lng === 'number') b.accuracyM = 0;
    const gpsOk = typeof b.lat === 'number' && typeof b.lng === 'number' && typeof b.accuracyM === 'number' && b.accuracyM <= threshold;
    // Owner rule: every address must tell the rider WHERE — a usable pin, or the route written out.
    if (await this.settings.bool('require_location', true)) {
      const described = (b.directions ?? '').trim().length >= 10;
      if (!gpsOk && !described) throw new AppError('VALIDATION_FAILED', {}, { field: 'directions', hi: 'लोकेशन ज़रूरी है — "मेरी लोकेशन लें" दबाएं, नक्शे पर पिन लगाएं, या आने का रास्ता लिखें' });
    }
    const check = await this.sa.check({ villageId: b.villageId ?? undefined, lat: b.lat ?? undefined, lng: b.lng ?? undefined, accuracyM: b.accuracyM ?? undefined });
    const row = {
      label: (b.label ?? 'Ghar').slice(0, 40),
      receiver_name: b.receiverName,
      phone: `91${b.phone}`,
      line1: b.line1,
      landmark: b.landmark ?? null,
      village_id: check.village?.id ?? null,
      // Bad GPS is ignored entirely (A8 rule 2) — never stored as if it were a real pin.
      latitude: gpsOk ? b.lat : null,
      longitude: gpsOk ? b.lng : null,
      gps_accuracy_m: typeof b.accuracyM === 'number' ? Math.min(65535, Math.round(b.accuracyM)) : null,
      distance_km: check.distanceKm,
      is_serviceable: check.serviceable ? 1 : 0,
      zone_id: check.zone?.id ?? null,
      check_method: check.method,
    };
    const addressId = await this.db.transaction(async (trx) => {
      let aid = id;
      if (id) {
        const n = await trx('addresses').where({ id, user_id: userId }).whereNull('deleted_at').update(row);
        if (!n) throw notFound();
      } else {
        const [{ n }] = (await trx('addresses').where({ user_id: userId }).whereNull('deleted_at').count({ n: '*' })) as { n: number }[];
        [aid] = await trx('addresses').insert({ ...row, user_id: userId, is_default: Number(n) === 0 || b.isDefault ? 1 : 0 });
      }
      if (b.isDefault) {
        await trx('addresses').where({ user_id: userId }).whereNot({ id: aid as number }).update({ is_default: 0 });
        await trx('addresses').where({ id: aid as number }).update({ is_default: 1 });
      }
      if (b.areaText || check.flagNewArea) {
        await trx.raw(
          'INSERT INTO address_area_flags (address_id, area_text, flag_new_area) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE area_text = VALUES(area_text), flag_new_area = VALUES(flag_new_area), reviewed_at = NULL',
          [aid, b.areaText?.slice(0, 200) ?? null, check.flagNewArea ? 1 : 0],
        );
      }
      // The whole service area is one district; whatever the client sends is ignored.
      const district = await this.settings.str('default_district', 'प्रतापगढ़');
      const extras = extrasRow({ ...b, district, locationMethod: b.locationMethod ?? (gpsOk ? 'GPS' : 'DESCRIBED') });
      await trx.raw(
        `INSERT INTO address_extras (address_id, ${EXTRA_COLUMNS.join(', ')}) VALUES (${EXTRA_COLUMNS.map(() => '?').concat('?').join(', ')})
         ON DUPLICATE KEY UPDATE ${EXTRA_COLUMNS.map((c) => `${c} = VALUES(${c})`).join(', ')}`,
        [aid, ...EXTRA_COLUMNS.map((c) => extras[c])],
      );
      return aid as number;
    });
    const [view] = await this.addresses(userId, addressId);
    return { ...(view as AddressView), serviceability: this.sa.toApi(check) };
  }

  async deleteAddress(userId: number, id: number): Promise<void> {
    // Soft delete: orders.address_id is a hard FK and history must survive.
    const n = await this.db('addresses').where({ id, user_id: userId }).whereNull('deleted_at').update({ deleted_at: this.db.fn.now(), is_default: 0 });
    if (!n) throw notFound();
  }

  /**
   * What the customer will lose, shown BEFORE they confirm deletion.
   *
   * ⚠️ A delete button that just works is the wrong design here. Many of these customers are
   * ordering online for the first time; "खाता बंद करें" can be pressed by mistake, and wallet
   * money or a van already on its way are not things to discover afterwards. So the app asks for
   * this first and shows it on the confirmation screen, and the delete itself refuses in exactly
   * the two cases below rather than silently destroying something that matters.
   */
  async deletionPreview(userId: number): Promise<{
    canDelete: boolean;
    blockedReason: string | null;
    activeOrders: number;
    walletBalance: string;
    orders: number;
    addresses: number;
  }> {
    const active = (await this.db('orders')
      .where({ customer_id: userId })
      .whereNotIn('status', [...TERMINAL_STATUSES])
      .count({ n: '*' })
      .first()) as { n: number } | undefined;
    const total = (await this.db('orders').where({ customer_id: userId }).count({ n: '*' }).first()) as { n: number } | undefined;
    const addr = (await this.db('addresses').where({ user_id: userId }).whereNull('deleted_at').count({ n: '*' }).first()) as { n: number } | undefined;
    const wallet = (await this.db('wallets').where({ user_id: userId }).first('balance')) as { balance: string } | undefined;

    const activeOrders = Number(active?.n ?? 0);
    const balance = Number(wallet?.balance ?? 0);
    let blockedReason: string | null = null;
    if (activeOrders > 0) blockedReason = `आपका ${activeOrders} ऑर्डर अभी चल रहा है। वह पूरा या रद्द होने के बाद खाता बंद कर सकते हैं।`;
    else if (balance > 0) blockedReason = `आपके वॉलेट में ₹${balance.toFixed(2)} बचे हैं। पहले उन्हें किसी ऑर्डर में इस्तेमाल कर लें — खाता बंद होने पर वह पैसा वापस नहीं मिलेगा।`;

    return {
      canDelete: blockedReason === null,
      blockedReason,
      activeOrders,
      walletBalance: balance.toFixed(2),
      orders: Number(total?.n ?? 0),
      addresses: Number(addr?.n ?? 0),
    };
  }

  /**
   * Account deletion — Google Play's User Data policy requires this for any app that lets people
   * create an account, and it is the right thing to offer regardless.
   *
   * ⚠️ The row is NOT deleted, and that is deliberate. `orders.customer_id` is a hard foreign key
   * and those orders are tax records the shop has to keep (the privacy policy says so). What is
   * destroyed is everything that identifies the person: the phone number is overwritten, the name,
   * email and photo are cleared, saved addresses and prescription files go, and every session and
   * push token is revoked so no device can act as them again.
   *
   * ⚠️ The phone number is REPLACED, not nulled — the column is NOT NULL and unique, and leaving
   * the real number behind would defeat the entire point of a deletion request. The replacement is
   * derived from the id, so it stays unique and the number itself is gone for good; the same person
   * signing up again later gets a brand-new account.
   */
  async deleteOwnAccount(userId: number, reason: string | null): Promise<{ deleted: true }> {
    const pre = await this.deletionPreview(userId);
    if (!pre.canDelete) throw new AppError('BUSINESS_RULE', { reason: pre.blockedReason ?? 'खाता अभी बंद नहीं हो सकता' });

    const user = (await this.db('users').where({ id: userId }).first('id', 'role')) as { id: number; role: string } | undefined;
    if (!user) throw notFound();
    // Staff accounts are managed by the owner (last-admin lock, active-delivery checks, audit).
    // Letting a rider delete himself from his phone would walk around all of it.
    if (user.role !== 'CUSTOMER') {
      throw new AppError('BUSINESS_RULE', { reason: 'स्टाफ़ खाता यहाँ से बंद नहीं होता — एडमिन से कहें', reasonEn: 'Staff accounts are closed by the admin' });
    }

    await this.db.transaction(async (trx) => {
      await trx('users').where({ id: userId }).update({
        phone: `DEL${userId}`,
        name: null,
        email: null,
        avatar_url: null,
        phone_verified: 0,
        status: 'DELETED',
        disabled_at: trx.fn.now(),
        disable_reason: (reason ?? 'customer requested deletion').slice(0, 255),
      });
      // Every device loses access immediately — tokens outlive the request otherwise.
      await trx('auth_sessions').where({ user_id: userId }).whereNull('revoked_at').update({ revoked_at: trx.fn.now(), revoke_reason: 'account_deleted' });
      await trx('device_tokens').where({ user_id: userId }).delete();
      await trx('addresses').where({ user_id: userId }).whereNull('deleted_at').update({ deleted_at: trx.fn.now(), is_default: 0 });
      // Health data goes first and completely; the row stays only so the retention cron can see
      // the file was already dealt with.
      await trx('prescriptions').where({ user_id: userId }).update({ purged_at: trx.fn.now(), file_path: '' });
    });

    /*
     * ⚠️ The guard's 30-second user cache has to be dropped HERE, by hand.
     *
     * JwtAuthGuard re-reads the user from the database on every request, but keeps the answer for
     * 30 seconds. Without this line a customer who just deleted their account could keep using
     * the app for up to half a minute — the access token is still signed and valid, and the cache
     * still says ACTIVE. Thirty seconds is the right trade-off for an admin disabling someone;
     * it is the wrong answer for "I pressed delete and it is still logged in".
     */
    this.identity.invalidate(userId);
    Log.warn('user.self_deleted', { userId });
    return { deleted: true };
  }
}
