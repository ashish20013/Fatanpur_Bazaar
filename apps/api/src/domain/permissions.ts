import { ADMIN_ONLY_PERMISSIONS, ALL_PERMISSIONS, type Permission, type Role } from '@fb/shared-types';

/**
 * A6: GLOBAL ADMIN → everything. Otherwise (role defaults ∪ granted=1) − granted=0.
 *
 * ⚠️ The blanket "ADMIN → everything" bypass is now the GLOBAL admin's alone.
 *
 * The shop has one owner and, from today, a second admin who is a manager. If ADMIN still meant
 * "everything", that manager could change the UPI number money lands in and disable the owner. So
 * the role opens the admin panel and the global admin decides what is inside it: a scoped admin
 * starts empty and holds exactly what he has been granted.
 *
 * That also means `role_permissions` is not consulted for ADMIN — it is seeded with every code, so
 * reading it would hand a scoped admin the whole shop by the back door. IdentityService passes an
 * empty base for that role on purpose.
 *
 * ADMIN-only permissions are stripped from non-admins even if a stray override grants them
 * (defence in depth for RBAC-07: SUPERVISOR + grant settings.manage → still 403). They are NOT
 * stripped from the ADMIN role, because the owner must be able to hand his manager the settings
 * screen if he wants to — that is his call to make, and StaffService still forbids a scoped admin
 * from touching another admin or promoting himself.
 */
export function resolvePermissions(
  role: Role,
  base: readonly string[],
  overrides: readonly { permission_code: string; granted: number | boolean }[],
  isGlobalAdmin = false,
): Set<Permission> {
  if (role === 'ADMIN' && isGlobalAdmin) return new Set(ALL_PERMISSIONS);
  const set = new Set<string>(base);
  for (const o of overrides) if (Number(o.granted) === 1) set.add(o.permission_code);
  for (const o of overrides) if (Number(o.granted) === 0) set.delete(o.permission_code);
  if (role !== 'ADMIN') for (const p of ADMIN_ONLY_PERMISSIONS) set.delete(p);
  if (role === 'CUSTOMER') set.clear(); // customers act through ownership, never permissions
  return new Set([...set].filter((p): p is Permission => (ALL_PERMISSIONS as readonly string[]).includes(p)));
}

/** A7 step 5: an actor can only grant what it holds itself (and never admin-only codes). */
export function grantablePermissions(actorPerms: ReadonlySet<Permission>, requested: readonly string[]): { ok: Permission[]; denied: string[] } {
  const ok: Permission[] = [];
  const denied: string[] = [];
  for (const r of requested) {
    if (actorPerms.has(r as Permission) && !(ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(r)) ok.push(r as Permission);
    else denied.push(r);
  }
  return { ok, denied };
}
