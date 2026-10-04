/**
 * Single source for every enum that crosses the API boundary.
 * Values MUST match the ENUM columns in apps/api/src/database/migrations/001_init.sql —
 * a mismatch here becomes a compile error in web/mobile instead of a runtime bug.
 */

export const Role = {
  CUSTOMER: 'CUSTOMER',
  ADMIN: 'ADMIN',
  SUPERVISOR: 'SUPERVISOR',
  DELIVERY_BOY: 'DELIVERY_BOY',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ALL_ROLES: readonly Role[] = Object.values(Role);
/** Roles that can only be created through POST /admin/staff (never public registration). */
export const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.SUPERVISOR, Role.DELIVERY_BOY];

export const UserStatus = { ACTIVE: 'ACTIVE', DISABLED: 'DISABLED', DELETED: 'DELETED' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const OrderType = { DELIVERY: 'DELIVERY', SERVICE: 'SERVICE' } as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  SCHEDULED: 'SCHEDULED',
  ASSIGNED: 'ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  IN_PROGRESS: 'IN_PROGRESS',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  RETURNED: 'RETURNED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentMethod = { COD: 'COD', UPI: 'UPI', GATEWAY: 'GATEWAY', WALLET: 'WALLET' } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  AWAITING_VERIFICATION: 'AWAITING_VERIFICATION',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PrescriptionStatus = {
  NONE: 'NONE',
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type PrescriptionStatus = (typeof PrescriptionStatus)[keyof typeof PrescriptionStatus];

export const AssignmentStatus = {
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  PICKED_UP: 'PICKED_UP',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];
/** An order may have many assignment rows (re-assign after reject) but only ONE in these states. */
export const ACTIVE_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = ['OFFERED', 'ACCEPTED', 'PICKED_UP'];

export const JobType = { DELIVERY: 'DELIVERY', SERVICE_VISIT: 'SERVICE_VISIT' } as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const Vertical = {
  VEGETABLES: 'VEGETABLES',
  FRUITS: 'FRUITS',
  GROCERY: 'GROCERY',
  PHARMACY: 'PHARMACY',
  AGRI_INPUT: 'AGRI_INPUT',
  SERVICE: 'SERVICE',
} as const;
export type Vertical = (typeof Vertical)[keyof typeof Vertical];
export const ALL_VERTICALS: readonly Vertical[] = Object.values(Vertical);

/** Hindi URL slug per vertical (SEO: /sabzi /phal /kirana /dawai /kheti /sewa). */
export const VERTICAL_SLUG: Record<Vertical, string> = {
  VEGETABLES: 'sabzi',
  FRUITS: 'phal',
  GROCERY: 'kirana',
  PHARMACY: 'dawai',
  AGRI_INPUT: 'kheti',
  SERVICE: 'sewa',
};
export const VERTICAL_LABEL_HI: Record<Vertical, string> = {
  VEGETABLES: 'सब्ज़ी',
  FRUITS: 'फल',
  GROCERY: 'किराना',
  PHARMACY: 'दवाई',
  AGRI_INPUT: 'खेती',
  SERVICE: 'सेवा',
};
export const VERTICAL_LABEL_EN: Record<Vertical, string> = {
  VEGETABLES: 'Vegetables',
  FRUITS: 'Fruits',
  GROCERY: 'Grocery',
  PHARMACY: 'Medicines',
  AGRI_INPUT: 'Farming',
  SERVICE: 'Services',
};
/** settings key that switches each vertical on/off (Compliance kill-switch) — schema.sql casing. */
export const VERTICAL_SETTING_KEY: Record<Vertical, string> = {
  VEGETABLES: 'vertical_VEGETABLES_enabled',
  FRUITS: 'vertical_FRUITS_enabled',
  GROCERY: 'vertical_GROCERY_enabled',
  PHARMACY: 'vertical_PHARMACY_enabled',
  AGRI_INPUT: 'vertical_AGRI_INPUT_enabled',
  SERVICE: 'vertical_SERVICE_enabled',
};
/**
 * categories.vertical also allows 'OTHER' (schema.sql) — general merchandise (clothes, footwear,
 * electricals, building material, farm tools). It has NO kill-switch: it is always on, because
 * nothing in it needs a licence. Only the six verticals above are licence-gated.
 */
export type CategoryVertical = Vertical | 'OTHER';
export const CATEGORY_VERTICALS: readonly CategoryVertical[] = [...ALL_VERTICALS, 'OTHER'];

export function verticalFromSlug(slug: string): Vertical | null {
  const hit = (Object.keys(VERTICAL_SLUG) as Vertical[]).find((v) => VERTICAL_SLUG[v] === slug);
  return hit ?? null;
}

export const ItemType = { PRODUCT: 'PRODUCT', SERVICE: 'SERVICE' } as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export const ZoneMode = { RADIUS: 'RADIUS', POLYGON: 'POLYGON' } as const;
export type ZoneMode = (typeof ZoneMode)[keyof typeof ZoneMode];

export const CheckMethod = {
  VILLAGE: 'VILLAGE',
  POLYGON: 'POLYGON',
  RADIUS: 'RADIUS',
  MANUAL: 'MANUAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type CheckMethod = (typeof CheckMethod)[keyof typeof CheckMethod];

export const WalletTxnSource = {
  ORDER_PAYMENT: 'ORDER_PAYMENT',
  ORDER_REFUND: 'ORDER_REFUND',
  REFERRAL_REWARD: 'REFERRAL_REWARD',
  CASHBACK: 'CASHBACK',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
  RIDER_EARNING: 'RIDER_EARNING',
  PAYOUT: 'PAYOUT',
} as const;
export type WalletTxnSource = (typeof WalletTxnSource)[keyof typeof WalletTxnSource];

export const OtpPurpose = { LOGIN: 'LOGIN', REGISTER: 'REGISTER', STAFF_LOGIN: 'STAFF_LOGIN', PHONE_CHANGE: 'PHONE_CHANGE' } as const;
export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

export const Platform = { WEB: 'WEB', ANDROID: 'ANDROID', IOS: 'IOS' } as const;
export type Platform = (typeof Platform)[keyof typeof Platform];

export const CouponType = { FLAT: 'FLAT', PERCENT: 'PERCENT' } as const;
export type CouponType = (typeof CouponType)[keyof typeof CouponType];
/** schema.sql: coupons.applies_to — PRODUCT = delivery orders, SERVICE = service bookings. */
export const CouponAppliesTo = { ALL: 'ALL', PRODUCT: 'PRODUCT', SERVICE: 'SERVICE' } as const;
export type CouponAppliesTo = (typeof CouponAppliesTo)[keyof typeof CouponAppliesTo];

export const ReviewTarget = { PRODUCT: 'PRODUCT', RIDER: 'RIDER', ORDER: 'ORDER' } as const;
export type ReviewTarget = (typeof ReviewTarget)[keyof typeof ReviewTarget];

export const NotificationChannel = { IN_APP: 'IN_APP', PUSH: 'PUSH', SMS: 'SMS' } as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

/** Post-login landing page per role (UX only — real security is backend guards). */
export const ROLE_HOME: Record<Role, string> = {
  CUSTOMER: '/mera',
  ADMIN: '/admin',
  SUPERVISOR: '/supervisor',
  DELIVERY_BOY: '/delivery',
};

export const AliasType = { SPELLING: 'SPELLING', HAMLET: 'HAMLET', LANDMARK: 'LANDMARK', OLD_NAME: 'OLD_NAME' } as const;
export type AliasType = (typeof AliasType)[keyof typeof AliasType];

export const AreaRequestSource = { CHECKOUT: 'CHECKOUT', ADDRESS: 'ADDRESS', HOMEPAGE: 'HOMEPAGE', APP: 'APP' } as const;
export type AreaRequestSource = (typeof AreaRequestSource)[keyof typeof AreaRequestSource];
export const AreaRequestStatus = { NEW: 'NEW', NOTED: 'NOTED', CONTACTED: 'CONTACTED', NOW_SERVED: 'NOW_SERVED' } as const;
export type AreaRequestStatus = (typeof AreaRequestStatus)[keyof typeof AreaRequestStatus];

/** DB enum for wallet_transactions.source (schema.sql). */
export const WALLET_SOURCES = ['ORDER_PAYMENT', 'ORDER_REFUND', 'REFERRAL_REWARD', 'CASHBACK', 'ADMIN_ADJUSTMENT', 'RIDER_EARNING', 'PAYOUT'] as const;

/**
 * How the delivery point of an address was fixed (owner rule: location is compulsory, one of three):
 *  GPS       — customer was AT the address and shared the phone's location
 *  MAP_PIN   — customer was elsewhere and dropped a pin on the map
 *  DESCRIBED — no map possible; the route is written out in `directions`
 */
export const LocationMethod = { GPS: 'GPS', MAP_PIN: 'MAP_PIN', DESCRIBED: 'DESCRIBED' } as const;
export type LocationMethod = (typeof LocationMethod)[keyof typeof LocationMethod];
