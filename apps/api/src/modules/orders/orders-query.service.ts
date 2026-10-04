import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { CUSTOMER_CANCELLABLE, ORDER_STATUS_LABEL_HI, type OrderDetail, type OrderStatus, type OrderSummary } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { ENV, type Env } from '../../config/config.module';
import { localPhone } from '../../common/utils/phone';
import { mapsUrl } from '../../common/utils/geo';
import { extrasView } from '../users/address-extras';
import { PaymentRecordsService } from '../payments/payment-records.service';

interface OrderListFilters {
  customerId?: number;
  status?: string[];
  q?: string;
  village?: string;
  paymentStatus?: string[];
  date?: string;
}

/** Read models for customer / staff / rider order screens. */
@Injectable()
export class OrdersQueryService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(ENV) private readonly env: Env,
    private readonly payments: PaymentRecordsService,
  ) {}

  async list(f: OrderListFilters, page: number, perPage: number): Promise<{ items: OrderSummary[]; total: number }> {
    const base = this.db('orders as o');
    if (f.customerId) base.where('o.customer_id', f.customerId);
    if (f.status?.length) base.whereIn('o.status', f.status);
    if (f.paymentStatus?.length) base.whereIn('o.payment_status', f.paymentStatus);
    if (f.village) base.where('o.ship_village', f.village);
    if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) base.whereRaw('DATE(o.placed_at) = ?', [f.date]);
    if (f.q) base.where((w) => w.where('o.order_number', 'like', `%${f.q}%`).orWhere('o.ship_phone', 'like', `%${f.q}%`).orWhere('o.ship_name', 'like', `%${f.q}%`));
    const [{ total }] = (await base.clone().count({ total: 'o.id' })) as { total: number }[];
    const rows = (await base
      .clone()
      .orderBy('o.placed_at', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage)
      .select('o.order_number', 'o.status', 'o.order_type', 'o.grand_total', 'o.final_grand_total', 'o.payment_method', 'o.payment_status', 'o.placed_at', 'o.ship_village', 'o.ship_name', 'o.ship_phone')
      .select(this.db.raw('(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.is_removed = 0) AS item_count'))) as Record<string, unknown>[];
    return {
      total: Number(total),
      items: rows.map((r) => ({
        orderNumber: String(r.order_number),
        status: r.status as OrderStatus,
        statusLabelHi: ORDER_STATUS_LABEL_HI[r.status as OrderStatus],
        orderType: r.order_type as 'DELIVERY' | 'SERVICE',
        grandTotal: String(r.grand_total),
        payable: String(r.final_grand_total ?? r.grand_total),
        paymentMethod: r.payment_method as OrderSummary['paymentMethod'],
        paymentStatus: r.payment_status as OrderSummary['paymentStatus'],
        itemCount: Number(r.item_count),
        placedAt: new Date(r.placed_at as string).toISOString(),
        village: (r.ship_village as string | null) ?? null,
        ...(f.customerId ? {} : { customerName: r.ship_name, customerPhone: localPhone(String(r.ship_phone)) }),
      })),
    };
  }

  /** Full detail. `viewer` decides whether the delivery OTP is included (customer only). */
  async detail(order: Record<string, unknown>, viewer: 'CUSTOMER' | 'STAFF' | 'RIDER'): Promise<OrderDetail> {
    const id = Number(order.id);
    const [items, logs, assignment, booking, payment, reviewed, extras] = await Promise.all([
      this.db('order_items').where({ order_id: id }).orderBy('id'),
      this.db('order_status_logs').where({ order_id: id }).orderBy('id').select('to_status', 'created_at'),
      this.db('delivery_assignments as da').join('users as u', 'u.id', 'da.rider_id').where('da.order_id', id).whereNotIn('da.status', ['REJECTED', 'CANCELLED']).orderBy('da.id', 'desc').first('da.id', 'da.status', 'da.delivery_otp', 'u.name', 'u.phone'),
      this.db('service_bookings').where({ order_id: id }).first('scheduled_date', 'slot_start', 'slot_end', 'completion_otp', 'otp_verified_at'),
      this.db('payments').where({ order_id: id }).first('status', 'upi_utr'),
      this.db('reviews').where({ order_id: id }).first('id'),
      this.db('order_ship_extras').where({ order_id: id }).first(),
    ]);
    const shipLat = order.ship_lat === null ? null : Number(order.ship_lat);
    const shipLng = order.ship_lng === null ? null : Number(order.ship_lng);
    const status = order.status as OrderStatus;
    const deliveredAt = order.delivered_at ?? order.completed_at;
    const canReview = ['DELIVERED', 'COMPLETED'].includes(status) && !reviewed && !!deliveredAt && Date.now() - new Date(deliveredAt as string).getTime() < 30 * 86400_000;
    const payable = String(order.final_grand_total ?? order.grand_total);
    const showOtp = viewer === 'CUSTOMER' && assignment && ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(status);
    return {
      orderNumber: String(order.order_number),
      status,
      statusLabelHi: ORDER_STATUS_LABEL_HI[status],
      orderType: order.order_type as 'DELIVERY' | 'SERVICE',
      grandTotal: String(order.grand_total),
      payable,
      paymentMethod: order.payment_method as OrderDetail['paymentMethod'],
      paymentStatus: order.payment_status as OrderDetail['paymentStatus'],
      itemCount: (items as unknown[]).length,
      placedAt: new Date(order.placed_at as string).toISOString(),
      village: (order.ship_village as string | null) ?? null,
      items: (items as Record<string, unknown>[]).map((i) => ({
        id: Number(i.id), productId: i.product_id === null ? null : Number(i.product_id), name: String(i.product_name), nameHi: (i.product_name_hi as string) ?? null,
        supplierName: (i.supplier_name as string) ?? null, image: (i.image_url as string) ?? null, unit: `${Number(i.unit_value)} ${i.unit}`, unitPrice: String(i.unit_price),
        quantity: String(i.quantity), finalQuantity: i.final_quantity === null ? null : String(i.final_quantity), lineTotal: String(i.line_total),
        finalLineTotal: (i.final_line_total as string) ?? null, isRemoved: Number(i.is_removed) === 1, itemType: i.item_type as 'PRODUCT' | 'SERVICE',
      })),
      itemsTotal: String(order.items_total),
      deliveryFee: String(order.delivery_fee),
      visitingCharge: String(order.visiting_charge),
      discount: String(order.discount),
      walletUsed: String(order.wallet_used),
      finalItemsTotal: (order.final_items_total as string) ?? null,
      finalGrandTotal: (order.final_grand_total as string) ?? null,
      adjustmentNote: (order.adjustment_note as string) ?? null,
      prescriptionStatus: order.prescription_status as OrderDetail['prescriptionStatus'],
      etaMinutes: order.eta_minutes === null ? null : Number(order.eta_minutes),
      ship: {
        name: String(order.ship_name), phone: localPhone(String(order.ship_phone)), line1: String(order.ship_line1), landmark: (order.ship_landmark as string) ?? null,
        village: (order.ship_village as string) ?? null, lat: shipLat, lng: shipLng, mapsUrl: mapsUrl(shipLat, shipLng), ...extrasView((extras as Record<string, unknown>) ?? {}),
      },
      timeline: (logs as { to_status: OrderStatus; created_at: string }[]).map((l) => ({ status: l.to_status, labelHi: ORDER_STATUS_LABEL_HI[l.to_status] ?? l.to_status, at: new Date(l.created_at).toISOString() })),
      rider: assignment ? { name: assignment.name, phone: localPhone(assignment.phone) } : null,
      // Deliberately plain & short-lived: shown to the customer only, never to ops rooms (A18).
      deliveryOtp: showOtp ? assignment.delivery_otp : null,
      canCancel: viewer === 'CUSTOMER' && (CUSTOMER_CANCELLABLE as readonly string[]).includes(status),
      canReview: viewer === 'CUSTOMER' && canReview,
      upi: order.payment_method === 'UPI' && payment?.status === 'PENDING' && !['CANCELLED', 'PAYMENT_FAILED'].includes(status) ? await this.payments.upiDetails(String(order.order_number), payable, this.env.API_URL) : null,
      service: booking
        ? { date: String(booking.scheduled_date).slice(0, 10), slotStart: String(booking.slot_start).slice(0, 5), slotEnd: String(booking.slot_end).slice(0, 5), completionOtp: viewer === 'CUSTOMER' && !booking.otp_verified_at && ['ASSIGNED', 'IN_PROGRESS'].includes(status) ? booking.completion_otp : null }
        : null,
      clockStartAt: new Date((order.confirmed_at ?? order.placed_at) as string).toISOString(),
      deliveredAt: deliveredAt ? new Date(deliveredAt as string).toISOString() : null,
      serverNow: new Date().toISOString(),
    };
  }

  async reorderLines(orderId: number): Promise<{ product_id: number; quantity: number }[]> {
    return this.db('order_items').where({ order_id: orderId, is_removed: 0, item_type: 'PRODUCT' }).whereNotNull('product_id').select('product_id', 'quantity');
  }

  /** Orders the customer socket should auto-join (A20). */
  async activeOrderNumbersFor(customerId: number): Promise<string[]> {
    return (await this.db('orders').where({ customer_id: customerId }).whereNotIn('status', ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'PAYMENT_FAILED', 'DELIVERY_FAILED', 'RETURNED']).pluck('order_number')) as string[];
  }

  /** Printable bill data (A16: bill always uses final_grand_total ?? grand_total). */
  async bill(order: Record<string, unknown>): Promise<unknown> {
    const d = await this.detail(order, 'STAFF');
    return { ...d, deliveryOtp: null, service: d.service ? { ...d.service, completionOtp: null } : null };
  }
}
