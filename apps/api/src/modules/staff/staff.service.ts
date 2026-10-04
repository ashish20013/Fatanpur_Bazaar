import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ADMIN_ONLY_PERMISSIONS, ALL_PERMISSIONS, RIDER_GRANTABLE_PERMISSIONS, SCOPED_ADMIN_DEFAULT_PERMISSIONS, type Permission, type Role } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { AppError, conflict, forbidden, notFound } from '../../common/errors';
import { localPhone } from '../../common/utils/phone';
import { referralCode } from '../../common/utils/ids';
import { isGlobalAdmin, type AuthUser } from '../../common/types';
import { grantablePermissions } from '../../domain/permissions';
import { SettingsService } from '../settings/settings.service';
import { AuditService } from '../audit/audit.service';
import { IdentityService } from '../identity/identity.service';
import { NotificationService } from '../notifications/notification.service';
import { TokenService } from '../auth/token.service';
import type { CreateStaffDto } from './staff.schemas';

const ACTIVE_ASSIGNMENT = ['OFFERED', 'ACCEPTED', 'PICKED_UP'];

/**
 * Delegation (migration 003): an actor who lacks the full code but holds `staff.manage_riders`
 * may act ONLY on DELIVERY_BOY accounts. ADMIN always has the full code.
 */
function riderOnly(actor: AuthUser, full: Permission): boolean {
  if (isGlobalAdmin(actor) || actor.permissions.has(full)) return false;
  if (actor.permissions.has('staff.manage_riders')) return true;
  throw new AppError('FORBIDDEN');
}

/**
 * Admin accounts are the owner's business, nobody else's.
 *
 * Creating one, changing one, disabling one, granting it anything, or logging it out — all of it
 * is the global admin's alone. Without this a second admin could disable the first and take the
 * shop; with it, the worst a scoped admin can do is exactly what he was handed.
 */
const ADMIN_ONLY_HI = 'एडमिन खाते सिर्फ़ मुख्य एडमिन (मालिक) संभाल सकते हैं';
const ADMIN_ONLY_EN = 'Only the main admin (the owner) can manage admin accounts';
function assertOwner(actor: AuthUser): void {
  if (!isGlobalAdmin(actor)) throw new AppError('FORBIDDEN', { reason: ADMIN_ONLY_HI, reasonEn: ADMIN_ONLY_EN });
}

/** The owner's own account is not a thing anyone edits from a web form — not even the owner. */
const SELF_HI = 'मुख्य एडमिन का खाता यहाँ से नहीं बदला जा सकता';
const SELF_EN = 'The main admin account cannot be changed from here';
function assertNotOwnerAccount(u: { is_global_admin?: number | null }): void {
  if (Number(u.is_global_admin ?? 0) === 1) throw new AppError('FORBIDDEN', { reason: SELF_HI, reasonEn: SELF_EN });
}
const RIDERS_ONLY_EN = 'You can manage delivery partners only';
const RIDERS_ONLY_HI = 'आप सिर्फ़ डिलीवरी पार्टनर संभाल सकते हैं';
/** A permission problem, so 403 (not 409): the actor may manage riders, but not this account/role. */
const ridersOnly = (): AppError => new AppError('FORBIDDEN', { reason: RIDERS_ONLY_HI, reasonEn: RIDERS_ONLY_EN });

/** A7 — the ONLY way staff accounts come into existence (POST /admin/staff). */
@Injectable()
export class StaffService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
    private readonly tokens: TokenService,
    private readonly notify: NotificationService,
  ) {}

  async create(dto: CreateStaffDto, actor: AuthUser, ip: string): Promise<{ id: number; role: Role; employeeCode: string; promoted: boolean }> {
    if (dto.role === 'ADMIN') {
      assertOwner(actor); // only the owner appoints an admin …
      // … and even he needs the second switch on, so one stray click cannot mint one.
      if (!(await this.settings.bool('allow_admin_creation', false))) throw new AppError('FORBIDDEN', { reason: 'नया एडमिन बनाने का स्विच बंद है — Settings में allow_admin_creation चालू करें', reasonEn: 'Admin creation is switched off — turn on allow_admin_creation in Settings' });
    }
    const limited = riderOnly(actor, 'staff.create');
    if (limited && dto.role !== 'DELIVERY_BOY') throw ridersOnly();
    const requested = dto.permissions ?? [];
    if (limited && requested.some((p) => !(RIDER_GRANTABLE_PERMISSIONS as readonly string[]).includes(p))) {
      throw new AppError('FORBIDDEN', { reason: 'डिलीवरी पार्टनर को सिर्फ़ लाइव ट्रैकिंग की अनुमति दी जा सकती है', reasonEn: 'A delivery partner can only be given live-tracking access' });
    }
    /*
     * A new admin's access is decided here and nowhere else.
     *
     * The ADMIN role no longer carries any permissions of its own, so an admin created with an
     * empty list would open the panel and find every screen shut — which reads as a bug, not as a
     * decision. When the owner ticks nothing, he gets the day-to-day set and can widen or narrow
     * it afterwards in Staff → Permissions. When he does tick a list, that list is taken exactly
     * as given, including `settings.manage` and `permissions.manage`: handing over the keys is the
     * owner's call, and only he can make it.
     */
    let grants: Permission[];
    if (dto.role === 'ADMIN') {
      grants = requested.length ? [...new Set(requested)].filter((p): p is Permission => (ALL_PERMISSIONS as readonly string[]).includes(p)) : [...SCOPED_ADMIN_DEFAULT_PERMISSIONS];
    } else {
      const g = grantablePermissions(actor.permissions, requested);
      if (g.denied.length) throw new AppError('BUSINESS_RULE', { reason: `ये अनुमतियाँ आप नहीं दे सकते: ${g.denied.join(', ')}` });
      grants = g.ok;
    }

    const phone = `91${dto.phone}`;
    const result = await this.db.transaction(async (trx) => {
      const existing = await trx('users').where({ phone }).forUpdate().first('id', 'role', 'status');
      if (existing && existing.role !== 'CUSTOMER') throw conflict('यह नंबर पहले से स्टाफ़ है', undefined, 'This number is already a staff member');
      // Turning an existing customer account into staff (and re-activating it) is an ADMIN decision —
      // a rider manager could otherwise convert any shopper, or revive a customer an admin banned.
      if (existing && limited) throw new AppError('FORBIDDEN', { reason: 'यह नंबर ग्राहक का है — इसे डिलीवरी पार्टनर सिर्फ़ एडमिन बना सकते हैं', reasonEn: 'This number belongs to a customer — only an admin can convert it' });
      const employeeCode = dto.employeeCode ?? (await this.nextEmployeeCode(trx));
      let id: number;
      let promoted = false;
      if (existing) {
        // Promote an existing customer: history (cart/orders/wallet) stays; every session is revoked.
        id = existing.id;
        promoted = true;
        await trx('users').where({ id }).update({ role: dto.role, name: dto.name, created_by: actor.id, status: 'ACTIVE' });
        await this.tokens.revokeAll(id, 'promoted', trx);
      } else {
        [id] = await trx('users').insert({ phone, name: dto.name, role: dto.role, status: 'ACTIVE', created_by: actor.id, referral_code: referralCode(10) });
        await trx('wallets').insert({ user_id: id, balance: 0 });
      }
      const dupCode = await trx('staff_profiles').where({ employee_code: employeeCode }).first('user_id');
      if (dupCode) throw conflict('यह कर्मचारी कोड पहले से इस्तेमाल हो रहा है');
      await trx('staff_profiles').insert({
        user_id: id,
        employee_code: employeeCode,
        vehicle_type: dto.vehicleType ?? null,
        vehicle_number: dto.vehicleNumber ?? null,
        designation: dto.designation ?? null,
        supervisor_id: dto.supervisorId ?? null,
        joined_on: trx.raw('CURDATE()'),
      });
      for (const code of grants) await trx('user_permissions').insert({ user_id: id, permission_code: code, granted: 1, granted_by: actor.id });
      await this.audit.log(
        { actorId: actor.id, actorRole: actor.role, action: 'staff.create', entityType: 'user', entityId: id, before: existing ? { role: 'CUSTOMER' } : null, after: { phone, role: dto.role, permissions: grants, promoted }, ip },
        trx,
      );
      await this.notify.send({ userId: id, type: 'staff.created', title: 'स्टाफ़ खाता बना', body: 'आपका स्टाफ़ खाता बन गया है — अपने फ़ोन नंबर और OTP से लॉगिन करें।', channels: ['IN_APP'] }, trx);
      return { id, role: dto.role as Role, employeeCode, promoted };
    });
    this.identity.invalidate(result.id);
    return result;
  }

  private async nextEmployeeCode(trx: Knex.Transaction): Promise<string> {
    const [{ n }] = (await trx('staff_profiles').count({ n: '*' })) as { n: number }[];
    for (let i = Number(n) + 1; i < Number(n) + 50; i++) {
      const code = `EMP-${String(i).padStart(3, '0')}`;
      if (!(await trx('staff_profiles').where({ employee_code: code }).first('user_id'))) return code;
    }
    throw new Error('Could not allocate employee code');
  }

  async list(): Promise<unknown[]> {
    const rows = await this.db('users as u')
      .join('staff_profiles as s', 's.user_id', 'u.id')
      .whereIn('u.role', ['ADMIN', 'SUPERVISOR', 'DELIVERY_BOY'])
      .orderBy('u.role')
      .orderBy('u.id')
      .select('u.id', 'u.name', 'u.phone', 'u.role', 'u.status', 'u.is_global_admin as isGlobalAdmin', 'u.last_login_at as lastLoginAt', 's.employee_code as employeeCode', 's.vehicle_type as vehicleType', 's.is_available as isAvailable', 's.cod_in_hand as codInHand', 's.total_deliveries as totalDeliveries', 's.rating_avg as ratingAvg');
    return rows.map((r: { phone: string }) => ({ ...r, phone: localPhone(r.phone) }));
  }

  async detail(id: number): Promise<unknown> {
    const u = await this.db('users as u').leftJoin('staff_profiles as s', 's.user_id', 'u.id').where('u.id', id).whereIn('u.role', ['ADMIN', 'SUPERVISOR', 'DELIVERY_BOY']).first('u.id', 'u.name', 'u.phone', 'u.role', 'u.status', 'u.is_global_admin as isGlobalAdmin', 's.employee_code as employeeCode', 's.vehicle_type as vehicleType', 's.vehicle_number as vehicleNumber');
    if (!u) throw notFound();
    const overrides = await this.db('user_permissions').where({ user_id: id }).select('permission_code as code', 'granted');
    const global = u.role === 'ADMIN' && Number(u.isGlobalAdmin) === 1;
    const effective = [...(await this.identity.permissionsFor(u.id, u.role, global))];
    return { ...u, isGlobalAdmin: global, phone: localPhone(u.phone), overrides, effective };
  }

  /** DISABLE — revokes every session; blocked for the last active admin and riders mid-delivery. */
  async disable(id: number, reason: string, actor: AuthUser, ip: string): Promise<void> {
    await this.db.transaction(async (trx) => {
      const u = await trx('users').where({ id }).forUpdate().first('id', 'role', 'status', 'is_global_admin');
      if (!u || u.role === 'CUSTOMER') throw notFound();
      assertNotOwnerAccount(u); // the owner cannot be locked out — not by a manager, not by himself
      if (u.role === 'ADMIN') assertOwner(actor);
      if (riderOnly(actor, 'staff.manage') && u.role !== 'DELIVERY_BOY') throw ridersOnly();
      if (u.status !== 'ACTIVE') return;
      await this.assertNotLastAdmin(trx, u, 'disable');
      const active = await trx('delivery_assignments').where({ rider_id: id }).whereIn('status', ACTIVE_ASSIGNMENT).first('id');
      if (active) throw conflict('इस स्टाफ़ के पास चालू डिलीवरी है — पहले दूसरे को सौंपें (reassign)', undefined, 'This person has an active delivery — reassign it first');
      await trx('users').where({ id }).update({ status: 'DISABLED', disabled_at: trx.fn.now(), disabled_by: actor.id, disable_reason: reason });
      await trx('staff_profiles').where({ user_id: id }).update({ is_available: 0 });
      await this.tokens.revokeAll(id, 'disabled', trx);
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'staff.disable', entityType: 'user', entityId: id, before: { status: 'ACTIVE' }, after: { status: 'DISABLED' }, reason, ip }, trx);
    });
    this.identity.invalidate(id);
  }

  async enable(id: number, actor: AuthUser, ip: string): Promise<void> {
    const target = await this.db('users').where({ id }).first('role');
    if (!target || target.role === 'CUSTOMER') throw notFound();
    if (target.role === 'ADMIN') assertOwner(actor);
    if (riderOnly(actor, 'staff.manage') && target.role !== 'DELIVERY_BOY') throw ridersOnly();
    const n = await this.db('users').where({ id }).whereNot({ role: 'CUSTOMER' }).update({ status: 'ACTIVE', disabled_at: null, disabled_by: null, disable_reason: null });
    if (!n) throw notFound();
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'staff.enable', entityType: 'user', entityId: id, after: { status: 'ACTIVE' }, ip });
    this.identity.invalidate(id);
  }

  /** ROLE CHANGE — ADMIN only; last-admin lock; every session revoked; ADMIN target needs the switch. */
  async changeRole(id: number, role: Role, reason: string, actor: AuthUser, ip: string): Promise<void> {
    if (actor.id === id) throw forbidden(); // nobody changes their own role
    if (role === 'ADMIN') {
      assertOwner(actor);
      if (!(await this.settings.bool('allow_admin_creation', false))) throw forbidden();
    }
    /*
     * A rider manager moves riders, and nobody else. Without this, `staff.manage_riders` — the
     * small grant a supervisor gets so he can add delivery partners — reached this route and
     * became the power to re-role anyone in the shop.
     */
    const limited = riderOnly(actor, 'staff.manage');
    if (limited && role !== 'DELIVERY_BOY') throw ridersOnly();
    await this.db.transaction(async (trx) => {
      const u = await trx('users').where({ id }).forUpdate().first('id', 'role', 'status', 'is_global_admin');
      if (!u) throw notFound();
      assertNotOwnerAccount(u);
      if (u.role === 'ADMIN') assertOwner(actor); // demoting an admin is the owner's call too
      if (limited && u.role !== 'DELIVERY_BOY') throw ridersOnly();
      /*
       * Turning a SHOPPER into staff is creating a staff account by another name, so it needs the
       * same permission `POST /admin/staff` needs. Otherwise this route is a back door around it:
       * sign a phone up as an ordinary customer, then re-role it here.
       */
      if (u.role === 'CUSTOMER' && !isGlobalAdmin(actor) && !actor.permissions.has('staff.create')) {
        throw new AppError('FORBIDDEN', { reason: 'ग्राहक को स्टाफ़ बनाने की अनुमति आपके पास नहीं है', reasonEn: 'You do not have permission to turn a customer into staff' });
      }
      if (u.role === role) return;
      if (u.role === 'ADMIN') await this.assertNotLastAdmin(trx, u, 'downgrade');
      // The manager's grants belong to the job he had. Leaving them attached would quietly hand a
      // demoted admin the same access under a smaller role.
      if (u.role === 'ADMIN') await trx('user_permissions').where({ user_id: id }).delete();
      await trx('users').where({ id }).update({ role });
      if (role === 'CUSTOMER') await trx('user_permissions').where({ user_id: id }).delete();
      else if (!(await trx('staff_profiles').where({ user_id: id }).first('user_id'))) {
        await trx('staff_profiles').insert({ user_id: id, employee_code: await this.nextEmployeeCode(trx) });
      }
      await this.tokens.revokeAll(id, 'role_change', trx);
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'staff.role_change', entityType: 'user', entityId: id, before: { role: u.role }, after: { role }, reason, ip }, trx);
    });
    this.identity.invalidate(id);
  }

  async setPermissions(id: number, grants: { code: string; granted: boolean }[], actor: AuthUser, ip: string): Promise<void> {
    const u = await this.db('users').where({ id }).first('id', 'role', 'is_global_admin');
    if (!u || u.role === 'CUSTOMER') throw notFound();
    assertNotOwnerAccount(u); // the owner already holds everything and nobody edits that list
    /*
     * This is the screen the whole global-admin idea rests on: it is where the owner decides what
     * his second admin can reach. It used to refuse outright ("an admin already has everything"),
     * which was true when ADMIN meant the owner and is exactly what had to change.
     */
    if (u.role === 'ADMIN') assertOwner(actor);
    const limited = riderOnly(actor, 'permissions.manage');
    const riderCodes = RIDER_GRANTABLE_PERMISSIONS as readonly string[];
    if (limited) {
      if (u.role !== 'DELIVERY_BOY') throw ridersOnly();
      const bad = grants.filter((g) => !riderCodes.includes(g.code));
      if (bad.length) throw new AppError('FORBIDDEN', { reason: 'डिलीवरी पार्टनर को सिर्फ़ लाइव ट्रैकिंग की अनुमति दी जा सकती है', reasonEn: 'A delivery partner can only be given live-tracking access' });
    }
    // Nobody but the owner can hand out a permission they do not hold themselves (A7 §5).
    if (!isGlobalAdmin(actor)) {
      const { denied } = grantablePermissions(actor.permissions, grants.filter((g) => g.granted).map((g) => g.code));
      if (denied.length) throw new AppError('FORBIDDEN', { reason: `ये अनुमतियाँ आप नहीं दे सकते: ${denied.join(', ')}`, reasonEn: `You cannot grant: ${denied.join(', ')}` });
    }
    // settings.manage / permissions.manage let a holder widen his own access, so they stay inside
    // the ADMIN role — but the owner may hand them to the admin he appointed. That is the one case.
    const adminOnly = grants.filter((g) => g.granted && (ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(g.code));
    if (adminOnly.length && !(u.role === 'ADMIN' && isGlobalAdmin(actor))) throw new AppError('BUSINESS_RULE', { reason: `${adminOnly.map((g) => g.code).join(', ')} सिर्फ ADMIN के पास रहती है` });
    const before = await this.db('user_permissions').where({ user_id: id }).select('permission_code', 'granted');
    await this.db.transaction(async (trx) => {
      // A rider manager only replaces the rider-safe rows; every other override (e.g. a DENY an
      // admin set) is left exactly as it was.
      const del = trx('user_permissions').where({ user_id: id });
      await (limited ? del.whereIn('permission_code', [...riderCodes]) : del).delete();
      for (const g of grants) await trx('user_permissions').insert({ user_id: id, permission_code: g.code, granted: g.granted ? 1 : 0, granted_by: actor.id });
      await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'permissions.change', entityType: 'user', entityId: id, before, after: grants, ip }, trx);
    });
    this.identity.invalidate(id); // A6: invalidate immediately on permissions.change
  }

  async revokeSessions(id: number, actor: AuthUser, ip: string): Promise<number> {
    const target = await this.db('users').where({ id }).first('role', 'is_global_admin');
    if (!target || target.role === 'CUSTOMER') throw notFound();
    assertNotOwnerAccount(target);
    if (target.role === 'ADMIN') assertOwner(actor);
    if (riderOnly(actor, 'staff.manage') && target.role !== 'DELIVERY_BOY') throw ridersOnly();
    const n = await this.tokens.revokeAll(id, 'admin_reset');
    await this.audit.log({ actorId: actor.id, actorRole: actor.role, action: 'staff.revoke_sessions', entityType: 'user', entityId: id, after: { revoked: n }, ip });
    return n;
  }

  private async assertNotLastAdmin(trx: Knex.Transaction, u: { id: number; role: string }, _what: string): Promise<void> {
    if (u.role !== 'ADMIN') return;
    const others = await trx('users').where({ role: 'ADMIN', status: 'ACTIVE' }).whereNot({ id: u.id }).forUpdate().first('id');
    if (!others) throw conflict('सिस्टम में कम से कम एक एडमिन ज़रूरी है', undefined, 'The system needs at least one active admin');
  }
}
