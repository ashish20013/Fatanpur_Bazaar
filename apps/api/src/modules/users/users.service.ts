import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { notFound } from '../../common/errors';
import { localPhone } from '../../common/utils/phone';
import { mapsUrl } from '../../common/utils/geo';
import { AppError } from '../../common/errors';
import type { AddressView } from '@fb/shared-types';
import { EXTRA_COLUMNS, extrasRow, extrasView, type ExtrasInput } from './address-extras';
import { SettingsService } from '../settings/settings.service';
import { ServiceAreaService } from '../service-area/service-area.service';

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
}
