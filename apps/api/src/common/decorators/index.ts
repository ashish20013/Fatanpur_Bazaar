import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission, Role } from '@fb/shared-types';
import type { AppRequest, AuthUser } from '../types';

export const IS_PUBLIC = 'fb:public';
export const ROLES = 'fb:roles';
export const PERMISSIONS = 'fb:permissions';
export const ANY_PERMISSIONS = 'fb:any-permissions';
export const OWNS = 'fb:owns';
export const RATE_LIMIT = 'fb:rate';
export const OPTIONAL_AUTH = 'fb:optional-auth';

/** Route is reachable without a token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
/** Public, but if a valid Bearer token is present the user is attached (cart, service-area). */
export const OptionalAuth = (): MethodDecorator & ClassDecorator => SetMetadata(OPTIONAL_AUTH, true);
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES, roles);
export const RequirePermission = (...perms: Permission[]): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS, perms);
/** Passes if the user holds AT LEAST ONE code; the service then narrows what that code allows. */
/** Method-only: the route passes if the user holds ANY of these (on top of any @RequirePermission). */
export const RequireAnyPermission = (...perms: Permission[]): MethodDecorator => SetMetadata(ANY_PERMISSIONS, perms);

export type OwnedResource = 'order' | 'address' | 'prescription' | 'assignment' | 'booking';
/** OwnershipGuard loads the resource by route param and injects it as req.resource (404 if not yours). */
export const Owns = (resource: OwnedResource, param = 'id'): MethodDecorator => SetMetadata(OWNS, { resource, param });

export interface RateLimitSpec {
  bucket: string; // e.g. 'otp:send:ip' — the guard appends ':{ip}' or ':{userId}'
  by: 'ip' | 'user';
  limit: number;
  windowSec: number;
}
export const RateLimit = (...specs: RateLimitSpec[]): MethodDecorator => SetMetadata(RATE_LIMIT, specs);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.user) throw new Error('CurrentUser used on a public route');
  return req.user;
});
export const MaybeUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser | undefined => ctx.switchToHttp().getRequest<AppRequest>().user);
/** The resource OwnershipGuard already loaded & authorised. */
export const Resource = createParamDecorator((_d: unknown, ctx: ExecutionContext): unknown => ctx.switchToHttp().getRequest<AppRequest>().resource);
