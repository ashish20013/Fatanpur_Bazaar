import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PagedResult } from '../../common/interceptors/transform.interceptor';
import { AppError } from '../../common/errors';
import { Log } from '../../common/logger';
import { clientIp, pageArgs, type AppRequest, type AuthUser } from '../../common/types';
import { istDate } from '../../common/utils/time';
import { SettingError, SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('admin')
@Roles('ADMIN', 'SUPERVISOR')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @RequirePermission('reports.view')
  dashboard(): Promise<unknown> {
    return this.admin.dashboard();
  }

  @Get('reports/sales')
  @RequirePermission('reports.view')
  sales(
    @Query('from') from = istDate(new Date(Date.now() - 30 * 86400_000)),
    @Query('to') to = istDate(),
  ): Promise<unknown> {
    if (!DATE.test(from) || !DATE.test(to)) throw new BadRequestException();
    return this.admin.salesReport(from, to);
  }

  @Get('customers')
  @RequirePermission('customers.view')
  async customers(@Query() q: Record<string, string>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 50, 100);
    const r = await this.admin.customers(q.q?.slice(0, 40), page, perPage);
    return new PagedResult(r.items, page, perPage, r.total);
  }

  @Patch('customers/:id/status')
  @HttpCode(200)
  @RequirePermission('customers.manage')
  async customerStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body(
      new ZodPipe(
        z.object({ status: z.enum(['ACTIVE', 'DISABLED']), reason: z.string().max(255).optional() }),
      ),
    )
    b: { status: 'ACTIVE' | 'DISABLED'; reason?: string },
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<{ ok: true }> {
    await this.admin.setCustomerStatus(id, b.status, b.reason, u, clientIp(req));
    return { ok: true };
  }

  @Get('audit-logs')
  @RequirePermission('audit.view')
  async auditLogs(@Query() q: Record<string, string>): Promise<PagedResult<unknown>> {
    const { page, perPage } = pageArgs(q, 50, 100);
    const r = await this.admin.auditLogs(
      {
        action: q.action?.slice(0, 60),
        entity: q.entity?.slice(0, 40),
        entityId: q.entityId?.slice(0, 40),
        actorId: q.actorId ? Number(q.actorId) : undefined,
      },
      page,
      perPage,
    );
    return new PagedResult(r.items, page, perPage, r.total);
  }

  @Get('areas/flagged')
  @RequirePermission('service_area.view')
  flagged(): Promise<unknown> {
    return this.admin.flaggedAreas();
  }
  @Post('areas/flagged/:addressId/reviewed')
  @HttpCode(200)
  @RequirePermission('villages.manage')
  async reviewed(
    @Param('addressId', ParseIntPipe) id: number,
    @CurrentUser() u: AuthUser,
  ): Promise<{ ok: true }> {
    await this.admin.reviewFlag(id, u.id);
    return { ok: true };
  }
}

/**
 * Settings are ADMIN-only at the ROLE layer: even a SUPERVISOR who somehow holds settings.manage
 * gets 403 (RBAC-07) — and resolvePermissions strips admin-only codes anyway.
 */
@Controller('admin/settings')
@Roles('ADMIN')
@RequirePermission('settings.manage')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async all(): Promise<unknown> {
    // `locked` and `secret` travel with each row so the panel can render a read-only field or a
    // write-only one instead of offering a control whose save will be refused. Both refusals live
    // in the service — these flags only let the screen tell the truth about what can be changed.
    // Secret values are already replaced with dots by the time they get here.
    return this.settings.adminRows();
  }

  @Put()
  async update(
    @Body(new ZodPipe(z.object({ changes: z.record(z.string().max(80), z.string().max(2000)) })))
    b: { changes: Record<string, string> },
    @CurrentUser() u: AuthUser,
    @Req() req: AppRequest,
  ): Promise<unknown> {
    try {
      const r = await this.settings.update(b.changes, u.id);
      await this.audit.log({
        actorId: u.id,
        actorRole: u.role,
        action: 'settings.change',
        entityType: 'settings',
        entityId: Object.keys(b.changes).join(',').slice(0, 40),
        before: r.before,
        after: r.after,
        ip: clientIp(req),
      });
      return { ok: true, changed: Object.keys(r.after) };
    } catch (e) {
      /*
       * Our own validation messages are written for the shopkeeper and go back to him. Anything
       * else — a driver error, a dropped connection — is logged and answered generically, because
       * `ER_DATA_TOO_LONG for column 'value'` tells him nothing he can act on and a connection
       * failure's text carries the database host and port into an HTTP response.
       */
      if (e instanceof SettingError) throw new AppError('BUSINESS_RULE', { reason: `सेटिंग सही नहीं: ${e.message}` });
      Log.error('settings.update_failed', { err: String(e), keys: Object.keys(b.changes).join(',') });
      throw new AppError('BUSINESS_RULE', { reason: 'सेटिंग सहेजी नहीं जा सकी — थोड़ी देर बाद दोबारा कोशिश करें', reasonEn: 'The setting could not be saved — please try again' });
    }
  }
}
