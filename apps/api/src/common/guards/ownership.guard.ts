import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Knex } from 'knex';
import { KNEX } from '../../database/knex.provider';
import { OWNS, type OwnedResource } from '../decorators';
import { AppError } from '../errors';
import { isGlobalAdmin, type AppRequest, type AuthUser } from '../types';

/**
 * A5 OwnershipGuard(@Owns). Loads the resource, checks the owner, injects it into req.resource
 * so the controller never re-fetches (TOCTOU). Failure → 404, never 403, so IDs can't be probed.
 * Exception: rider assignments → 403 (RBAC-04; the caller is already staff — see ASSUMPTIONS).
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(KNEX) private readonly db: Knex,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const meta = this.reflector.get<{ resource: OwnedResource; param: string } | undefined>(OWNS, ctx.getHandler());
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const user = req.user;
    if (!user) throw new AppError('UNAUTHENTICATED');
    const raw = String(req.params[meta.param] ?? '');
    const resource = await this.load(meta.resource, raw, user);
    if (!resource) throw meta.resource === 'assignment' ? new AppError('FORBIDDEN') : new AppError('NOT_FOUND');
    req.resource = resource;
    return true;
  }

  private async load(kind: OwnedResource, raw: string, user: AuthUser): Promise<unknown> {
    switch (kind) {
      case 'order':
        return this.order(raw, user);
      case 'address': {
        const id = toId(raw);
        if (!id) return null;
        return (await this.db('addresses').where({ id, user_id: user.id }).whereNull('deleted_at').first()) ?? null;
      }
      case 'prescription': {
        const id = toId(raw);
        if (!id) return null;
        const rx = await this.db('prescriptions').where({ id }).first();
        if (!rx) return null;
        const ok = rx.user_id === user.id || isGlobalAdmin(user) || user.permissions.has('prescriptions.review');
        return ok ? rx : null;
      }
      case 'assignment': {
        const id = toId(raw);
        if (!id) return null;
        return (await this.db('delivery_assignments').where({ id, rider_id: user.id }).first()) ?? null;
      }
      case 'booking': {
        const id = toId(raw);
        if (!id) return null;
        const b = await this.db('service_bookings as b').join('orders as o', 'o.id', 'b.order_id').where('b.id', id).first('b.*', 'o.customer_id', 'o.order_number');
        if (!b) return null;
        const ok = b.customer_id === user.id || b.technician_id === user.id || isGlobalAdmin(user) || user.permissions.has('orders.view_all');
        return ok ? b : null;
      }
    }
  }

  /** Order: own order, staff with orders.view_all, or a rider who holds/held an assignment on it. */
  private async order(orderNumber: string, user: AuthUser): Promise<unknown> {
    if (!/^FB-\d{8}-\d{4,6}$/.test(orderNumber)) return null;
    const order = await this.db('orders').where({ order_number: orderNumber }).first();
    if (!order) return null;
    if (order.customer_id === user.id) return order;
    if (isGlobalAdmin(user) || (user.role !== 'CUSTOMER' && user.permissions.has('orders.view_all'))) return order;
    if (user.role === 'DELIVERY_BOY') {
      const a = await this.db('delivery_assignments').where({ order_id: order.id, rider_id: user.id }).whereNotIn('status', ['REJECTED']).first('id');
      if (a) return order;
    }
    return null;
  }
}

function toId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
