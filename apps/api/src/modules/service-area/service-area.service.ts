import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { ServiceabilityResult, VillageOption } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { CACHE, type ICacheProvider } from '../../common/cache/cache.provider';
import { AppError, conflict, notFound } from '../../common/errors';
import { fromPaise, toPaise } from '../../common/utils/money';
import { bboxOf, haversineKm, roundKm, zoneContains, type Ring } from '../../common/utils/geo';
import { slugify } from '../../common/utils/translit';
import { sanitizeHtml } from '../../common/utils/sanitize';
import { parseJson } from '../jobs/queue.service';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { checkServiceability, type CheckInput, type CheckResult, type ServiceSettings, type VillageForCheck, type ZoneForCheck } from '../../domain/serviceability';
import { nearestFirst, pickerOrder, searchVillages, type PickerVillage } from '../../domain/village-search';
import { validateZone, type ZoneDraft } from '../../domain/zone-validate';
import type { AuthUser } from '../../common/types';

const VILLAGES_KEY = 'sa:villages';
const ZONES_KEY = 'sa:zones';
const TTL = 5 * 60_000;

export interface VillageFull extends VillageForCheck, PickerVillage {
  slug: string;
  etaMinutes: number;
}

/** A8 — service-area gate: villages first, GPS/zones second, never a dead end. */
@Injectable()
export class ServiceAreaService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(CACHE) private readonly cache: ICacheProvider,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── loaders (tiny tables, cached) ─────────────
  async villages(): Promise<VillageFull[]> {
    return this.cache.wrap(VILLAGES_KEY, TTL, async () => {
      const [rows, aliases] = await Promise.all([
        this.db('villages').select('id', 'name', 'name_hi', 'slug', 'latitude', 'longitude', 'distance_km', 'delivery_fee', 'min_order', 'eta_minutes', 'is_active', 'is_popular', 'order_count', 'zone_id'),
        this.db('village_aliases').select('village_id', 'alias'),
      ]);
      const byVillage = new Map<number, string[]>();
      for (const a of aliases as { village_id: number; alias: string }[]) byVillage.set(a.village_id, [...(byVillage.get(a.village_id) ?? []), a.alias]);
      return (rows as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id),
        name: String(r.name),
        nameHi: (r.name_hi as string | null) ?? null,
        slug: String(r.slug),
        isActive: Number(r.is_active) === 1,
        isPopular: Number(r.is_popular) === 1,
        orderCount: Number(r.order_count),
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        distanceKm: r.distance_km === null ? null : Number(r.distance_km),
        deliveryFee: toPaise(r.delivery_fee as string),
        minOrder: toPaise(r.min_order as string),
        etaMinutes: Number(r.eta_minutes),
        zoneId: r.zone_id === null ? null : Number(r.zone_id),
        aliases: byVillage.get(Number(r.id)) ?? [],
      }));
    });
  }

  async zones(): Promise<ZoneForCheck[]> {
    return this.cache.wrap(ZONES_KEY, TTL, async () => {
      const rows = (await this.db('service_zones').where({ is_active: 1 }).orderBy('priority')) as Record<string, unknown>[];
      return rows.map((z) => {
        const geo = z.polygon_geojson ? parseJson<{ coordinates?: number[][][] }>(z.polygon_geojson) : null;
        const ring = geo?.coordinates?.[0] ? (geo.coordinates[0].map((p) => [p[0], p[1]]) as Ring) : null;
        const bbox = z.bbox_min_lat !== null && z.bbox_min_lat !== undefined
          ? { minLat: Number(z.bbox_min_lat), maxLat: Number(z.bbox_max_lat), minLng: Number(z.bbox_min_lng), maxLng: Number(z.bbox_max_lng) }
          : ring ? bboxOf(ring) : null;
        return {
          id: Number(z.id),
          mode: z.mode as 'RADIUS' | 'POLYGON',
          centerLat: Number(z.center_lat),
          centerLng: Number(z.center_lng),
          radiusKm: z.radius_km === null ? null : Number(z.radius_km),
          ring,
          bbox: z.mode === 'POLYGON' ? bbox : null,
          priority: Number(z.priority),
          deliveryFee: toPaise(z.delivery_fee as string),
          minOrder: toPaise(z.min_order as string),
          etaMinutes: Number(z.eta_minutes),
        };
      });
    });
  }

  async serviceSettings(): Promise<ServiceSettings> {
    return {
      gpsAccuracyThresholdM: await this.settings.int('gps_accuracy_threshold_m', 500),
      defaultDeliveryFee: await this.settings.money('delivery_fee', 2000),
      defaultMinOrder: await this.settings.money('min_order', 9900),
      defaultEtaMinutes: await this.settings.int('default_eta_minutes', 45),
      prepMinutes: await this.settings.int('prep_minutes', 20),
      minutesPerKm: await this.settings.int('minutes_per_km', 4),
      etaBufferMinutes: await this.settings.int('eta_buffer_minutes', 10),
      store: { lat: await this.settings.num('center_lat', 25.742), lng: await this.settings.num('center_lng', 81.954) },
    };
  }

  invalidate(): void {
    this.cache.del(VILLAGES_KEY);
    this.cache.del(ZONES_KEY);
    this.cache.delPrefix('sa:public');
  }

  // ───────────── public ─────────────
  async check(input: CheckInput): Promise<CheckResult> {
    let villages = await this.villages();
    // A village added a moment ago (another process, a CLI seed, a direct DB fix) must not be
    // refused for up to an hour because this process cached the old list: if the chosen id is
    // unknown here but really exists, reload once. Unknown-and-absent ids cost one PK lookup.
    if (input.villageId && !villages.some((v) => v.id === input.villageId) && (await this.db('villages').where({ id: input.villageId }).first('id'))) {
      this.cache.del(VILLAGES_KEY);
      villages = await this.villages();
    }
    return checkServiceability(input, pickerOrder(villages), await this.zones(), await this.serviceSettings());
  }

  toApi(r: CheckResult): ServiceabilityResult {
    return {
      serviceable: r.serviceable,
      method: r.method,
      zoneId: r.zone?.id ?? null,
      reason: r.reason,
      needsVillagePick: r.needsVillagePick,
      flagNewArea: r.flagNewArea,
      distanceKm: r.distanceKm,
      etaMinutes: r.etaMinutes,
      deliveryFee: fromPaise(r.deliveryFee),
      minOrder: fromPaise(r.minOrder),
      servedAreas: r.servedAreas,
      nearestServedKm: r.nearestServedKm,
    };
  }

  /** Throws the A8.4 checkout 422 payload when not serviceable. */
  outOfAreaError(r: CheckResult, areaName: string): AppError {
    return new AppError('OUT_OF_SERVICE_AREA', { area: areaName || 'इस क्षेत्र', areaEn: areaName || 'this area' }, {
      data: { servedAreas: r.servedAreas, distanceKm: r.distanceKm, nearestServedKm: r.nearestServedKm, canRequest: true, needsVillagePick: r.needsVillagePick },
    });
  }

  /** Picker list (A8.9): active only, ordered, optional search / GPS pinning (never auto-select). */
  async pickerList(q?: string, lat?: number, lng?: number): Promise<{ villages: VillageOption[]; pinnedIds: number[]; selectedId: null; showSearch: boolean; autoSelectId: number | null }> {
    const all = await this.villages();
    const active = pickerOrder(all);
    let list = q ? searchVillages(all, q) : active;
    let pinnedIds: number[] = [];
    if (!q && typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      const r = nearestFirst(all, { lat, lng });
      list = r.list;
      pinnedIds = r.pinnedIds;
    }
    const s = await this.serviceSettings();
    const zones = await this.zones();
    const out = list.map((v) => this.villageOption(v, s, zones));
    // Rule 6: a single village → no picker, just set it. Rule 1 of the UI: 8+ villages → search box.
    return { villages: out, pinnedIds, selectedId: null, showSearch: active.length >= 8, autoSelectId: active.length === 1 ? active[0].id : null };
  }

  private villageOption(v: VillageFull, s: ServiceSettings, zones: ZoneForCheck[]): VillageOption {
    const zone = (v.zoneId !== null ? zones.find((z) => z.id === v.zoneId) : undefined) ?? zones.find((z) => zoneContains(z, { lat: v.lat as number, lng: v.lng as number })) ?? null;
    const fee = v.deliveryFee > 0 ? v.deliveryFee : zone ? zone.deliveryFee : s.defaultDeliveryFee;
    const eta = v.distanceKm !== null ? s.prepMinutes + Math.ceil(v.distanceKm * s.minutesPerKm) + s.etaBufferMinutes : v.etaMinutes || s.defaultEtaMinutes;
    return { id: v.id, name: v.name, nameHi: v.nameHi, slug: v.slug, distanceKm: v.distanceKm, etaMinutes: eta, deliveryFee: fromPaise(fee), isPopular: v.isPopular, aliases: v.aliases, lat: v.lat, lng: v.lng };
  }

  async summary(): Promise<unknown> {
    return this.cache.wrap('sa:public:summary', 10 * 60_000, async () => {
      const zones = await this.zones();
      const primary = zones[0];
      const villages = pickerOrder(await this.villages());
      return {
        radiusKm: primary?.radiusKm ?? (await this.settings.num('service_radius_km', 6)),
        mode: primary?.mode ?? 'RADIUS',
        center: primary ? { lat: primary.centerLat, lng: primary.centerLng } : null,
        servedCount: villages.length,
        servedAreas: villages.slice(0, 8).map((v) => v.nameHi ?? v.name),
        supportPhone: await this.settings.str('support_phone', ''),
        whatsapp: await this.settings.str('whatsapp_number', ''),
      };
    });
  }

  /** Lead capture from the sorry screen (A8.5). IP rate-limited by the controller. */
  async createRequest(input: { phone: string; areaText?: string; villageGuess?: string; lat?: number; lng?: number; source: 'CHECKOUT' | 'ADDRESS' | 'HOMEPAGE' | 'APP' }, userId: number | null): Promise<{ id: number }> {
    const s = await this.serviceSettings();
    const distanceKm = typeof input.lat === 'number' && typeof input.lng === 'number' ? roundKm(haversineKm(s.store, { lat: input.lat, lng: input.lng })) : null;
    const [id] = await this.db('service_area_requests').insert({
      user_id: userId,
      phone: `91${input.phone}`,
      area_text: input.areaText?.slice(0, 200) ?? null,
      village_guess: (input.villageGuess ?? input.areaText ?? '').trim().slice(0, 120) || null,
      latitude: input.lat ?? null,
      longitude: input.lng ?? null,
      distance_km: distanceKm,
      source: input.source,
    });
    return { id };
  }

  // ───────────── admin: zones (A8.6) ─────────────
  async listZones(): Promise<unknown[]> {
    const rows = (await this.db('service_zones').orderBy('priority')) as Record<string, unknown>[];
    return rows.map((z) => ({ ...z, polygon_geojson: z.polygon_geojson ? parseJson(z.polygon_geojson) : null }));
  }

  /** Which ACTIVE villages would fall outside ALL active zones if `draft` replaced zone `id`. */
  async impact(zoneId: number | null, draft: ZoneDraft & { ring: Ring | null }): Promise<{ inside: { id: number; name: string; distanceKm: number | null }[]; goingOut: { id: number; name: string }[]; customersAffected: number }> {
    const villages = await this.villages();
    const others = (await this.zones()).filter((z) => z.id !== zoneId);
    const shape = { mode: draft.mode, centerLat: draft.centerLat, centerLng: draft.centerLng, radiusKm: draft.radiusKm ?? null, ring: draft.ring, bbox: draft.ring ? bboxOf(draft.ring) : null };
    const inside: { id: number; name: string; distanceKm: number | null }[] = [];
    const goingOut: { id: number; name: string }[] = [];
    const current = await this.zones();
    for (const v of villages) {
      const pt = { lat: v.lat as number, lng: v.lng as number };
      const inNew = zoneContains(shape, pt) || others.some((z) => zoneContains(z, pt));
      if (inNew) inside.push({ id: v.id, name: v.nameHi ?? v.name, distanceKm: v.distanceKm });
      const inOld = current.some((z) => zoneContains(z, pt));
      if (v.isActive && inOld && !inNew) goingOut.push({ id: v.id, name: v.nameHi ?? v.name });
    }
    let customersAffected = 0;
    if (goingOut.length) {
      const [{ n }] = (await this.db('addresses').whereIn('village_id', goingOut.map((g) => g.id)).whereNull('deleted_at').countDistinct({ n: 'user_id' })) as { n: number }[];
      customersAffected = Number(n);
    }
    return { inside, goingOut, customersAffected };
  }

  async saveZone(id: number, body: ZoneDraft & { deliveryFee: string; minOrder: string; etaMinutes: number; priority: number; confirm?: boolean; name?: string }, actor: AuthUser, ip: string): Promise<unknown> {
    const before = await this.db('service_zones').where({ id }).first();
    if (!before) throw notFound();
    const s = await this.serviceSettings();
    const v = validateZone(body, s.store);
    if (!v.ok) throw new AppError('BUSINESS_RULE', { reason: v.messageHi }, { data: { code: v.code } });
    const impact = await this.impact(id, { ...body, ring: v.ring });
    if (impact.goingOut.length && !body.confirm) {
      // A8.6(e): never silently switch villages off — ask the admin to confirm first.
      throw new AppError('CONFIRM_REQUIRED', {
        reason: `इस बदलाव से ${impact.goingOut.length} गाँव बाहर हो जाएंगे: ${impact.goingOut.map((g) => g.name).join(', ')}। वहाँ के ${impact.customersAffected} ग्राहक प्रभावित होंगे। पक्का?`,
      }, { data: impact });
    }
    const patch = {
      name: body.name ?? before.name,
      mode: body.mode,
      center_lat: body.centerLat,
      center_lng: body.centerLng,
      radius_km: body.mode === 'RADIUS' ? body.radiusKm : null,
      polygon_geojson: body.mode === 'POLYGON' && v.ring ? JSON.stringify({ type: 'Polygon', coordinates: [v.ring] }) : null,
      bbox_min_lat: v.bbox.minLat,
      bbox_max_lat: v.bbox.maxLat,
      bbox_min_lng: v.bbox.minLng,
      bbox_max_lng: v.bbox.maxLng,
      delivery_fee: body.deliveryFee,
      min_order: body.minOrder,
      eta_minutes: body.etaMinutes,
      priority: body.priority,
      updated_by: actor.id,
    };
    await this.db.transaction(async (trx) => {
      await trx('service_zones').where({ id }).update(patch);
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'service_area.zone_save', entityType: 'service_zone', entityId: id, before, after: patch, ip }, trx);
    });
    this.invalidate();
    // Village is_active is NEVER auto-changed (A8.10) — return suggestions for the admin to act on.
    return { saved: true, areaKm2: Math.round(v.areaKm2 * 10) / 10, suggestions: { deactivate: impact.goingOut, insideCount: impact.inside.length } };
  }

  // ───────────── admin: villages (A8.10) ─────────────
  async adminVillages(): Promise<unknown[]> {
    const rows = await this.db.raw(
      `SELECT v.id, v.name, v.name_hi AS nameHi, v.slug, v.latitude AS lat, v.longitude AS lng, v.distance_km AS distanceKm,
              v.delivery_fee AS deliveryFee, v.min_order AS minOrder, v.eta_minutes AS etaMinutes, v.is_active AS isActive,
              v.is_popular AS isPopular, v.order_count AS orderCount30d, v.intro_html AS introHtml,
              (SELECT GROUP_CONCAT(a.alias SEPARATOR '|') FROM village_aliases a WHERE a.village_id = v.id) AS aliases
         FROM villages v ORDER BY v.is_active DESC, v.is_popular DESC, v.order_count DESC, v.distance_km ASC`,
    );
    return (rows as [Record<string, unknown>[]])[0].map((r) => ({ ...r, aliases: r.aliases ? String(r.aliases).split('|') : [] }));
  }

  async createVillage(b: { name: string; nameHi?: string; lat: number; lng: number; deliveryFee?: string; minOrder?: string; etaMinutes?: number; isActive?: boolean; introHtml?: string }, actor: AuthUser, ip: string): Promise<{ id: number; zoneId: number | null; distanceKm: number }> {
    const s = await this.serviceSettings();
    const distanceKm = roundKm(haversineKm(s.store, { lat: b.lat, lng: b.lng }));
    const zone = (await this.zones()).find((z) => zoneContains(z, { lat: b.lat, lng: b.lng })) ?? null;
    let slug = slugify(b.name);
    if (await this.db('villages').where({ slug }).first('id')) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const [id] = await this.db('villages').insert({
      name: b.name, name_hi: b.nameHi ?? null, slug, latitude: b.lat, longitude: b.lng, distance_km: distanceKm,
      delivery_fee: b.deliveryFee ?? '0.00', min_order: b.minOrder ?? '0.00', eta_minutes: b.etaMinutes ?? 0,
      is_active: b.isActive === false ? 0 : 1, zone_id: zone?.id ?? null, intro_html: b.introHtml ? sanitizeHtml(b.introHtml) : null,
    });
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'village.create', entityType: 'village', entityId: id, after: { ...b, distanceKm, zoneId: zone?.id ?? null }, ip });
    this.invalidate();
    return { id, zoneId: zone?.id ?? null, distanceKm };
  }

  async updateVillage(id: number, b: Partial<{ name: string; nameHi: string; lat: number; lng: number; distanceKm: number; deliveryFee: string; minOrder: string; etaMinutes: number; isActive: boolean; isPopular: boolean; introHtml: string; seoTitle: string; seoDescription: string }> & { confirm?: boolean }, actor: AuthUser, ip: string): Promise<{ ok: true }> {
    const before = await this.db('villages').where({ id }).first();
    if (!before) throw notFound();
    if (b.isActive === false && Number(before.is_active) === 1 && !b.confirm) {
      const [{ n }] = (await this.db('orders as o').join('addresses as a', 'a.id', 'o.address_id').where('a.village_id', id).where('o.placed_at', '>', this.db.raw('NOW() - INTERVAL 30 DAY')).count({ n: '*' })) as { n: number }[];
      if (Number(n) > 0) {
        throw new AppError('CONFIRM_REQUIRED', { reason: `${before.name_hi ?? before.name} में पिछले 30 दिन में ${n} ऑर्डर आए हैं। बंद करने पर वहाँ के ग्राहक ऑर्डर नहीं कर पाएंगे। बंद करें?` }, { data: { orders30d: Number(n) } });
      }
    }
    const s = await this.serviceSettings();
    const lat = b.lat ?? Number(before.latitude);
    const lng = b.lng ?? Number(before.longitude);
    const patch: Record<string, unknown> = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.nameHi !== undefined) patch.name_hi = b.nameHi;
    if (b.lat !== undefined || b.lng !== undefined) {
      patch.latitude = lat;
      patch.longitude = lng;
      patch.distance_km = roundKm(haversineKm(s.store, { lat, lng }));
      patch.zone_id = (await this.zones()).find((z) => zoneContains(z, { lat, lng }))?.id ?? null;
    }
    if (b.distanceKm !== undefined) patch.distance_km = b.distanceKm; // manual override
    if (b.deliveryFee !== undefined) patch.delivery_fee = b.deliveryFee;
    if (b.minOrder !== undefined) patch.min_order = b.minOrder;
    if (b.etaMinutes !== undefined) patch.eta_minutes = b.etaMinutes;
    if (b.isActive !== undefined) patch.is_active = b.isActive ? 1 : 0;
    if (b.isPopular !== undefined) patch.is_popular = b.isPopular ? 1 : 0;
    if (b.introHtml !== undefined) patch.intro_html = sanitizeHtml(b.introHtml);
    if (b.seoTitle !== undefined) patch.seo_title = b.seoTitle;
    if (b.seoDescription !== undefined) patch.seo_description = b.seoDescription;
    if (!Object.keys(patch).length) return { ok: true };
    await this.db('villages').where({ id }).update(patch);
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: b.isActive !== undefined ? 'village.toggle' : 'village.update', entityType: 'village', entityId: id, before, after: patch, ip });
    this.invalidate();
    return { ok: true };
  }

  /**
   * Remove a village. Never used by any address/order → deleted for real. Otherwise it is only
   * switched off (addresses and order history keep pointing at it) — the confirm flow for a village
   * with recent orders is the same as the on/off toggle (A8.10).
   */
  async removeVillage(id: number, confirm: boolean, actor: AuthUser, ip: string): Promise<{ deleted: boolean; deactivated: boolean }> {
    const v = await this.db('villages').where({ id }).first('id', 'name', 'name_hi', 'is_active');
    if (!v) throw notFound();
    const [{ n }] = (await this.db('addresses').where({ village_id: id }).count({ n: '*' })) as { n: number }[];
    if (Number(n) > 0) {
      if (Number(v.is_active) === 1) await this.updateVillage(id, { isActive: false, confirm }, actor, ip);
      return { deleted: false, deactivated: true };
    }
    await this.db.transaction(async (trx) => {
      await trx('village_aliases').where({ village_id: id }).delete();
      await trx('villages').where({ id }).delete();
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'village.delete', entityType: 'village', entityId: id, before: v, ip }, trx);
    });
    this.invalidate();
    return { deleted: true, deactivated: false };
  }

  async addAlias(villageId: number, alias: string, type: 'SPELLING' | 'HAMLET' | 'LANDMARK' | 'OLD_NAME'): Promise<{ id: number }> {
    if (!(await this.db('villages').where({ id: villageId }).first('id'))) throw notFound();
    try {
      const [id] = await this.db('village_aliases').insert({ village_id: villageId, alias: alias.trim(), alias_type: type });
      this.invalidate();
      return { id };
    } catch (e) {
      if (String(e).includes('Duplicate')) throw conflict('यह उपनाम पहले से किसी गाँव के साथ जुड़ा है');
      throw e;
    }
  }
  async removeAlias(aliasId: number): Promise<void> {
    await this.db('village_aliases').where({ id: aliasId }).delete();
    this.invalidate();
  }

  // ───────────── admin: expansion list (A8.11) ─────────────
  async requestGroups(): Promise<unknown[]> {
    const rows = await this.db.raw(
      `SELECT COALESCE(NULLIF(TRIM(r.village_guess), ''), 'अज्ञात') AS villageGuess, COUNT(*) AS requests,
              COUNT(DISTINCT r.phone) AS phones, MIN(r.distance_km) AS minKm, MAX(r.created_at) AS lastAt,
              AVG(r.latitude) AS lat, AVG(r.longitude) AS lng,
              SUM(r.status = 'NEW') AS newCount
         FROM service_area_requests r
        WHERE r.status <> 'NOW_SERVED'
        GROUP BY villageGuess ORDER BY requests DESC LIMIT 100`,
    );
    return (rows as [unknown[]])[0];
  }

  async requestList(page: number, perPage: number): Promise<{ items: unknown[]; total: number }> {
    const [items, [{ total }]] = await Promise.all([
      this.db('service_area_requests').orderBy('id', 'desc').limit(perPage).offset((page - 1) * perPage),
      this.db('service_area_requests').count({ total: '*' }),
    ]);
    return { items, total: Number(total) };
  }

  /** A8.10 "इस गाँव को चालू करें" — one click from a request group: create/activate + mark requests served. */
  async activateFromRequests(villageGuess: string, coords: { lat: number; lng: number } | null, nameHi: string | undefined, actor: AuthUser, ip: string): Promise<{ villageId: number; created: boolean; requestsServed: number }> {
    const all = await this.villages();
    const existing = searchVillages(all.map((v) => ({ ...v, isActive: true })), villageGuess)[0];
    let villageId: number;
    let created = false;
    if (existing) {
      villageId = existing.id;
      await this.updateVillage(villageId, { isActive: true }, actor, ip);
    } else {
      if (!coords) throw new AppError('BUSINESS_RULE', { reason: 'नए गाँव के लिए Google Maps से अक्षांश/देशांतर डालें' });
      villageId = (await this.createVillage({ name: villageGuess, nameHi, lat: coords.lat, lng: coords.lng, isActive: true }, actor, ip)).id;
      created = true;
    }
    const requestsServed = await this.db('service_area_requests').where('village_guess', villageGuess).whereNot('status', 'NOW_SERVED').update({ status: 'NOW_SERVED', admin_note: `village #${villageId} चालू` });
    this.invalidate();
    return { villageId, created, requestsServed };
  }

  /** Nightly villages:rollup (A8.11) — delivered/completed orders, last 30 days. */
  async rollupOrderCounts(): Promise<number> {
    const r = await this.db.raw(
      `UPDATE villages v SET order_count = (
         SELECT COUNT(*) FROM orders o JOIN addresses a ON a.id = o.address_id
          WHERE a.village_id = v.id AND o.placed_at > NOW() - INTERVAL 30 DAY
            AND o.status IN ('DELIVERED','COMPLETED'))`,
    );
    this.invalidate();
    return (r as [{ affectedRows: number }])[0].affectedRows;
  }

  /** Dashboard lists (A8.11). */
  async villageReport(): Promise<{ top: unknown[]; zeroActive: unknown[]; mostRequestedInactive: unknown[] }> {
    const [top, zeroActive, req] = await Promise.all([
      this.db('villages').where({ is_active: 1 }).where('order_count', '>', 0).orderBy('order_count', 'desc').limit(10).select('id', 'name', 'name_hi as nameHi', 'order_count as orders30d'),
      this.db('villages').where({ is_active: 1, order_count: 0 }).orderBy('distance_km').select('id', 'name', 'name_hi as nameHi', 'distance_km as distanceKm'),
      this.requestGroups(),
    ]);
    return { top, zeroActive, mostRequestedInactive: (req as unknown[]).slice(0, 10) };
  }
}
