import type { Permission, Role, UserStatus } from '@fb/shared-types';
import type { Request } from 'express';
import { edgeInfo } from './edge';

export interface AuthUser {
  id: number;
  role: Role;
  status: UserStatus;
  name: string | null;
  phone: string;
  permissions: Set<Permission>;
  /** The owner's own account: bypasses every permission check and cannot be touched by anyone. */
  isGlobalAdmin: boolean;
}

/**
 * "Does this person answer to nobody?" — the one bypass left in the system.
 *
 * Everywhere this replaces a plain `role === 'ADMIN'` test, the test was asking "is this the
 * owner?" and getting the wrong answer the moment a second admin existed. Written as a function so
 * that question is asked the same way in guards, services and the socket handshake, and so the
 * next place that needs it cannot quietly re-introduce the old check.
 */
export function isGlobalAdmin(u: { role: Role; isGlobalAdmin?: boolean } | null | undefined): boolean {
  return !!u && u.role === 'ADMIN' && u.isGlobalAdmin === true;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  /** Injected by OwnershipGuard — controllers must use it instead of re-fetching (TOCTOU). */
  resource?: unknown;
  requestId?: string;
  guestKey?: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
}

export interface PageQuery {
  page: number;
  perPage: number;
}

export function pageArgs(q: { page?: unknown; perPage?: unknown }, defaultPer = 24, maxPer = 100): PageQuery {
  const page = Math.max(1, Math.min(10000, Number.parseInt(String(q.page ?? '1'), 10) || 1));
  const perPage = Math.max(1, Math.min(maxPer, Number.parseInt(String(q.perPage ?? defaultPer), 10) || defaultPer));
  return { page, perPage };
}

/**
 * The shopper's address. When the request came through our own website with the edge secret, that
 * is the address the website saw; otherwise it is whoever connected. See common/edge.ts.
 */
export function clientIp(req: Request): string {
  const edge = edgeInfo(req);
  if (edge.trusted && edge.clientIp) return edge.clientIp;
  return (req.ip || req.socket?.remoteAddress || '0.0.0.0').replace(/^::ffff:/, '');
}
