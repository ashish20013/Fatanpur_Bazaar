import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { clientIp, type AppRequest, type AuthUser } from '../../common/types';
import { toPaise, fromPaise } from '../../common/utils/money';
import { CouponsService } from './coupons.service';

const money = z.string().regex(/^\d{1,7}(\.\d{1,2})?$/);
const dt = z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/);
const CouponSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9]{3,30}$/), title: z.string().max(160).optional(), description: z.string().max(255).optional(),
  discountType: z.enum(['FLAT', 'PERCENT']), discountValue: money, maxDiscount: money.nullable().optional(), minOrderValue: money.optional(),
  usageLimit: z.number().int().positive().nullable().optional(), perUserLimit: z.number().int().min(1).max(100).optional(), firstOrderOnly: z.boolean().optional(),
  appliesTo: z.enum(['ALL', 'PRODUCT', 'SERVICE']).optional(), startsAt: dt, expiresAt: dt, isActive: z.boolean().optional(),
}).refine((c) => c.discountType === 'FLAT' || Number(c.discountValue) <= 100, { message: 'प्रतिशत 100 से ज़्यादा नहीं', path: ['discountValue'] });

@Controller('coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  /** Preview only — the real discount is recomputed server-side in /orders/quote. */
  @Post('check')
  @HttpCode(200)
  async check(@CurrentUser() u: AuthUser, @Body(new ZodPipe(z.object({ code: z.string().max(30), itemsTotal: money, orderType: z.enum(['DELIVERY', 'SERVICE']).default('DELIVERY') }))) b: { code: string; itemsTotal: string; orderType: 'DELIVERY' | 'SERVICE' }): Promise<unknown> {
    const r = await this.coupons.evaluate(b.code, { userId: u.id, itemsTotal: toPaise(b.itemsTotal), orderType: b.orderType });
    return r.ok ? { valid: true, discount: fromPaise(r.discount) } : { valid: false, reason: r.reason };
  }
}

@Controller('admin/coupons')
@Roles('ADMIN', 'SUPERVISOR')
@RequirePermission('coupons.manage')
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}
  @Get()
  list(): Promise<unknown> {
    return this.coupons.list();
  }
  @Post()
  create(@Body(new ZodPipe(CouponSchema)) b: z.infer<typeof CouponSchema>, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.coupons.save(null, b, u, clientIp(req));
  }
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(CouponSchema)) b: z.infer<typeof CouponSchema>, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.coupons.save(id, b, u, clientIp(req));
  }
}
