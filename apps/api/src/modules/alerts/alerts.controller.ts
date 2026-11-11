import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AppError } from '../../common/errors';
import { clientIp, isGlobalAdmin, type AppRequest, type AuthUser } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { AlertConfigError, AlertConfigService } from './alert-config.service';
import { AlertsService } from './alerts.service';

const ORDER_NO = z.string().regex(/^FB-\d{8}-\d{4}$/);

/**
 * The Global Admin's alert settings.
 *
 * ⚠️ Gated three ways, and the third is the one that matters: ADMIN at the role layer,
 * `settings.manage` at the permission layer, and `isGlobalAdmin` checked in the handler. The
 * first two are what the shop's other settings use; the third is because these keys decide who
 * gets woken up at night, and a scoped admin the owner hired to manage stock has no business
 * redirecting the shop's alerts to himself. A hidden menu item would not be enough — an ADMIN
 * can call the API directly.
 */
@Controller('admin/alerts')
@Roles('ADMIN')
@RequirePermission('settings.manage')
export class AlertConfigController {
  constructor(
    private readonly cfg: AlertConfigService,
    private readonly alerts: AlertsService,
    private readonly audit: AuditService,
  ) {}

  private assertOwner(u: AuthUser): void {
    if (!isGlobalAdmin(u)) throw new AppError('FORBIDDEN');
  }

  @Get('config')
  async config(@CurrentUser() u: AuthUser): Promise<unknown> {
    this.assertOwner(u);
    return { rows: await this.cfg.rows(), resolved: await this.cfg.read() };
  }

  @Put('config')
  async save(
    @Body(new ZodPipe(z.object({ changes: z.record(z.string().max(80), z.string().max(400)) })))
    b: { changes: Record<string, string> },
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    this.assertOwner(u);
    try {
      const r = await this.cfg.save(b.changes, u.id);
      await this.audit.log({
        actorId: u.id,
        actorRole: u.role,
        action: 'alert.config',
        entityType: 'settings',
        entityId: Object.keys(b.changes).join(',').slice(0, 40),
        before: r.before,
        after: r.after,
        ip: clientIp(req),
      });
      return { saved: Object.keys(r.after).length, resolved: await this.cfg.read() };
    } catch (e) {
      if (e instanceof AlertConfigError) throw new AppError('BUSINESS_RULE', { reason: e.message, reasonEn: 'That alert setting is not valid' });
      throw e;
    }
  }

  @Get('logs')
  async logs(@Query('kind') kind = 'notifications', @Query('limit') limit = '100', @CurrentUser() u: AuthUser): Promise<unknown> {
    this.assertOwner(u);
    const kinds = ['notifications', 'escalations', 'rejections', 'assignments', 'config'] as const;
    if (!(kinds as readonly string[]).includes(kind)) throw new BadRequestException();
    const n = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 100));
    return this.alerts.history(kind as (typeof kinds)[number], n);
  }
}

/**
 * The escalation board's own actions.
 *
 * Assigning a rider is NOT here: `POST /admin/orders/:orderNumber/assign` already does it,
 * atomically, with its own audit trail and its own permission. Adding a second way to assign an
 * order would be a second place for the "one active assignment" rule to be got wrong.
 */
@Controller('admin/alerts')
@Roles('ADMIN', 'SUPERVISOR')
export class AlertsBoardController {
  constructor(private readonly alerts: AlertsService) {}

  /** Orders still waiting for a delivery partner, with who has declined and who is arranging. */
  @Get('unassigned')
  @RequirePermission('delivery.assign')
  unassigned(): Promise<unknown> {
    return this.alerts.unassigned();
  }

  /**
   * "I'll arrange a delivery boy" — records responsibility, assigns nothing.
   * The order stays on the board until a real delivery partner is on it.
   */
  @Post('unassigned/:orderNumber/arrange')
  @HttpCode(200)
  @RequirePermission('delivery.assign')
  arrange(@Param('orderNumber', new ZodPipe(ORDER_NO)) orderNumber: string, @CurrentUser() u: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.alerts.arrange(orderNumber, u, clientIp(req));
  }
}
