import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import type { OrderStatus } from '@fb/shared-types';
import { CurrentUser, Owns, RateLimit, RequirePermission, Resource, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AppError } from '../../common/errors';
import { PagedResult } from '../../common/interceptors/transform.interceptor';
import { isGlobalAdmin, clientIp, pageArgs, type AppRequest, type AuthUser } from '../../common/types';
import { toPaise } from '../../common/utils/money';
import { QuoteService } from './quote.service';
import { OrderPlacementService } from './order-placement.service';
import { OrderStateService, type OrderRow } from './order-state.service';
import { OrdersQueryService } from './orders-query.service';
import { AdjustmentService } from './adjustment.service';
import { CartService } from '../cart/cart.service';

/*
 * Each product once. Two lines for the same product each passed `max_qty_per_order` on their own,
 * so the per-order cap could be doubled by simply listing the item twice. (Stock was never at
 * risk — placement re-checks every line under a lock — but the cap is the shop's rule.)
 */
const Items = z
  .array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(1000) }))
  .min(1)
  .max(60)
  .refine((xs) => new Set(xs.map((x) => x.productId)).size === xs.length, { message: 'एक ही सामान दो बार नहीं — मात्रा बढ़ा दें' });
/** Only ids + quantities cross the wire. Any `price`, `total`, `paid`, `customerId` is stripped. */
const QuoteSchema = z.object({
  addressId: z.number().int().positive(),
  items: Items,
  couponCode: z.string().trim().max(30).optional(),
  useWallet: z.boolean().optional(),
  paymentMethod: z.enum(['COD', 'UPI', 'WALLET', 'GATEWAY']),
  orderType: z.enum(['DELIVERY', 'SERVICE']).optional(),
});
const PlaceSchema = QuoteSchema.extend({
  prescriptionId: z.number().int().positive().optional(),
  note: z.string().trim().max(500).optional(),
  slot: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), start: z.string().regex(/^\d{2}:\d{2}$/) }).optional(),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly quotes: QuoteService,
    private readonly placement: OrderPlacementService,
    private readonly state: OrderStateService,
    private readonly query: OrdersQueryService,
    private readonly cart: CartService,
  ) {}

  @Post('quote')
  @HttpCode(200)
  @RateLimit({ bucket: 'quote', by: 'user', limit: 30, windowSec: 300 })
  async quote(@CurrentUser() u: AuthUser, @Body(new ZodPipe(QuoteSchema)) b: z.infer<typeof QuoteSchema>): Promise<unknown> {
    return this.quotes.toResponse(await this.quotes.build(u.id, b));
  }

  @Post()
  place(@CurrentUser() u: AuthUser, @Body(new ZodPipe(PlaceSchema)) b: z.infer<typeof PlaceSchema>, @Headers('x-idempotency-key') key: string | undefined): Promise<unknown> {
    if (!key || !UUID.test(key)) throw new AppError('VALIDATION_FAILED', {}, { field: 'X-Idempotency-Key' });
    return this.placement.place(u.id, b, key.toLowerCase());
  }

  @Get()
  async mine(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 20, 50);
    const r = await this.query.list({ customerId: u.id }, page, perPage);
    return new PagedResult(r.items, page, perPage, r.total);
  }

  @Get(':orderNumber')
  @Owns('order', 'orderNumber')
  detail(@Resource() order: OrderRow, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.query.detail(order, u.role === 'CUSTOMER' || order.customer_id === u.id ? 'CUSTOMER' : u.role === 'DELIVERY_BOY' ? 'RIDER' : 'STAFF');
  }

  @Post(':orderNumber/cancel')
  @HttpCode(200)
  @Owns('order', 'orderNumber')
  cancel(@Resource() order: OrderRow, @CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ reason: z.string().trim().max(255).optional() }))) b: { reason?: string }, @Req() req: AppRequest): Promise<unknown> {
    if (order.customer_id !== u.id) throw new AppError('FORBIDDEN');
    return this.state.changeStatus(order.order_number, 'CANCELLED', { id: u.id, kind: 'CUSTOMER', permissions: u.permissions }, { note: b.reason ?? 'ग्राहक ने रद्द किया', ip: clientIp(req) });
  }

  @Get(':orderNumber/bill')
  @Owns('order', 'orderNumber')
  bill(@Resource() order: OrderRow): Promise<unknown> {
    return this.query.bill(order);
  }

  @Post(':orderNumber/reorder')
  @HttpCode(200)
  @Owns('order', 'orderNumber')
  async reorder(@Resource() order: OrderRow, @CurrentUser() u: AuthUser): Promise<unknown> {
    const items = (await this.query.reorderLines(order.id)) as { product_id: number; quantity: number }[];
    for (const it of items) {
      try {
        await this.cart.add({ userId: u.id }, { productId: it.product_id, quantity: it.quantity });
      } catch {
        // unavailable items are simply skipped — the cart view reports what made it in
        continue;
      }
    }
    return this.cart.view({ userId: u.id });
  }
}

const StatusSchema = z.object({ status: z.string().max(24), note: z.string().trim().max(255).optional(), overrideReason: z.string().trim().min(5).max(255).optional() });
const AdjustSchema = z.object({
  items: z.array(z.object({ itemId: z.number().int().positive(), finalQuantity: z.number().int().min(0).optional(), finalLineTotal: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/).optional(), remove: z.boolean().optional(), note: z.string().max(160).optional() })).min(1).max(60),
});

@Controller('admin/orders')
@Roles('ADMIN', 'SUPERVISOR')
export class AdminOrdersController {
  constructor(
    private readonly state: OrderStateService,
    private readonly query: OrdersQueryService,
    private readonly adjust: AdjustmentService,
  ) {}

  @Get()
  @RequirePermission('orders.view_all')
  async list(@Query() q: Record<string, string>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 50, 100);
    const r = await this.query.list({ status: q.status ? q.status.split(',') : undefined, paymentStatus: q.payment ? q.payment.split(',') : undefined, q: q.q?.slice(0, 40), village: q.village, date: q.date }, page, perPage);
    return new PagedResult(r.items, page, perPage, r.total);
  }

  @Get(':orderNumber')
  @RequirePermission('orders.view_all')
  @Owns('order', 'orderNumber')
  detail(@Resource() order: OrderRow): Promise<unknown> {
    return this.query.detail(order, 'STAFF');
  }

  /** Manual status change — role/permission checked by the state machine itself; audited. */
  @Patch(':orderNumber/status')
  @RequirePermission('orders.update_status')
  status(@Param('orderNumber') no: string, @Body(new ZodPipe(StatusSchema)) b: z.infer<typeof StatusSchema>, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    if (b.overrideReason && !isGlobalAdmin(u)) throw new AppError('FORBIDDEN');
    return this.state.changeStatus(no, b.status as OrderStatus, { id: u.id, kind: u.role, permissions: u.permissions, isGlobalAdmin: u.isGlobalAdmin }, { note: b.note, overrideReason: b.overrideReason, ip: clientIp(req) });
  }

  @Post(':orderNumber/adjust')
  @RequirePermission('orders.adjust')
  doAdjust(@Param('orderNumber') no: string, @Body(new ZodPipe(AdjustSchema)) b: z.infer<typeof AdjustSchema>, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.adjust.adjust(no, b.items.map((i) => ({ ...i, finalLineTotal: i.finalLineTotal !== undefined ? toPaise(i.finalLineTotal) : undefined })), u, clientIp(req));
  }
}
