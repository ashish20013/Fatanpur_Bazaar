import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, RateLimit, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { clientIp, type AppRequest, type AuthUser } from '../../common/types';
import { PaymentsService } from './payments.service';

const NO = /^FB-\d{8}-\d{4,6}$/;
/**
 * A claim carries ONLY the order, and optionally the UTR. A client-sent `paid:true` / `status` is
 * stripped (PAY-08).
 *
 * The UTR is optional on purpose: demanding it before recording anything left customers who had
 * already sent the money stuck on PENDING_PAYMENT. It still helps the shopkeeper match a line in
 * his bank app, so it is offered — it just cannot block. Either way the money is only ever marked
 * PAID by a human with `payments.verify`.
 */
const ClaimSchema = z.object({
  orderNumber: z.string().regex(NO),
  utr: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{10,22}$/, 'UTR नंबर 10–22 अक्षर/अंक का होता है')
    .optional(),
});

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('upi-details/:orderNumber')
  details(@Param('orderNumber') no: string, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.payments.upiDetails(no, u.id);
  }

  /**
   * The UPI QR, as actual PNG bytes.
   *
   * ⚠️ Written with `res.end` on purpose. With `passthrough: true` Nest hands the return value to
   * its Express adapter, which sends any object with `res.json()` — and a Buffer is an object, so
   * the customer received `{"type":"Buffer","data":[137,80,...]}` under an `image/png` header and
   * saw a broken-image box where the QR should be. Writing the bytes ourselves is the only way to
   * keep them bytes.
   */
  @Get('upi-qr/:file')
  async qr(@Param('file') file: string, @CurrentUser() u: AuthUser, @Res() res: Response): Promise<void> {
    const no = file.replace(/\.png$/, '');
    const png = await this.payments.upiQrPng(no, u.id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(png);
  }

  /**
   * "Pay online" → the session token Cashfree's checkout needs. Returns 422 with a plain Hindi
   * line while the gateway is off or half-configured, which is the state the shop is in today.
   */
  @Post('gateway/session/:orderNumber')
  @HttpCode(200)
  @RateLimit({ bucket: 'gateway_session', by: 'user', limit: 20, windowSec: 3600 })
  gatewaySession(@Param('orderNumber') no: string, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.payments.gatewaySession(no, u.id);
  }

  @Post('upi/claim')
  @HttpCode(200)
  @RateLimit({ bucket: 'upi_claim', by: 'user', limit: 10, windowSec: 3600 })
  claim(@Body(new ZodPipe(ClaimSchema)) b: z.infer<typeof ClaimSchema>, @CurrentUser() u: AuthUser): Promise<unknown> {
    return this.payments.claimUpi(b.orderNumber, b.utr, u.id);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @Roles('ADMIN', 'SUPERVISOR')
  @RequirePermission('payments.verify')
  verify(@Param('id', ParseIntPipe) id: number, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.payments.verify(id, u, clientIp(req));
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('ADMIN', 'SUPERVISOR')
  @RequirePermission('payments.verify')
  reject(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(z.object({ reason: z.string().trim().min(3).max(255), action: z.enum(['CONVERT_COD', 'CANCEL']) }))) b: { reason: string; action: 'CONVERT_COD' | 'CANCEL' }, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.payments.reject(id, b.reason, b.action, u, clientIp(req));
  }

  @Post(':id/refund')
  @HttpCode(200)
  @Roles('ADMIN', 'SUPERVISOR')
  @RequirePermission('payments.refund')
  refund(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(z.object({ method: z.enum(['WALLET', 'UPI_MANUAL']), reference: z.string().max(80).optional(), amount: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/).optional() }))) b: { method: 'WALLET' | 'UPI_MANUAL'; reference?: string; amount?: string }, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.payments.refund(id, b, u, clientIp(req));
  }
}

@Controller('admin')
@Roles('ADMIN', 'SUPERVISOR')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('payments/pending')
  @RequirePermission('payments.view')
  pending(): Promise<unknown> {
    return this.payments.pending();
  }

  @Post('orders/:orderNumber/convert-cod')
  @HttpCode(200)
  @RequirePermission('payments.verify')
  cod(@Param('orderNumber') no: string, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.payments.convertToCod(no, u, clientIp(req));
  }
}

/** Gateway webhooks: public + HMAC over the RAW body (captured before JSON parsing). */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('payment/:driver')
  @HttpCode(200)
  hook(@Param('driver') driver: string, @Req() req: AppRequest & { rawBody?: Buffer }): Promise<unknown> {
    return this.payments.webhook(driver, req.rawBody, req.headers);
  }
}
