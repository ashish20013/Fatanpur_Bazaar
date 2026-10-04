import type {
  AssignmentStatus,
  CategoryVertical,
  CheckMethod,
  LocationMethod,
  ItemType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  PrescriptionStatus,
  Role,
  Vertical,
} from './enums';
import type { ErrorCode } from './errors';
import type { Permission } from './permissions';

/** Money travels as a 2-decimal string ("25.00") — never a JS float (BUILD_PROMPT §6). */
export type MoneyString = string;

// ───────────────────────── Envelope ─────────────────────────
export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  hasMore: boolean;
}
export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: PageMeta;
}
export interface ApiErrorBody {
  code: ErrorCode;
  /** Hindi — safe to show customers directly. */
  message: string;
  /** English twin — staff panels (English-only) show this one. */
  messageEn?: string;
  field?: string;
  ref?: string;
  data?: Record<string, unknown>;
}
export interface ApiFailure {
  ok: false;
  error: ApiErrorBody;
}
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ───────────────────────── Auth ─────────────────────────
export interface OtpSendRequest {
  phone: string;
  purpose?: 'LOGIN' | 'STAFF_LOGIN';
}
export interface OtpSendResponse {
  sent: true;
  expiresIn: number;
  resendAfter: number;
}
/** ⚠️ No `role` field — public registration is CUSTOMER only (matrix §0). */
export interface OtpVerifyRequest {
  phone: string;
  otp: string;
  name?: string;
  referralCode?: string;
  deviceId?: string;
  platform?: 'WEB' | 'ANDROID' | 'IOS';
}
export interface AuthUser {
  id: number;
  name: string | null;
  phone: string;
  role: Role;
}
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  expiresIn: number;
  /** Mobile only — web receives it as an httpOnly cookie instead. */
  refreshToken?: string;
  redirect: string;
  isNewUser: boolean;
}
export interface MeResponse extends AuthUser {
  permissions: Permission[];
  referralCode: string | null;
  phoneVerified: boolean;
  /**
   * The owner's own account. True for exactly one person.
   *
   * The panel uses it to decide what to show — a second admin should not be offered an "Appoint an
   * admin" button whose save the API is going to refuse. ⚠️ Showing a button is not access: every
   * one of those actions is checked again on the server, where the decision actually lives.
   */
  isGlobalAdmin: boolean;
}

// ───────────────────────── Catalog ─────────────────────────
export interface ProductCard {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  itemType: ItemType;
  unit: string;
  unitValue: string;
  price: MoneyString;
  mrp: MoneyString;
  discountPercent: number;
  inStock: boolean;
  prescriptionRequired: boolean;
  image: ProductImage | null;
  supplierName: string | null;
  /**
   * Hindi one-liner from the supplier ("शर्मा मेडिकल स्टोर से — हम सिर्फ़ पहुँचाने का काम करते हैं").
   * For a licensed good the shop is only the delivery partner, and the customer must see that.
   * Hidden together with `supplierName` when the supplier is not shown on the product.
   */
  supplierNote: string | null;
  rating: { avg: string; count: number };
  /** Icon key of the product's category (falls back to the root category's). */
  icon: string | null;
  /** Slug of the ROOT category — decides the tile colour family on the web. */
  family: string | null;
}
export interface ProductImage {
  url: string;
  urlSm: string;
  width: number;
  height: number;
  alt: string;
}
export interface ProductDetail extends ProductCard {
  description: string | null;
  descriptionHi: string | null;
  stockQty: number;
  maxQtyPerOrder: number;
  isWeighted: boolean;
  brand: string | null;
  images: ProductImage[];
  category: { id: number; name: string; nameHi: string | null; slug: string; vertical: CategoryVertical };
  /** Root (top-level) category, when the product sits in a sub-category. */
  root: { name: string; nameHi: string | null; slug: string } | null;
  supplier: { name: string; village: string | null } | null;
  visitingCharge: MoneyString;
  /** How a SERVICE is carried out — shown above the booking button. Null for goods. */
  serviceNote: string | null;
  serviceDurationMin: number | null;
  isQuoteBased: boolean;
  related: ProductCard[];
  seo: { title: string; description: string; canonical: string };
}
export interface CategoryNode {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  vertical: CategoryVertical;
  itemType: ItemType;
  image: string | null;
  icon: string | null;
  productCount: number;
  children: CategoryNode[];
}
/**
 * A top-level category as the home rail shows it. `upcoming` = its vertical is switched off
 * (licence pending): the rail may show it as "जल्द आ रहा है" but it has no link, no products,
 * and it stays out of search, sitemap and JSON-LD (Compliance kill-switch still rules).
 */
export interface RootCategory {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  /**
   * The shopkeeper's own photograph for this category, as the 200 px thumbnail — the only size
   * anything actually draws it at. Null until he uploads one, and then the drawing is used.
   */
  image: string | null;
  icon: string | null;
  vertical: CategoryVertical;
  itemType: ItemType;
  productCount: number;
  upcoming: boolean;
}
/** One block of the home page: a root category and its first items, A→Z. */
export interface HomeSection {
  category: RootCategory;
  items: ProductCard[];
  total: number;
}
/** One slide of the advertising strip above the goods (a 320×50 unit, 6.4:1). */
export interface HomeBanner {
  id: number;
  title: string;
  imageUrl: string;
  imageUrlSm: string | null;
  linkUrl: string | null;
  /** Declared so the slot can reserve its height before the picture lands — no layout shift. */
  width: number;
  height: number;
}
export interface HomeResponse {
  banners: HomeBanner[];
  verticals: { vertical: Vertical; slug: string; labelHi: string; labelEn: string }[];
  featured: ProductCard[];
  popular: ProductCard[];
  categories: CategoryNode[];
  /** Top-level categories in the owner's order (rail + section order). */
  roots: RootCategory[];
  sections: HomeSection[];
}
export interface SearchResponse {
  query: string;
  items: ProductCard[];
  suggestions: ProductCard[];
  total: number;
}

// ───────────────────────── Service area ─────────────────────────
export interface VillageOption {
  id: number;
  name: string;
  nameHi: string | null;
  slug: string;
  distanceKm: number | null;
  etaMinutes: number;
  deliveryFee: MoneyString;
  isPopular: boolean;
  aliases: string[];
  lat: number | null;
  lng: number | null;
}
export interface ServiceabilityRequest {
  villageId?: number;
  lat?: number;
  lng?: number;
  accuracyM?: number;
}
export interface ServiceabilityResult {
  serviceable: boolean;
  method: CheckMethod;
  zoneId: number | null;
  /** Machine reason, e.g. VILLAGE_ACTIVE, VILLAGE_INACTIVE, GPS_INSIDE, GPS_OUTSIDE, GPS_UNRELIABLE */
  reason: string;
  /** true → UI must show the village picker (bad/no GPS). Never a block. */
  needsVillagePick: boolean;
  /** true → served via GPS for a village not on our list: admin should review ("new area"). */
  flagNewArea: boolean;
  distanceKm: number | null;
  etaMinutes: number;
  deliveryFee: MoneyString;
  minOrder: MoneyString;
  servedAreas: string[];
  nearestServedKm: number | null;
}

// ───────────────────────── Address ─────────────────────────
/** Rural address details the rider actually needs (migration 003 · address_extras). */
export interface AddressExtras {
  /** Father / husband / guardian — in a village "Ramlal ke bete" finds the house. */
  guardianName: string | null;
  altPhone: string | null;
  district: string | null;
  pincode: string | null;
  /** How to reach: road, direction, whose house is next door. */
  directions: string | null;
  /** Anything else for the delivery partner ("call before coming", "dog at gate"). */
  deliveryNote: string | null;
  locationMethod: LocationMethod | null;
  /** Where the phone actually was when the address was saved (migration 005). */
  originLat: number | null;
  originLng: number | null;
  originAccuracyM: number | null;
  /** true = the customer was standing at the delivery point; false = ordering from elsewhere. */
  orderedFromHere: boolean | null;
}
export interface AddressView extends AddressExtras {
  id: number;
  label: string;
  receiverName: string;
  phone: string;
  line1: string;
  landmark: string | null;
  villageId: number | null;
  villageName: string | null;
  villageNameHi: string | null;
  areaText: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  isServiceable: boolean;
  isDefault: boolean;
  /** Google Maps link of the saved pin (null when the route is only described). */
  mapsUrl: string | null;
}

// ───────────────────────── Cart / quote / order ─────────────────────────
export type CartWarningCode = 'PRICE_CHANGED' | 'STOCK_LOW' | 'UNAVAILABLE' | 'VERTICAL_OFF';
export interface CartItemView {
  id: number;
  productId: number;
  name: string;
  nameHi: string | null;
  slug: string;
  unit: string;
  image: string | null;
  price: MoneyString;
  quantity: number;
  lineTotal: MoneyString;
  itemType: ItemType;
  slotDate: string | null;
  slotStart: string | null;
  issues: CartWarningCode[];
  icon?: string | null;
  family?: string | null;
  maxQty?: number;
}
export interface CartView {
  items: CartItemView[];
  itemsTotal: MoneyString;
  itemCount: number;
  needsPrescription: boolean;
  warnings: { code: CartWarningCode; productId: number; message: string }[];
}
export interface QuoteRequest {
  addressId: number;
  items: { productId: number; quantity: number }[];
  couponCode?: string;
  useWallet?: boolean;
  paymentMethod: PaymentMethod;
  orderType?: OrderType;
}
export interface QuoteLine {
  label: string;
  amount: MoneyString;
}
export interface QuoteResponse {
  itemsTotal: MoneyString;
  deliveryFee: MoneyString;
  visitingCharge: MoneyString;
  discount: MoneyString;
  walletUsed: MoneyString;
  grandTotal: MoneyString;
  needsPrescription: boolean;
  etaMinutes: number;
  breakdown: QuoteLine[];
  warnings: string[];
}
export interface PlaceOrderRequest extends QuoteRequest {
  prescriptionId?: number;
  note?: string;
  slot?: { date: string; start: string };
}
export interface UpiDetails {
  vpa: string;
  payeeName: string;
  amount: MoneyString;
  intentUrl: string;
  qrUrl: string;
  instructions: string;
}
export interface PlaceOrderResponse {
  orderNumber: string;
  status: OrderStatus;
  grandTotal: MoneyString;
  paymentMethod: PaymentMethod;
  upi: UpiDetails | null;
  etaMinutes: number;
  redirect: string;
}
export interface OrderItemView {
  id: number;
  productId: number | null;
  name: string;
  nameHi: string | null;
  supplierName: string | null;
  image: string | null;
  unit: string;
  unitPrice: MoneyString;
  quantity: string;
  finalQuantity: string | null;
  lineTotal: MoneyString;
  finalLineTotal: MoneyString | null;
  isRemoved: boolean;
  itemType: ItemType;
}
export interface OrderSummary {
  orderNumber: string;
  status: OrderStatus;
  statusLabelHi: string;
  orderType: OrderType;
  grandTotal: MoneyString;
  /** What is actually payable now: final_grand_total ?? grand_total (A16). */
  payable: MoneyString;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  itemCount: number;
  placedAt: string;
  village: string | null;
}
export interface OrderDetail extends OrderSummary {
  items: OrderItemView[];
  itemsTotal: MoneyString;
  deliveryFee: MoneyString;
  visitingCharge: MoneyString;
  discount: MoneyString;
  walletUsed: MoneyString;
  finalItemsTotal: MoneyString | null;
  finalGrandTotal: MoneyString | null;
  adjustmentNote: string | null;
  prescriptionStatus: PrescriptionStatus;
  etaMinutes: number | null;
  ship: { name: string; phone: string; line1: string; landmark: string | null; village: string | null; lat: number | null; lng: number | null; mapsUrl: string | null } & AddressExtras;
  timeline: { status: OrderStatus; labelHi: string; at: string }[];
  rider: { name: string | null; phone: string } | null;
  /** Shown to the customer only, never to ops rooms. */
  deliveryOtp: string | null;
  canCancel: boolean;
  canReview: boolean;
  upi: UpiDetails | null;
  service: { date: string; slotStart: string; slotEnd: string; completionOtp: string | null } | null;
  /** When the delivery clock starts (confirmed_at, else placed_at) — drives the 30+30 min timer. */
  clockStartAt: string;
  deliveredAt: string | null;
  /** Server time at response — phones in villages often have a wrong clock; the timer uses the offset. */
  serverNow: string;
}

// ───────────────────────── Tracking ─────────────────────────
export interface TrackingSnapshot {
  orderNumber: string;
  status: OrderStatus;
  labelHi: string;
  isLive: boolean;
  isStale: boolean;
  lat: number | null;
  lng: number | null;
  lastPingAt: string | null;
  rider: { name: string | null; phone: string } | null;
  etaMinutes: number | null;
  destination: { lat: number | null; lng: number | null };
}
export interface LocationPing {
  assignmentId: number;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  ts: number;
}
export interface ServerToClientEvents {
  'tracking.snapshot': (s: TrackingSnapshot) => void;
  'order.status.updated': (e: { orderNumber: string; status: OrderStatus; labelHi: string; at: string }) => void;
  'delivery.assigned': (e: { orderNumber: string; rider: { name: string | null; phone: string }; otp?: string }) => void;
  'delivery.started': (e: { orderNumber: string; at: string }) => void;
  'delivery.location.updated': (e: { orderNumber: string; lat: number; lng: number; at: string; isStale: boolean; weakSignal?: boolean }) => void;
  'delivery.completed': (e: { orderNumber: string; at: string; reason?: string }) => void;
  'order.cancelled': (e: { orderNumber: string; reason: string }) => void;
  'ops.order.new': (e: { orderNumber: string; total: MoneyString; village: string | null }) => void;
  /** Broadcast model: a new order dropped into the rider pool — every on-duty rider's dashboard lights up. */
  'pool.order.new': (e: { orderNumber: string; village: string | null; collectAmount: MoneyString; itemCount: number; etaMinutes: number; distanceKm: number | null }) => void;
  /** A pool order was taken (claimed, assigned, or no longer claimable) — remove it from every rider's list. */
  'pool.order.gone': (e: { orderNumber: string; by: string | null }) => void;
  'notification.new': (e: { id: number; title: string; body: string; linkUrl: string | null }) => void;
}
export interface ClientToServerEvents {
  'delivery.location': (p: LocationPing) => void;
  'client.ping': () => void;
}

// ───────────────────────── Delivery (rider) ─────────────────────────
export interface AssignmentView {
  id: number;
  orderNumber: string;
  status: AssignmentStatus;
  jobType: 'DELIVERY' | 'SERVICE_VISIT';
  orderStatus: OrderStatus;
  earning: MoneyString;
  /** COD amount to collect = final_grand_total ?? grand_total, 0 for prepaid. */
  collectAmount: MoneyString;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customer: { name: string; phone: string; line1: string; landmark: string | null; village: string | null; lat: number | null; lng: number | null; mapsUrl: string | null } & AddressExtras;
  items: { name: string; quantity: string; unit: string }[];
  offeredAt: string;
}

/**
 * One order waiting in the rider pool (broadcast model). Shown on every on-duty rider's dashboard
 * and claimed with POST /delivery/claim/:orderNumber — whoever taps first wins the race (the API
 * enforces one active assignment per order). Deliberately light: no customer phone or exact pin
 * until a rider has actually claimed it (then it arrives in AssignmentView).
 */
export interface AvailableOrder {
  orderNumber: string;
  village: string | null;
  distanceKm: number | null;
  /** Amount the rider collects on COD (final_grand_total ?? grand_total); 0 when already prepaid. */
  collectAmount: MoneyString;
  paymentMethod: PaymentMethod;
  itemCount: number;
  etaMinutes: number;
  earning: MoneyString;
  /** Seconds since the order was placed — the UI shows "2 मिनट पहले" and reddens an old one. */
  waitingSec: number;
  placedAt: string;
}

// ───────────────────────── Admin sales report ─────────────────────────
/**
 * `/admin/reports/sales`. Shared so a rename on the API side breaks the build instead of the
 * page: the key `zeroSearch` was once `zeroResultSearches` on the server only, and the report
 * screen died at request time with "Cannot read properties of undefined".
 */
export interface SalesReport {
  byDay: { stat_date: string; orders: number; gmv: MoneyString }[];
  topProducts: { productId: number; name: string; nameHi: string | null; qty: number; revenue: MoneyString }[];
  byPayment: { method: PaymentMethod; orders: number; amount: MoneyString }[];
  /** Searches that found nothing — the owner's next stock list (A10 §6). */
  zeroSearch: { query: string; times: number }[];
}
