import { OrderStatus, OrderType, Role } from './enums';
import type { Permission } from './permissions';

/**
 * Order state machine (BUILD_PROMPT A15). Shared by API (enforcement), web and mobile
 * (which buttons to show). The API is the only enforcer; UIs merely mirror it.
 */
type S = OrderStatus;
const T = OrderStatus;

const DELIVERY_FLOW: Record<S, readonly S[]> = {
  PENDING_PAYMENT: [T.CONFIRMED, T.PAYMENT_FAILED, T.CANCELLED],
  // CONFIRMED → ASSIGNED and PREPARING → ASSIGNED are the self-claim ("broadcast") paths: the moment
  // an order is confirmed it goes into the rider pool, and a rider on duty takes it himself — no
  // admin step in between. The admin's manual assign still lands on ASSIGNED too, so both the
  // self-serve flow and the admin fallback share one target. The old shop path (PREPARING →
  // READY_FOR_PICKUP → ASSIGNED) still works untouched for a store that prefers to pack first.
  CONFIRMED: [T.ASSIGNED, T.PREPARING, T.REJECTED, T.CANCELLED],
  PREPARING: [T.ASSIGNED, T.READY_FOR_PICKUP, T.CANCELLED],
  READY_FOR_PICKUP: [T.ASSIGNED, T.CANCELLED],
  // ASSIGNED → READY_FOR_PICKUP is the "rider rejected, back to pool" path (orders never freeze).
  ASSIGNED: [T.PICKED_UP, T.READY_FOR_PICKUP, T.DELIVERY_FAILED, T.CANCELLED],
  PICKED_UP: [T.OUT_FOR_DELIVERY, T.DELIVERED, T.DELIVERY_FAILED, T.CANCELLED],
  OUT_FOR_DELIVERY: [T.DELIVERED, T.DELIVERY_FAILED, T.CANCELLED],
  DELIVERED: [T.RETURNED],
  SCHEDULED: [],
  IN_PROGRESS: [],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
  PAYMENT_FAILED: [],
  DELIVERY_FAILED: [],
  RETURNED: [],
};

const SERVICE_FLOW: Record<S, readonly S[]> = {
  PENDING_PAYMENT: [T.CONFIRMED, T.PAYMENT_FAILED, T.CANCELLED],
  CONFIRMED: [T.SCHEDULED, T.REJECTED, T.CANCELLED],
  SCHEDULED: [T.ASSIGNED, T.CANCELLED],
  // ASSIGNED → SCHEDULED: technician declined, booking goes back for re-assignment.
  ASSIGNED: [T.IN_PROGRESS, T.SCHEDULED, T.DELIVERY_FAILED, T.CANCELLED],
  IN_PROGRESS: [T.COMPLETED, T.DELIVERY_FAILED, T.CANCELLED],
  COMPLETED: [],
  PREPARING: [],
  READY_FOR_PICKUP: [],
  PICKED_UP: [],
  OUT_FOR_DELIVERY: [],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
  PAYMENT_FAILED: [],
  DELIVERY_FAILED: [],
  RETURNED: [],
};

export const ORDER_TRANSITIONS: Record<OrderType, Record<S, readonly S[]>> = {
  DELIVERY: DELIVERY_FLOW,
  SERVICE: SERVICE_FLOW,
};

export const TERMINAL_STATUSES: readonly S[] = [
  T.DELIVERED,
  T.COMPLETED,
  T.CANCELLED,
  T.REJECTED,
  T.PAYMENT_FAILED,
  T.DELIVERY_FAILED,
  T.RETURNED,
];
/** Terminal states that must restock inventory + refund (A15 §11). */
export const NEGATIVE_TERMINAL_STATUSES: readonly S[] = [
  T.CANCELLED,
  T.REJECTED,
  T.PAYMENT_FAILED,
  T.DELIVERY_FAILED,
];
export const SUCCESS_STATUSES: readonly S[] = [T.DELIVERED, T.COMPLETED];
/** Customer may self-cancel only before the shop starts working on it. */
export const CUSTOMER_CANCELLABLE: readonly S[] = [T.PENDING_PAYMENT, T.CONFIRMED];
/** Statuses a rider/technician may set — and only on their own active assignment. */
export const RIDER_SETTABLE: readonly S[] = [
  T.PICKED_UP,
  T.OUT_FOR_DELIVERY,
  T.DELIVERED,
  T.IN_PROGRESS,
  T.COMPLETED,
  T.DELIVERY_FAILED,
];
/** Active = not terminal. Used for socket room joins and "active orders" lists. */
export function isActiveStatus(s: S): boolean {
  return !TERMINAL_STATUSES.includes(s);
}

/**
 * Broadcast model (Option A): the states in which a DELIVERY order is up for grabs — it is
 * confirmed, nobody has taken it yet, and any on-duty rider may claim it. The three states cover
 * a shop that confirms and waits (CONFIRMED) and one that packs first (PREPARING / READY). Having
 * no active assignment is the other half of "claimable" and is checked against the DB by the
 * caller — this list is only the status gate.
 */
export const CLAIMABLE_STATUSES: readonly S[] = [T.CONFIRMED, T.PREPARING, T.READY_FOR_PICKUP];
export function isClaimableStatus(s: S): boolean {
  return CLAIMABLE_STATUSES.includes(s);
}

export function canTransition(type: OrderType, from: S, to: S): boolean {
  return ORDER_TRANSITIONS[type][from].includes(to);
}

/** Column in `orders` stamped when entering a status (A15 step 9). */
export const STATUS_TIMESTAMP_COLUMN: Partial<Record<S, string>> = {
  CONFIRMED: 'confirmed_at',
  PREPARING: 'preparing_at',
  READY_FOR_PICKUP: 'ready_at',
  ASSIGNED: 'assigned_at',
  PICKED_UP: 'picked_up_at',
  OUT_FOR_DELIVERY: 'out_for_delivery_at',
  DELIVERED: 'delivered_at',
  COMPLETED: 'completed_at',
  CANCELLED: 'cancelled_at',
  REJECTED: 'cancelled_at',
};

export const ORDER_STATUS_LABEL_HI: Record<S, string> = {
  PENDING_PAYMENT: 'भुगतान बाकी',
  CONFIRMED: 'ऑर्डर पक्का हुआ',
  PREPARING: 'सामान तैयार हो रहा है',
  READY_FOR_PICKUP: 'पिकअप के लिए तैयार',
  SCHEDULED: 'समय तय हुआ',
  ASSIGNED: 'डिलीवरी पार्टनर तय हुआ',
  PICKED_UP: 'सामान उठा लिया',
  OUT_FOR_DELIVERY: 'रास्ते में है',
  IN_PROGRESS: 'काम चल रहा है',
  DELIVERED: 'डिलीवर हो गया',
  COMPLETED: 'काम पूरा हुआ',
  CANCELLED: 'रद्द',
  REJECTED: 'मना कर दिया',
  PAYMENT_FAILED: 'भुगतान नहीं हुआ',
  DELIVERY_FAILED: 'डिलीवरी नहीं हो पाई',
  RETURNED: 'वापस आया',
};
export const ORDER_STATUS_LABEL_EN: Record<S, string> = {
  PENDING_PAYMENT: 'Payment pending',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready for pickup',
  SCHEDULED: 'Scheduled',
  ASSIGNED: 'Partner assigned',
  PICKED_UP: 'Picked up',
  OUT_FOR_DELIVERY: 'Out for delivery',
  IN_PROGRESS: 'In progress',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  PAYMENT_FAILED: 'Payment failed',
  DELIVERY_FAILED: 'Delivery failed',
  RETURNED: 'Returned',
};

/** Happy path shown in the customer timeline (order-timeline component). */
export const TIMELINE: Record<OrderType, readonly S[]> = {
  DELIVERY: [T.CONFIRMED, T.PREPARING, T.READY_FOR_PICKUP, T.ASSIGNED, T.PICKED_UP, T.OUT_FOR_DELIVERY, T.DELIVERED],
  SERVICE: [T.CONFIRMED, T.SCHEDULED, T.ASSIGNED, T.IN_PROGRESS, T.COMPLETED],
};

export type ActorKind = Role | 'SYSTEM';
export interface TransitionActor {
  kind: ActorKind;
  permissions: ReadonlySet<Permission> | readonly Permission[];
  /**
   * The owner's own account — the only one that moves an order to any state without a permission.
   *
   * ⚠️ Not the same as `kind === 'ADMIN'`. A second admin is a manager whose access the owner ticks
   * item by item, and `orders.cancel` is one of the ticks: cancelling restocks every line, credits
   * the customer's wallet and rolls the coupon back, which is why it is marked dangerous and
   * granted separately.
   */
  isGlobalAdmin?: boolean;
}

export type ActorDecision =
  | { allowed: true }
  | { allowed: false; reason: 'ROLE' | 'PERMISSION' };

function has(perms: TransitionActor['permissions'], p: Permission): boolean {
  return perms instanceof Set ? perms.has(p) : (perms as readonly Permission[]).includes(p);
}

/**
 * Role/permission layer of A15 step 3. Ownership (own order / own assignment) is a separate
 * check done by the caller with DB data — this function never sees resource ownership.
 */
export function actorMayTransition(actor: TransitionActor, from: S, to: S): ActorDecision {
  switch (actor.kind) {
    case 'SYSTEM':
      return { allowed: true };
    case 'ADMIN': {
      // The owner passes; a scoped admin is held to the same two permissions a supervisor is,
      // minus the supervisor's RETURNED ban — an admin the owner trusted with cancellations may
      // also take a delivered order back.
      if (actor.isGlobalAdmin) return { allowed: true };
      const needed: Permission = to === T.CANCELLED || to === T.REJECTED || to === T.RETURNED ? 'orders.cancel' : 'orders.update_status';
      return has(actor.permissions, needed) ? { allowed: true } : { allowed: false, reason: 'PERMISSION' };
    }
    case 'CUSTOMER':
      return to === T.CANCELLED && CUSTOMER_CANCELLABLE.includes(from)
        ? { allowed: true }
        : { allowed: false, reason: 'ROLE' };
    case 'DELIVERY_BOY':
      return RIDER_SETTABLE.includes(to) ? { allowed: true } : { allowed: false, reason: 'ROLE' };
    case 'SUPERVISOR': {
      if (to === T.RETURNED) return { allowed: false, reason: 'ROLE' };
      const needed: Permission = to === T.CANCELLED || to === T.REJECTED ? 'orders.cancel' : 'orders.update_status';
      return has(actor.permissions, needed) ? { allowed: true } : { allowed: false, reason: 'PERMISSION' };
    }
    default:
      return { allowed: false, reason: 'ROLE' };
  }
}
