import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ROLE_DEFAULT_PERMISSIONS, type Permission, type Role, type UserStatus } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { CACHE, type ICacheProvider } from '../../common/cache/cache.provider';
import { resolvePermissions } from '../../domain/permissions';
import type { AuthUser } from '../../common/types';

const TTL = 30_000; // A5/A6: role + permissions re-read from DB, 30 s cache

interface UserRow {
  id: number;
  role: Role;
  status: UserStatus;
  name: string | null;
  phone: string;
  is_global_admin: number;
}

/**
 * Identity lookups used by guards and the socket handshake. Role/status ALWAYS come from the DB
 * (cached 30 s) — the JWT role claim is only a hint (matrix §0: "Purana valid JWT ... → 403").
 */
@Injectable()
export class IdentityService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(CACHE) private readonly cache: ICacheProvider,
  ) {}

  async loadAuthUser(id: number): Promise<AuthUser | null> {
    const row = await this.cache.wrap<UserRow | null>(`auth:user:${id}`, TTL, async () => {
      const r = await this.db('users').select('id', 'role', 'status', 'name', 'phone', 'is_global_admin').where({ id }).first();
      return (r as UserRow | undefined) ?? null;
    });
    if (!row) return null;
    const global = row.role === 'ADMIN' && Number(row.is_global_admin) === 1;
    const permissions = await this.permissionsFor(row.id, row.role, global);
    return { id: row.id, role: row.role, status: row.status, name: row.name, phone: row.phone, permissions, isGlobalAdmin: global };
  }

  async permissionsFor(userId: number, role: Role, isGlobalAdmin?: boolean): Promise<Set<Permission>> {
    // Resolved once and cached under the flag too: the owner and a scoped admin share a role but
    // not a permission set, so one cache key for both would hand whichever arrived second the
    // other's access.
    const global = isGlobalAdmin ?? (role === 'ADMIN' && (await this.isGlobalAdminId(userId)));
    const list = await this.cache.wrap<Permission[]>(`perms:${userId}:${role}:${global ? 'g' : 'x'}`, TTL, async () => {
      if (role === 'CUSTOMER' || (role === 'ADMIN' && global)) return [...resolvePermissions(role, [], [], global)];
      const overrides = (await this.db('user_permissions').where({ user_id: userId }).select('permission_code', 'granted')) as { permission_code: string; granted: number }[];
      /*
       * A scoped admin gets NO base at all — see domain/permissions.ts. `role_permissions` holds
       * every code for ADMIN, so reading it here would give the shop's manager the owner's keys.
       * His access is exactly the grants the global admin has ticked.
       */
      if (role === 'ADMIN') return [...resolvePermissions(role, [], overrides, false)];
      const base = (await this.db('role_permissions').where({ role }).pluck('permission_code')) as string[];
      // If role_permissions were ever emptied by mistake, fall back to the shared-types defaults.
      const effectiveBase = base.length ? base : [...(ROLE_DEFAULT_PERMISSIONS[role as 'SUPERVISOR' | 'DELIVERY_BOY'] ?? [])];
      return [...resolvePermissions(role, effectiveBase, overrides, false)];
    });
    return new Set(list);
  }

  /** Is this user the owner? Cached with the user row, so it costs nothing on the hot path. */
  async isGlobalAdminId(userId: number): Promise<boolean> {
    const r = (await this.cache.wrap<UserRow | null>(`auth:user:${userId}`, TTL, async () => {
      const row = await this.db('users').select('id', 'role', 'status', 'name', 'phone', 'is_global_admin').where({ id: userId }).first();
      return (row as UserRow | undefined) ?? null;
    })) as UserRow | null;
    return !!r && r.role === 'ADMIN' && Number(r.is_global_admin) === 1;
  }

  /**
   * Is the session the access token was minted for still alive?
   *
   * Without this, revoking a session does nothing until the 15-minute access token expires: a
   * stolen refresh token that triggers reuse detection, an admin pressing "log this rider out",
   * and the 5-session cap all leave the old access token working. The `sid` claim is checked
   * against the DB here, on the same 30 s cache as the user row, so a revoke bites almost at once.
   *
   * Tokens minted before `sid` existed carry no session id; those are allowed through on
   * signature + user status alone rather than logging everyone out on deploy day.
   */
  async isSessionLive(sessionId: number | undefined): Promise<boolean> {
    if (!sessionId) return true;
    return this.cache.wrap<boolean>(`auth:sess:${sessionId}`, TTL, async () => {
      const r = (await this.db('auth_sessions')
        .where({ id: sessionId })
        .whereNull('revoked_at')
        .where('expires_at', '>', this.db.fn.now())
        .first('id')) as { id: number } | undefined;
      return !!r;
    });
  }

  /** Call after disable / role change / permission change — takes effect on the next request. */
  invalidate(userId: number): void {
    this.cache.del(`auth:user:${userId}`);
    this.cache.delPrefix(`perms:${userId}:`);
  }

  /** Call wherever auth_sessions rows are revoked, so the guard stops honouring their tokens. */
  invalidateSessions(sessionIds: readonly number[]): void {
    for (const id of sessionIds) this.cache.del(`auth:sess:${id}`);
  }
}
