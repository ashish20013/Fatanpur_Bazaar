import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { conflict, notFound } from '../../common/errors';
import { localPhone, maskPhone } from '../../common/utils/phone';
import type { SalesReport } from '@fb/shared-types';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import { TokenService } from '../auth/token.service';
import { ServiceAreaService } from '../service-area/service-area.service';

/** Dashboards, reports, customers, audit viewer, analytics rollup. */
@Injectable()
export class AdminService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
    private readonly tokens: TokenService,
    private readonly sa: ServiceAreaService,
  ) {}

  async dashboard(): Promise<unknown> {
    const one = async <T>(q: Knex.QueryBuilder): Promise<T> => (await q) as T;
    const [today, pendingByStatus, lowStock, payments, rx, week, villages] = await Promise.all([
      one<[{ orders: number; gmv: string | null }]>(
        this.db('orders')
          .whereRaw('DATE(placed_at) = CURDATE()')
          .whereNotIn('status', ['CANCELLED', 'REJECTED', 'PAYMENT_FAILED'])
          .count({ orders: '*' })
          .sum({ gmv: this.db.raw('COALESCE(final_grand_total, grand_total)') }),
      ),
      one<{ status: string; n: number }[]>(
        this.db('orders')
          .whereNotIn('status', [
            'DELIVERED',
            'COMPLETED',
            'CANCELLED',
            'REJECTED',
            'PAYMENT_FAILED',
            'DELIVERY_FAILED',
            'RETURNED',
          ])
          .groupBy('status')
          .select('status')
          .count({ n: '*' }),
      ),
      one<[{ n: number }]>(
        this.db('products')
          .where('item_type', 'PRODUCT')
          .where('is_available', 1)
          .whereRaw('stock_qty <= low_stock_at')
          .count({ n: '*' }),
      ),
      one<{ status: string; n: number }[]>(
        this.db('payments')
          .whereIn('status', ['AWAITING_VERIFICATION', 'REFUND_PENDING'])
          .groupBy('status')
          .select('status')
          .count({ n: '*' }),
      ),
      one<[{ n: number }]>(this.db('prescriptions').where('status', 'PENDING_REVIEW').count({ n: '*' })),
      one<{ d: string; orders: number; gmv: string }[]>(
        this.db('orders')
          .where('placed_at', '>', this.db.raw('NOW() - INTERVAL 7 DAY'))
          .whereIn('status', ['DELIVERED', 'COMPLETED'])
          .groupByRaw('DATE(placed_at)')
          .select(this.db.raw('DATE(placed_at) AS d'))
          .count({ orders: '*' })
          .sum({ gmv: this.db.raw('COALESCE(final_grand_total, grand_total)') })
          .orderBy('d'),
      ),
      this.sa.villageReport(),
    ]);
    return {
      today: { orders: Number(today[0]?.orders ?? 0), gmv: String(today[0]?.gmv ?? '0.00') },
      openOrders: Object.fromEntries(pendingByStatus.map((r) => [r.status, Number(r.n)])),
      lowStock: Number(lowStock[0]?.n ?? 0),
      payments: Object.fromEntries(payments.map((r) => [r.status, Number(r.n)])),
      prescriptionsPending: Number(rx[0]?.n ?? 0),
      last7Days: week.map((r) => ({
        date: String(r.d).slice(0, 10),
        orders: Number(r.orders),
        gmv: String(r.gmv),
      })),
      villages,
    };
  }

  async salesReport(from: string, to: string): Promise<SalesReport> {
    const [byDay, topProducts, byPayment, zeroSearch] = await Promise.all([
      this.db('analytics_daily').whereBetween('stat_date', [from, to]).orderBy('stat_date'),
      this.db('order_items as oi')
        .join('orders as o', 'o.id', 'oi.order_id')
        .whereIn('o.status', ['DELIVERED', 'COMPLETED'])
        .whereRaw('DATE(o.placed_at) BETWEEN ? AND ?', [from, to])
        .where('oi.is_removed', 0)
        .groupBy('oi.product_id', 'oi.product_name_hi', 'oi.product_name')
        .orderByRaw('SUM(COALESCE(oi.final_line_total, oi.line_total)) DESC')
        .limit(20)
        .select('oi.product_id as productId', 'oi.product_name_hi as nameHi', 'oi.product_name as name')
        .sum({ qty: 'oi.quantity' })
        .sum({ revenue: this.db.raw('COALESCE(oi.final_line_total, oi.line_total)') }),
      this.db('orders')
        .whereIn('status', ['DELIVERED', 'COMPLETED'])
        .whereRaw('DATE(placed_at) BETWEEN ? AND ?', [from, to])
        .groupBy('payment_method')
        .select('payment_method as method')
        .count({ orders: '*' })
        .sum({ amount: this.db.raw('COALESCE(final_grand_total, grand_total)') }),
      this.db('search_logs')
        .where('results_count', 0)
        .whereRaw('DATE(created_at) BETWEEN ? AND ?', [from, to])
        .groupBy('query')
        .orderByRaw('COUNT(*) DESC')
        .limit(30)
        .select('query')
        .count({ times: '*' }),
    ]);
    return { byDay, topProducts, byPayment, zeroSearch } as unknown as SalesReport;
  }

  async customers(
    q: string | undefined,
    page: number,
    perPage: number,
  ): Promise<{ items: unknown[]; total: number }> {
    const base = this.db('users as u').where('u.role', 'CUSTOMER');
    if (q) base.where((w) => w.where('u.name', 'like', `%${q}%`).orWhere('u.phone', 'like', `%${q}%`));
    const [{ total }] = (await base.clone().count({ total: '*' })) as { total: number }[];
    const rows = (await base
      .clone()
      .orderBy('u.id', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .select(
        'u.id',
        'u.name',
        'u.phone',
        'u.status',
        'u.phone_verified as phoneVerified',
        'u.created_at as createdAt',
      )
      .select(
        this.db.raw(
          "(SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id AND o.status IN ('DELIVERED','COMPLETED')) AS deliveredOrders",
        ),
      )) as { phone: string }[];
    return { items: rows.map((r) => ({ ...r, phone: localPhone(r.phone) })), total: Number(total) };
  }

  async setCustomerStatus(
    id: number,
    status: 'ACTIVE' | 'DISABLED',
    reason: string | undefined,
    actor: AuthUser,
    ip: string,
  ): Promise<void> {
    const u = await this.db('users').where({ id }).first('role', 'status', 'phone');
    if (!u || u.role !== 'CUSTOMER') throw notFound();
    if (u.status === status) return;
    await this.db.transaction(async (trx) => {
      await trx('users')
        .where({ id })
        .update(
          status === 'DISABLED'
            ? { status, disabled_at: trx.fn.now(), disabled_by: actor.id, disable_reason: reason ?? null }
            : { status, disabled_at: null, disabled_by: null, disable_reason: null },
        );
      if (status === 'DISABLED') await this.tokens.revokeAll(id, 'disabled', trx);
      await this.audit.log(
        {
          actorId: actor.id,
          actorRole: actor.role,
          action: status === 'DISABLED' ? 'user.disable' : 'user.enable',
          entityType: 'user',
          entityId: id,
          before: { status: u.status },
          after: { status, phone: maskPhone(u.phone) },
          reason: reason ?? null,
          ip,
        },
        trx,
      );
    });
    this.identity.invalidate(id);
  }

  async auditLogs(
    f: { action?: string; entity?: string; entityId?: string; actorId?: number },
    page: number,
    perPage: number,
  ): Promise<{ items: unknown[]; total: number }> {
    const base = this.db('audit_logs as a');
    if (f.action) base.where('a.action', 'like', `${f.action}%`);
    if (f.entity) base.where('a.entity', f.entity);
    if (f.entityId) base.where('a.entity_id', f.entityId);
    if (f.actorId) base.where('a.actor_id', f.actorId);
    const [{ total }] = (await base.clone().count({ total: '*' })) as { total: number }[];
    const items = await base
      .clone()
      .leftJoin('users as u', 'u.id', 'a.actor_id')
      .orderBy('a.id', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .select(
        'a.id',
        'a.action',
        'a.entity',
        'a.entity_id as entityId',
        'a.actor_role as actorRole',
        'u.name as actor',
        'a.before_json as before',
        'a.after_json as after',
        'a.ip_address as ip',
        'a.created_at as createdAt',
      );
    return { items, total: Number(total) };
  }

  /** Nightly analytics:rollup for yesterday (and a re-run of today so the dashboard is fresh). */
  async rollup(day: string): Promise<void> {
    await this.db.raw(
      `INSERT INTO analytics_daily (stat_date, orders_placed, orders_delivered, orders_cancelled, services_completed, gmv, cod_amount, upi_amount, delivery_fees, new_customers, active_customers, avg_order_value, avg_delivery_minutes)
       SELECT ?,
         (SELECT COUNT(*) FROM orders WHERE DATE(placed_at) = ?),
         (SELECT COUNT(*) FROM orders WHERE DATE(delivered_at) = ? AND status = 'DELIVERED'),
         (SELECT COUNT(*) FROM orders WHERE DATE(cancelled_at) = ?),
         (SELECT COUNT(*) FROM orders WHERE DATE(completed_at) = ? AND status = 'COMPLETED'),
         (SELECT COALESCE(SUM(COALESCE(final_grand_total, grand_total)),0) FROM orders WHERE status IN ('DELIVERED','COMPLETED') AND DATE(COALESCE(delivered_at, completed_at)) = ?),
         (SELECT COALESCE(SUM(COALESCE(final_grand_total, grand_total)),0) FROM orders WHERE payment_method='COD' AND status IN ('DELIVERED','COMPLETED') AND DATE(COALESCE(delivered_at, completed_at)) = ?),
         (SELECT COALESCE(SUM(COALESCE(final_grand_total, grand_total)),0) FROM orders WHERE payment_method='UPI' AND payment_status='PAID' AND DATE(placed_at) = ?),
         (SELECT COALESCE(SUM(delivery_fee),0) FROM orders WHERE status='DELIVERED' AND DATE(delivered_at) = ?),
         (SELECT COUNT(*) FROM users WHERE role='CUSTOMER' AND DATE(created_at) = ?),
         (SELECT COUNT(DISTINCT customer_id) FROM orders WHERE DATE(placed_at) = ?),
         (SELECT COALESCE(AVG(COALESCE(final_grand_total, grand_total)),0) FROM orders WHERE status IN ('DELIVERED','COMPLETED') AND DATE(COALESCE(delivered_at, completed_at)) = ?),
         (SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, placed_at, delivered_at))) FROM orders WHERE status='DELIVERED' AND DATE(delivered_at) = ?)
       ON DUPLICATE KEY UPDATE orders_placed=VALUES(orders_placed), orders_delivered=VALUES(orders_delivered), orders_cancelled=VALUES(orders_cancelled),
         services_completed=VALUES(services_completed), gmv=VALUES(gmv), cod_amount=VALUES(cod_amount), upi_amount=VALUES(upi_amount), delivery_fees=VALUES(delivery_fees),
         new_customers=VALUES(new_customers), active_customers=VALUES(active_customers), avg_order_value=VALUES(avg_order_value), avg_delivery_minutes=VALUES(avg_delivery_minutes)`,
      [day, day, day, day, day, day, day, day, day, day, day, day, day],
    );
  }

  async flaggedAreas(): Promise<unknown[]> {
    return this.db('address_area_flags as f')
      .join('addresses as a', 'a.id', 'f.address_id')
      .join('users as u', 'u.id', 'a.user_id')
      .where('f.flag_new_area', 1)
      .whereNull('f.reviewed_at')
      .select(
        'f.address_id as addressId',
        'f.area_text as areaText',
        'a.line1',
        'a.latitude as lat',
        'a.longitude as lng',
        'a.distance_km as distanceKm',
        'u.name as customer',
        'f.created_at as createdAt',
      );
  }
  async reviewFlag(addressId: number, actorId: number): Promise<void> {
    const n = await this.db('address_area_flags')
      .where({ address_id: addressId })
      .update({ reviewed_by: actorId, reviewed_at: this.db.fn.now() });
    if (!n) throw conflict('यह पता पहले ही देखा जा चुका है');
  }
}
