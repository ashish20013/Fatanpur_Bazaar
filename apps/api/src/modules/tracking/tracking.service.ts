import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ORDER_STATUS_LABEL_HI, type OrderStatus, type TrackingSnapshot } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { CACHE, type ICacheProvider } from '../../common/cache/cache.provider';
import { localPhone } from '../../common/utils/phone';
import { SettingsService } from '../settings/settings.service';
import { DEFAULT_TRACK_CONFIG, evaluatePing, isStale, newTrackState, type TrackConfig, type TrackState } from '../../domain/tracking-filter';

export interface LivePosition {
  lat: number;
  lng: number;
  at: number; // server ms
  accuracy: number | null;
  weak: boolean;
}
export interface ActiveAssignment {
  id: number;
  orderId: number;
  orderNumber: string;
  riderId: number;
  status: string;
}
export type EndReason = 'DELIVERED' | 'CANCELLED' | 'FAILED' | 'TIMEOUT' | 'MANUAL';

/**
 * A19 — location pipeline state. The in-memory Map is the "live" source; MySQL only gets sparse
 * breadcrumbs (>100 m / 60 s / first / status change) and a 30 s session heartbeat (−70 % writes).
 * Tracking and delivery share delivery_assignments by design (they are one domain).
 */
@Injectable()
export class TrackingService {
  private readonly live = new Map<number, LivePosition>(); // assignmentId → last position
  private readonly states = new Map<number, TrackState>();
  private readonly counters = new Map<number, { pings: number; persisted: number }>();

  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(CACHE) private readonly cache: ICacheProvider,
    private readonly settings: SettingsService,
  ) {}

  async config(): Promise<TrackConfig> {
    return { ...DEFAULT_TRACK_CONFIG, persistMeters: await this.settings.int('tracking_persist_meters', 100) };
  }

  /** OWNERSHIP (30 s cache): is this assignment the rider's AND active? */
  async activeAssignment(riderId: number, assignmentId: number): Promise<ActiveAssignment | null> {
    return this.cache.wrap(`trk:asg:${assignmentId}:${riderId}`, 30_000, async () => {
      const a = await this.db('delivery_assignments as da').join('orders as o', 'o.id', 'da.order_id')
        .where({ 'da.id': assignmentId, 'da.rider_id': riderId }).whereIn('da.status', ['ACCEPTED', 'PICKED_UP'])
        .first('da.id', 'da.order_id as orderId', 'o.order_number as orderNumber', 'da.rider_id as riderId', 'da.status');
      return (a as ActiveAssignment | undefined) ?? null;
    });
  }
  invalidateAssignment(assignmentId: number, riderId: number): void {
    this.cache.del(`trk:asg:${assignmentId}:${riderId}`);
  }

  async ridersActiveAssignments(riderId: number): Promise<ActiveAssignment[]> {
    return this.db('delivery_assignments as da').join('orders as o', 'o.id', 'da.order_id').where('da.rider_id', riderId).whereIn('da.status', ['OFFERED', 'ACCEPTED', 'PICKED_UP'])
      .select('da.id', 'da.order_id as orderId', 'o.order_number as orderNumber', 'da.rider_id as riderId', 'da.status');
  }

  async startSession(trx: Knex | Knex.Transaction, assignmentId: number, riderId: number): Promise<void> {
    await trx.raw('INSERT INTO tracking_sessions (assignment_id, rider_id, is_live) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE is_live = 1, ended_at = NULL, end_reason = NULL', [assignmentId, riderId]);
    this.states.set(assignmentId, newTrackState());
  }

  /** Force the next ping to persist (status change marker). */
  markStatusChange(assignmentId: number): void {
    const st = this.states.get(assignmentId);
    if (st) st.forcePersist = true;
  }

  async endSession(trx: Knex | Knex.Transaction, assignmentId: number, reason: EndReason): Promise<void> {
    await trx('tracking_sessions').where({ assignment_id: assignmentId, is_live: 1 }).update({ is_live: 0, ended_at: trx.fn.now(), end_reason: reason });
    this.live.delete(assignmentId);
    this.states.delete(assignmentId);
    this.counters.delete(assignmentId);
  }

  /**
   * Steps 3–8 for one ping. Returns what to broadcast (null = dropped). DB writes are fire-and-forget
   * so a slow disk never delays the live update.
   */
  async ingest(a: ActiveAssignment, p: { lat: number; lng: number; accuracy?: number; speed?: number; ts: number }): Promise<{ broadcast: boolean; weak: boolean; reason?: string }> {
    const cfg = await this.config();
    let st = this.states.get(a.id);
    if (!st) {
      st = newTrackState();
      this.states.set(a.id, st);
    }
    const now = Date.now();
    const v = evaluatePing(st, p, now, cfg);
    const c = this.counters.get(a.id) ?? { pings: 0, persisted: 0 };
    if (!v.accept) {
      if (v.reason === 'TOO_OLD' && v.breadcrumbOnly) {
        // offline-queue flush: keep as breadcrumb only, never as the "live" position
        void this.persist(a.id, p).catch(() => undefined);
      }
      return { broadcast: false, weak: false, reason: v.reason };
    }
    c.pings++;
    this.live.set(a.id, { lat: p.lat, lng: p.lng, at: now, accuracy: p.accuracy ?? null, weak: v.weakSignal });
    if (v.persist) {
      c.persisted++;
      void this.persist(a.id, p).catch(() => undefined);
    }
    if (v.updateSession) {
      void this.db('tracking_sessions').where({ assignment_id: a.id })
        .update({ last_lat: p.lat, last_lng: p.lng, last_accuracy_m: p.accuracy !== undefined ? Math.min(65535, Math.round(p.accuracy)) : null, last_speed_kmh: p.speed !== undefined ? Math.min(999, Math.max(0, p.speed * 3.6)).toFixed(2) : null, last_ping_at: this.db.fn.now(), ping_count: this.db.raw('ping_count + ?', [c.pings]), persisted_count: this.db.raw('persisted_count + ?', [c.persisted]), is_live: 1 })
        .then(() => {
          c.pings = 0;
          c.persisted = 0;
        })
        .catch(() => undefined);
    }
    this.counters.set(a.id, c);
    return { broadcast: true, weak: v.weakSignal };
  }

  private async persist(assignmentId: number, p: { lat: number; lng: number; accuracy?: number; ts: number }): Promise<void> {
    await this.db('delivery_locations').insert({ assignment_id: assignmentId, latitude: p.lat.toFixed(7), longitude: p.lng.toFixed(7), accuracy_m: p.accuracy !== undefined ? Math.min(65535, Math.round(p.accuracy)) : null, recorded_at: new Date(p.ts) });
  }

  async orderNumberForAssignment(assignmentId: number): Promise<string | null> {
    const r = await this.db('delivery_assignments as da').join('orders as o', 'o.id', 'da.order_id').where('da.id', assignmentId).first('o.order_number');
    return r?.order_number ?? null;
  }
  async customerForOrder(orderNumber: string): Promise<number | null> {
    const r = await this.db('orders').where({ order_number: orderNumber }).first('customer_id');
    return r?.customer_id ?? null;
  }

  livePosition(assignmentId: number): LivePosition | undefined {
    return this.live.get(assignmentId);
  }
  liveAssignments(): number[] {
    return [...this.live.keys()];
  }

  /** Same data as GET /orders/:no/track and the socket 'tracking.snapshot' (reconnect). */
  async snapshot(orderNumber: string): Promise<TrackingSnapshot | null> {
    const o = await this.db('orders').where({ order_number: orderNumber }).first('id', 'order_number', 'status', 'eta_minutes', 'ship_lat', 'ship_lng');
    if (!o) return null;
    const a = await this.db('delivery_assignments as da').join('users as u', 'u.id', 'da.rider_id').leftJoin('tracking_sessions as ts', 'ts.assignment_id', 'da.id')
      .where('da.order_id', o.id).whereNotIn('da.status', ['REJECTED', 'CANCELLED']).orderBy('da.id', 'desc')
      .first('da.id', 'u.name', 'u.phone', 'ts.is_live', 'ts.last_lat', 'ts.last_lng', 'ts.last_ping_at');
    const staleSec = await this.settings.int('tracking_stale_seconds', 90);
    const mem = a ? this.live.get(a.id) : undefined;
    const lastAt = mem ? new Date(mem.at) : a?.last_ping_at ? new Date(a.last_ping_at) : null;
    const stale = isStale(lastAt, new Date(), staleSec);
    return {
      orderNumber: o.order_number,
      status: o.status as OrderStatus,
      labelHi: ORDER_STATUS_LABEL_HI[o.status as OrderStatus],
      isLive: Boolean(a && Number(a.is_live) === 1 && !stale),
      isStale: Boolean(a) && stale,
      lat: mem?.lat ?? (a && a.last_lat !== null && a.last_lat !== undefined ? Number(a.last_lat) : null),
      lng: mem?.lng ?? (a && a.last_lng !== null && a.last_lng !== undefined ? Number(a.last_lng) : null),
      lastPingAt: lastAt ? lastAt.toISOString() : null,
      rider: a ? { name: a.name, phone: localPhone(a.phone) } : null,
      etaMinutes: o.eta_minutes === null ? null : Number(o.eta_minutes),
      destination: { lat: o.ship_lat !== null ? Number(o.ship_lat) : null, lng: o.ship_lng !== null ? Number(o.ship_lng) : null },
    };
  }

  /** Cron (A19): sessions quiet > tracking_auto_end_min are closed — never "live" forever. */
  async autoClose(): Promise<number> {
    const mins = await this.settings.int('tracking_auto_end_min', 120);
    const rows = (await this.db('tracking_sessions').where({ is_live: 1 }).where((w) => w.where('last_ping_at', '<', this.db.raw('NOW() - INTERVAL ? MINUTE', [mins])).orWhere((x) => x.whereNull('last_ping_at').andWhere('started_at', '<', this.db.raw('NOW() - INTERVAL ? MINUTE', [mins])))).pluck('assignment_id')) as number[];
    for (const id of rows) await this.endSession(this.db, id, 'TIMEOUT');
    return rows.length;
  }

  /** Cron: riders silent for 30 min go off duty. */
  async ridersOfflineStale(): Promise<number> {
    return this.db('staff_profiles as s')
      .join('users as u', 'u.id', 's.user_id')
      .where('u.role', 'DELIVERY_BOY')
      .where('s.is_available', 1)
      .whereNotExists(this.db('tracking_sessions as t').whereRaw('t.rider_id = s.user_id').where('t.last_ping_at', '>', this.db.raw('NOW() - INTERVAL 30 MINUTE')))
      .whereNotExists(this.db('delivery_assignments as d').whereRaw('d.rider_id = s.user_id').whereIn('d.status', ['OFFERED', 'ACCEPTED', 'PICKED_UP']))
      .where('s.updated_at', '<', this.db.raw('NOW() - INTERVAL 30 MINUTE'))
      .update({ 's.is_available': 0 });
  }
}
