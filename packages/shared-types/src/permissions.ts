import { Role } from './enums';

/**
 * Permission catalogue — ROLE_PERMISSION_MATRIX.md §2 (31) + 3 service-area permissions
 * (DATABASE_AUDIT: 34) + `staff.manage_riders` (migration 003: a supervisor may add/disable
 * delivery partners — owner's rule "admin gives the supervisor access, the supervisor gives the
 * delivery boy access"). Must stay in sync with the `permissions` seed in the SQL migrations
 * (a unit test checks this).
 */
export const PERMISSIONS = [
  { code: 'orders.view', group: 'orders', dangerous: false, labelHi: 'ऑर्डर देखना', labelEn: 'View orders' },
  { code: 'orders.view_all', group: 'orders', dangerous: false, labelHi: 'सभी ग्राहकों के ऑर्डर देखना', labelEn: 'View all customers’ orders' },
  { code: 'orders.update_status', group: 'orders', dangerous: false, labelHi: 'ऑर्डर का स्टेटस बदलना', labelEn: 'Change order status' },
  { code: 'orders.cancel', group: 'orders', dangerous: true, labelHi: 'ऑर्डर रद्द करना', labelEn: 'Cancel orders' },
  { code: 'orders.adjust', group: 'orders', dangerous: true, labelHi: 'ऑर्डर में मात्रा/आइटम बदलना', labelEn: 'Adjust order items / weight' },
  { code: 'delivery.assign', group: 'delivery', dangerous: false, labelHi: 'डिलीवरी पार्टनर तय करना', labelEn: 'Assign delivery partner' },
  { code: 'delivery.reassign', group: 'delivery', dangerous: false, labelHi: 'डिलीवरी दोबारा तय करना', labelEn: 'Re-assign delivery' },
  { code: 'delivery.track', group: 'delivery', dangerous: false, labelHi: 'लाइव ट्रैकिंग देखना', labelEn: 'See live tracking' },
  { code: 'delivery.settle_cod', group: 'delivery', dangerous: true, labelHi: 'COD नकद जमा लेना', labelEn: 'Receive COD cash from riders' },
  { code: 'products.view', group: 'catalog', dangerous: false, labelHi: 'सामान देखना', labelEn: 'View products' },
  { code: 'products.manage', group: 'catalog', dangerous: true, labelHi: 'सामान जोड़ना/बदलना', labelEn: 'Add / edit / remove products' },
  { code: 'products.price_change', group: 'catalog', dangerous: true, labelHi: 'दाम बदलना', labelEn: 'Change prices' },
  { code: 'categories.manage', group: 'catalog', dangerous: true, labelHi: 'श्रेणियाँ', labelEn: 'Manage categories' },
  { code: 'suppliers.manage', group: 'catalog', dangerous: true, labelHi: 'सप्लायर', labelEn: 'Manage suppliers' },
  { code: 'inventory.view', group: 'inventory', dangerous: false, labelHi: 'स्टॉक देखना', labelEn: 'View stock' },
  { code: 'inventory.manage', group: 'inventory', dangerous: true, labelHi: 'स्टॉक बदलना', labelEn: 'Change stock' },
  { code: 'customers.view', group: 'customers', dangerous: false, labelHi: 'ग्राहक सूची', labelEn: 'View customers' },
  { code: 'customers.manage', group: 'customers', dangerous: true, labelHi: 'ग्राहक बंद/बदलना', labelEn: 'Disable / enable customers' },
  { code: 'staff.view', group: 'staff', dangerous: false, labelHi: 'स्टाफ सूची', labelEn: 'View staff' },
  { code: 'staff.create', group: 'staff', dangerous: true, labelHi: 'नया स्टाफ बनाना', labelEn: 'Create any staff account' },
  { code: 'staff.manage', group: 'staff', dangerous: true, labelHi: 'स्टाफ चालू/बंद', labelEn: 'Enable / disable any staff' },
  { code: 'staff.manage_riders', group: 'staff', dangerous: true, labelHi: 'डिलीवरी पार्टनर जोड़ना/बंद करना', labelEn: 'Add / disable delivery partners only' },
  { code: 'permissions.manage', group: 'staff', dangerous: true, labelHi: 'अनुमति देना/लेना', labelEn: 'Grant / revoke permissions' },
  { code: 'payments.view', group: 'payments', dangerous: false, labelHi: 'भुगतान देखना', labelEn: 'View payments' },
  { code: 'payments.verify', group: 'payments', dangerous: true, labelHi: 'UPI भुगतान जाँचना', labelEn: 'Verify UPI payments' },
  { code: 'payments.refund', group: 'payments', dangerous: true, labelHi: 'रिफंड', labelEn: 'Issue refunds' },
  { code: 'coupons.manage', group: 'marketing', dangerous: true, labelHi: 'कूपन', labelEn: 'Manage coupons' },
  { code: 'prescriptions.review', group: 'pharmacy', dangerous: true, labelHi: 'पर्ची जाँचना', labelEn: 'Review prescriptions' },
  { code: 'content.manage', group: 'content', dangerous: false, labelHi: 'ब्लॉग/पेज/FAQ', labelEn: 'Blog, pages & FAQ' },
  { code: 'reports.view', group: 'reports', dangerous: false, labelHi: 'रिपोर्ट', labelEn: 'Reports & analytics' },
  { code: 'audit.view', group: 'system', dangerous: false, labelHi: 'ऑडिट लॉग', labelEn: 'Security / activity log' },
  { code: 'settings.manage', group: 'system', dangerous: true, labelHi: 'सेटिंग्स', labelEn: 'Global settings' },
  { code: 'villages.manage', group: 'service_area', dangerous: false, labelHi: 'गाँव प्रबंधन', labelEn: 'Manage villages' },
  { code: 'service_area.view', group: 'service_area', dangerous: false, labelHi: 'क्षेत्र अनुरोध देखना', labelEn: 'View area requests' },
  { code: 'service_area.manage', group: 'service_area', dangerous: true, labelHi: 'डिलीवरी दायरा बदलना', labelEn: 'Change delivery boundary' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['code'];
export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS.map((p) => p.code);

/**
 * Permissions that can NEVER leave the ADMIN role, even via user_permissions grant —
 * holding either lets a user raise their own privileges (matrix §3, decision 3).
 */
export const ADMIN_ONLY_PERMISSIONS: readonly Permission[] = ['permissions.manage', 'settings.manage'];

/**
 * GLOBAL ADMIN — the owner's own account, and the only account that is not itself governed.
 *
 * Until now "ADMIN" meant "everything", so a second admin was a second owner: he could change the
 * UPI number money lands in, disable the first admin, and grant himself anything. The shop has one
 * owner and now needs a manager, which is a different thing.
 *
 * So the ADMIN role opens the admin panel, and the GLOBAL admin decides what is inside it. A
 * scoped admin starts with NOTHING and holds exactly the permissions the global admin has granted
 * — which is why `role_permissions` (where ADMIN is seeded with every code) is deliberately NOT
 * consulted for the ADMIN role any more. The global admin may grant every code including these
 * two, so "he can give full access if he wants" still holds; what a scoped admin can never do is
 * touch another admin account or make himself global. Those are checked separately in StaffService.
 *
 * There is exactly one global admin, set from the server (migration + `global_admin_phone`), never
 * from the web. A web form that can mint an owner is not a safety rail.
 */
export const GLOBAL_ADMIN_ONLY_ACTIONS = ['create or change an admin', 'grant permissions to an admin', 'disable an admin'] as const;

/**
 * A sensible starting grant for a second admin: run the shop day to day, touch nothing that
 * decides where money goes or who has access. The global admin changes this per person in
 * Admin → Staff → Permissions; it is a starting point, not a ceiling.
 */
export const SCOPED_ADMIN_DEFAULT_PERMISSIONS: readonly Permission[] = [
  'orders.view',
  'orders.view_all',
  'orders.update_status',
  'orders.cancel',
  'orders.adjust',
  'delivery.assign',
  'delivery.reassign',
  'delivery.track',
  'products.view',
  'products.manage',
  'categories.manage',
  'suppliers.manage',
  'inventory.view',
  'inventory.manage',
  'customers.view',
  'staff.view',
  'payments.view',
  'coupons.manage',
  'content.manage',
  'reports.view',
  'villages.manage',
  'service_area.view',
];

/**
 * What an actor holding only `staff.manage_riders` (a supervisor) may hand to a DELIVERY_BOY.
 * Deliberately tiny: a rider's real access is ownership-scoped (own assignments), so the only extra
 * a supervisor can switch on is the live-tracking board. Nothing money- or staff-related.
 */
export const RIDER_GRANTABLE_PERMISSIONS: readonly Permission[] = ['delivery.track'];

/** Default role → permission rows (matrix §3 ✅ column). ADMIN bypasses and gets everything. */
export const ROLE_DEFAULT_PERMISSIONS: Record<Exclude<Role, 'ADMIN' | 'CUSTOMER'>, readonly Permission[]> = {
  SUPERVISOR: [
    'orders.view',
    'orders.view_all',
    'orders.update_status',
    'orders.cancel',
    'orders.adjust',
    'delivery.assign',
    'delivery.reassign',
    'delivery.track',
    'products.view',
    'inventory.view',
    'inventory.manage',
    'customers.view',
    'staff.view',
    'staff.manage_riders',
    'payments.view',
    'reports.view',
    'villages.manage',
    'service_area.view',
  ],
  // Rider's order access is ownership-scoped (own assignments) — the permission only opens the door.
  DELIVERY_BOY: ['orders.view'],
};

export function isPermission(code: string): code is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(code);
}

export function permissionLabel(code: string, lang: 'hi' | 'en' = 'en'): string {
  const p = PERMISSIONS.find((x) => x.code === code);
  if (!p) return code;
  return lang === 'hi' ? p.labelHi : p.labelEn;
}
