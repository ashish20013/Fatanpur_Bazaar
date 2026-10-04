import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission, Role } from '@fb/shared-types';
import { ANY_PERMISSIONS, PERMISSIONS, ROLES } from '../decorators';
import { AppError } from '../errors';
import { isGlobalAdmin, type AppRequest } from '../types';

/** @Roles — user.role (from DB) must be listed. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles || roles.length === 0) return true;
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (!user) throw new AppError('UNAUTHENTICATED');
    if (!roles.includes(user.role)) throw new AppError('FORBIDDEN');
    return true;
  }
}

/** @RequirePermission — the GLOBAL admin passes; everyone else needs every listed code. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const perms = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS, [ctx.getHandler(), ctx.getClass()]);
    const any = this.reflector.get<Permission[] | undefined>(ANY_PERMISSIONS, ctx.getHandler());
    if ((!perms || perms.length === 0) && (!any || any.length === 0)) return true;
    const user = ctx.switchToHttp().getRequest<AppRequest>().user;
    if (!user) throw new AppError('UNAUTHENTICATED');
    /*
     * ⚠️ The owner bypasses; a second admin does not.
     *
     * This line used to read `user.role === 'ADMIN'`, which was correct while ADMIN meant "the
     * owner". It stopped being correct the moment the owner could appoint a manager: every
     * @RequirePermission in the codebase would have waved that manager straight through, and the
     * permission list the owner ticked for him would have decided nothing at all.
     */
    if (isGlobalAdmin(user)) return true;
    // A method-level "any of" list is checked IN ADDITION to any "all of" list — never instead of it.
    if (any && any.length && !any.some((p) => user.permissions.has(p))) throw new AppError('FORBIDDEN');
    if (perms && !perms.every((p) => user.permissions.has(p))) throw new AppError('FORBIDDEN');
    return true;
  }
}
