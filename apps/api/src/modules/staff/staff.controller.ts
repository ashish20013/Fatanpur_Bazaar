import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Req } from '@nestjs/common';
import type { z } from 'zod';
import { CurrentUser, RequireAnyPermission, RequirePermission, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { clientIp, type AppRequest, type AuthUser } from '../../common/types';
import { StaffService } from './staff.service';
import { CreateStaffSchema, DisableSchema, PermissionsSchema, RoleChangeSchema, type CreateStaffDto } from './staff.schemas';

/**
 * /admin/staff. Every route is permission-gated. SUPERVISOR is admitted at the role layer ONLY so that
 * an ADMIN-granted `staff.create` works (RBAC-06); by default a supervisor lacks it → 403 (RBAC-05).
 * Role changes stay ADMIN-only, and only an ADMIN can mint an ADMIN (see StaffService.create).
 */
@Controller('admin/staff')
@Roles('ADMIN', 'SUPERVISOR')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermission('staff.view')
  list(): Promise<unknown> {
    return this.staff.list();
  }

  @Get(':id')
  @RequirePermission('staff.view')
  detail(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.staff.detail(id);
  }

  /** Full creators (staff.create) or rider managers (staff.manage_riders → DELIVERY_BOY only, checked in the service). */
  @Post()
  @RequireAnyPermission('staff.create', 'staff.manage_riders')
  create(@Body(new ZodPipe(CreateStaffSchema)) dto: CreateStaffDto, @CurrentUser() actor: AuthUser, @Req() req: AppRequest): Promise<unknown> {
    return this.staff.create(dto, actor, clientIp(req));
  }

  @Patch(':id/disable')
  @RequireAnyPermission('staff.manage', 'staff.manage_riders')
  async disable(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(DisableSchema)) b: z.infer<typeof DisableSchema>, @CurrentUser() actor: AuthUser, @Req() req: AppRequest): Promise<{ ok: true }> {
    await this.staff.disable(id, b.reason, actor, clientIp(req));
    return { ok: true };
  }

  @Patch(':id/enable')
  @RequireAnyPermission('staff.manage', 'staff.manage_riders')
  async enable(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser, @Req() req: AppRequest): Promise<{ ok: true }> {
    await this.staff.enable(id, actor, clientIp(req));
    return { ok: true };
  }

  /*
   * ⚠️ This route needs a permission of its own, and for a while it had none.
   *
   * `@Roles('ADMIN')` alone was enough to reach it, and a scoped admin IS an ADMIN — so the one
   * person whose access the owner had carefully ticked item by item could promote any customer
   * account (including a second phone of his own) to SUPERVISOR and inherit that role's whole
   * permission set, or demote the shop's real supervisor and lock him out. Every other mutation on
   * this controller was gated; this one slipped through because the role check looked like one.
   */
  @Patch(':id/role')
  @Roles('ADMIN')
  @RequirePermission('staff.manage')
  async role(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(RoleChangeSchema)) b: z.infer<typeof RoleChangeSchema>, @CurrentUser() actor: AuthUser, @Req() req: AppRequest): Promise<{ ok: true }> {
    await this.staff.changeRole(id, b.role, b.reason, actor, clientIp(req));
    return { ok: true };
  }

  @Put(':id/permissions')
  @RequireAnyPermission('permissions.manage', 'staff.manage_riders')
  async permissions(@Param('id', ParseIntPipe) id: number, @Body(new ZodPipe(PermissionsSchema)) b: z.infer<typeof PermissionsSchema>, @CurrentUser() actor: AuthUser, @Req() req: AppRequest): Promise<{ ok: true }> {
    await this.staff.setPermissions(id, b.grants, actor, clientIp(req));
    return { ok: true };
  }

  @Post(':id/revoke-sessions')
  @RequireAnyPermission('staff.manage', 'staff.manage_riders')
  async revoke(@Param('id', ParseIntPipe) id: number, @CurrentUser() actor: AuthUser, @Req() req: AppRequest): Promise<{ revoked: number }> {
    return { revoked: await this.staff.revokeSessions(id, actor, clientIp(req)) };
  }
}
