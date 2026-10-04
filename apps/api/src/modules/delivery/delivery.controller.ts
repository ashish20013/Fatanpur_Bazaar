import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Owns, RequirePermission, Resource, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { clientIp, pageArgs, type AppRequest, type AuthUser } from '../../common/types';
import { DeliveryService } from './delivery.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

type A = { id: number; rider_id: number; status: string; order_id: number };
const Reason = z.object({ reason: z.string().trim().min(3).max(255) });
const Ping = z.object({ assignmentId: z.number().int().positive(), lat: z.number(), lng: z.number(), accuracy: z.number().nonnegative().optional(), speed: z.number().optional(), ts: z.number().int().positive() });

/** Rider endpoints — every :id is resolved through OwnershipGuard (another rider's → 403, RBAC-04). */
@Controller('delivery')
@Roles('DELIVERY_BOY', 'SUPERVISOR')
export class DeliveryController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly gateway: TrackingGateway,
  ) {}

  @Get('assignments')
  mine(@CurrentUser() u: AuthUser): Promise<unknown> {
    return this.delivery.myAssignments(u.id);
  }
  /** Broadcast model: orders waiting in the pool for anyone on duty to take. */
  @Get('pool')
  pool(): Promise<unknown> {
    return this.delivery.availablePool();
  }
  /** Rider takes an order himself — no admin step. First tap wins (race-safe). */
  @Post('claim/:orderNumber')
  @HttpCode(200)
  claim(@Param('orderNumber') no: string, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.delivery.claim(no, u, clientIp(req));
  }
  @Post('assignments/:id/accept')
  @HttpCode(200)
  @Owns('assignment')
  accept(@Resource() a: A, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.delivery.accept(a, u);
  }
  @Post('assignments/:id/reject')
  @HttpCode(200)
  @Owns('assignment')
  reject(@Resource() a: A, @CurrentUser() u: AuthUser, @Body(new ZodPipe(Reason)) b: { reason: string }): Promise<unknown> {
    return this.delivery.reject(a, b.reason, u);
  }
  @Post('assignments/:id/pickup')
  @HttpCode(200)
  @Owns('assignment')
  pickup(@Resource() a: A, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.delivery.pickup(a, u);
  }
  @Post('assignments/:id/start')
  @HttpCode(200)
  @Owns('assignment')
  start(@Resource() a: A, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.delivery.outForDelivery(a, u);
  }
  /** OTP verified by the state machine hook — DELIVERED happens only with the customer's code. */
  @Post('assignments/:id/complete')
  @HttpCode(200)
  @Owns('assignment')
  complete(@Resource() a: A, @CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ otp: z.string().regex(/^\d{4}$/, 'OTP 4 अंकों का होता है') }))) b: { otp: string }): Promise<unknown> {
    return this.delivery.complete(a, b.otp, u);
  }
  @Post('assignments/:id/fail')
  @HttpCode(200)
  @Owns('assignment')
  fail(@Resource() a: A, @CurrentUser() u: AuthUser, @Body(new ZodPipe(Reason)) b: { reason: string }): Promise<unknown> {
    return this.delivery.fail(a, b.reason, u);
  }
  @Post('duty')
  @HttpCode(200)
  duty(@CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ available: z.boolean() }))) b: { available: boolean }): Promise<unknown> {
    return this.delivery.setDuty(u.id, b.available);
  }
  /** REST fallback when WebSocket/polling both fail (LIVE_TRACKING §5). */
  @Post('ping')
  @HttpCode(200)
  async ping(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Ping)) b: z.infer<typeof Ping>): Promise<{ accepted: boolean }> {
    return { accepted: u.role === 'DELIVERY_BOY' ? await this.gateway.ingestRest(u.id, b) : false };
  }
  @Get('history')
  history(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>): Promise<unknown> {
    const { page, perPage } = pageArgs(q, 20, 50);
    return this.delivery.history(u.id, page, perPage);
  }
  @Get('earnings')
  earnings(@CurrentUser() u: AuthUser): Promise<unknown> {
    return this.delivery.earnings(u.id);
  }
}

const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/);

@Controller('admin')
@Roles('ADMIN', 'SUPERVISOR')
export class AdminDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('orders/:orderNumber/assign')
  @RequirePermission('delivery.assign')
  assign(@Param('orderNumber') no: string, @Body(new ZodPipe(z.object({ riderId: z.number().int().positive() }))) b: { riderId: number }, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.delivery.assign(no, b.riderId, u, clientIp(req));
  }
  @Post('orders/:orderNumber/reassign')
  @RequirePermission('delivery.reassign')
  reassign(@Param('orderNumber') no: string, @Body(new ZodPipe(z.object({ riderId: z.number().int().positive() }))) b: { riderId: number }, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.delivery.assign(no, b.riderId, u, clientIp(req), true);
  }
  @Get('delivery/board')
  @RequirePermission('delivery.track')
  board(): Promise<unknown> {
    return this.delivery.board();
  }
  @Post('cod/settle')
  @RequirePermission('delivery.settle_cod')
  settle(@Body(new ZodPipe(z.object({ riderId: z.number().int().positive(), amount: money, reference: z.string().max(80).optional(), note: z.string().max(255).optional() }))) b: { riderId: number; amount: string; reference?: string; note?: string }, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.delivery.settleCod(b.riderId, b.amount, b.reference, b.note, u, clientIp(req));
  }
  @Post('riders/:id/payout')
  @RequirePermission('delivery.settle_cod')
  payout(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(z.object({ amount: money }))) b: { amount: string }, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.delivery.payout(id, b.amount, u, clientIp(req));
  }
}
