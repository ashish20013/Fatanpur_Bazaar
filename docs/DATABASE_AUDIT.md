# DATABASE_AUDIT.md
**Fatanpur Bazaar** · schema v2 (PHP marketplace) → **v3 (NestJS single-store + services)**
8 September 2026 · Status: **v3 MariaDB 10.11 pe chala kar verify ho chuka**

> Instruction §13: *"Audit the existing schema before changing it. Do NOT blindly discard the existing schema. If existing schema.sql contains tested logic, preserve valid parts. Fix incorrect parts."*

---

## 0. Nateeja (ek nazar me)

| | v2 | v3 |
|---|---|---|
| Tables | 50 | **57** |
| Foreign keys | 53 | **54** |
| Seed settings | 45 | **57** |
| Permissions | — | **34** |
| Roles | 6 (CUSTOMER, SHOPKEEPER, RIDER, PHARMACIST, DOCTOR, ADMIN) | **4** (CUSTOMER, ADMIN, SUPERVISOR, DELIVERY_BOY) |
| Model | Marketplace (dukaanein bechti hain) | **Single store + services** |

**Reuse: 41 tables (82%) jaisi ki taisi ya chhote badlav ke saath rakhi gayi.**
**Drop: 5 tables. Add: 12 tables. Modify: 10 tables.**

Verification chala:
```
tables_created  57
foreign_keys    54
permissions     34   (ADMIN 34 / SUPERVISOR 17 / DELIVERY_BOY 1)
settings        57
service_zones    1   (Fatanpur, RADIUS, 6.00 km)

Village picker bhi live DB pe test kiya:
  picker order (popular → order_count → distance)       ✅
  inactive gaon picker me nahi aata                      ✅
  alias search: "rani" / "रानी" / "Rani Ganj" → रानीगंज  ✅
  hamlet alias: "Rampur Purwa" → रामपुर                  ✅
  GPS se nearest 3                                       ✅
```

---

## 1. Table-by-table faisla

### 1.1 ✅ RAKHI (bina badlav — v2 me tested logic thi)

| Table | Kyun rakhi |
|---|---|
| `schema_migrations` | Migration tracking |
| `cron_state` | v2 ka accha faisla: cron ka last-run settings me rakhne se har 5 min page cache flush hota tha |
| `jobs` | Redis ke bina queue. NestJS `@Cron` isse drain karega |
| `rate_limits` | OTP/API throttle, DB-based (Redis nahi) |
| `analytics_daily` | Nightly rollup — admin dashboard fast rehta hai |
| `otp_requests` | Hashed OTP + attempts + expiry — logic sahi thi |
| `villages` | 6 km service area + SEO landing pages |
| `addresses` | Address book + serviceability flag |
| `categories` | Tree + SEO fields |
| `product_images` | Pre-resized WebP, width/height (CLS ke liye) |
| `search_synonyms` | `alu → aloo potato आलू` — MariaDB pe test kiya tha, chalta hai |
| `search_logs` | Zero-result searches = agla stock kya rakhna hai |
| `banners` | Homepage promos |
| `wallets`, `wallet_transactions` | Append-only ledger + balance_after |
| `coupons`, `coupon_usages` | v2 ki validation logic poori theek thi |
| `referrals` | + anti-abuse fields (signup_ip, is_flagged) |
| `order_idempotency` | Double-tap protection — INSERT-first pattern |
| `inventory_logs` | Stock ka poora trail |
| `delivery_locations` | Sparse breadcrumb trail |
| `cod_settlements` | Rider ka cash kahan gaya |
| `prescriptions` | + `purged_at` (retention) |
| `pages`, `faqs`, `blog_*`, `contact_messages` | Content/SEO |
| `notifications` | + `dedupe_key` (instruction §29: duplicate notification mat bhejo) |
| `audit_logs` | + `before_json`/`after_json` (instruction §31) |
| `settings` | + `is_public` flag |

### 1.2 ❌ HATAYI (5 tables) — model badal gaya

| Table | Kyun hatayi | Data kahan gaya |
|---|---|---|
| `shops` | Ab single store hai — dukaandaar ka koi dashboard nahi | Zaroori hissa → **naya `suppliers` table** (sirf naam dikhane + purchase tracking ke liye) |
| `shop_timings` | Ek hi store hai | `settings.store_open_time / store_close_time` |
| `shop_payouts` | Koi commission/payout nahi — maal aapka hai | — (supplier ke saath hisaab platform ke bahar) |
| `doctors` | Telemedicine scope se bahar (owner ka faisla) | — |
| `consultations` | Same | — |

⚠️ **`shops` ka compliance logic bekaar nahi gaya** — FSSAI/drug/fertilizer license ab
`suppliers` (jahan se maal aata hai) aur platform-level settings pe move ho gaya hai.
Product-level `prescription_required` / `is_regulated` gate **jaise ke taise** hain.

### 1.3 ➕ NAYI (9 tables)

| Table | Kyun chahiye | Instruction |
|---|---|---|
| `suppliers` | "saman ke neeche likh dege ki kis shop se hai" — naam dikhane + internal tracking | Owner requirement |
| `staff_profiles` | Employee code, supervisor mapping, vehicle, cod_in_hand | §5, §6 |
| `permissions` | 31 granular permissions | §5, §7 |
| `role_permissions` | Role ke default haq | §7 |
| `user_permissions` | Per-user grant/revoke ("future permission system") | §5 |
| `auth_sessions` | JWT refresh token rotation (v2 me PHP session tha) | §8, §21 |
| `device_tokens` | FCM tokens (React Native app) | §29 |
| `carts` + `cart_items` | Server-side cart — web aur mobile me same cart. v2 me localStorage tha, wo mobile app ke saath kaam nahi karta | §7 ("own cart"), §16 |
| `service_bookings` | "chahe saman ho ya service" — slot, technician, completion OTP | Owner requirement |
| `tracking_sessions` | Live tracking + stale detection, bina har ping DB me likhe | §9, §10 |
| `webhook_events` | Duplicate webhook protection | §30 |
| `service_zones` | **6 km delivery boundary** — RADIUS ya POLYGON (admin map pe kheenchta hai). Multiple zone alag fee/ETA ke saath. bbox columns polygon test se pehle ka sasta filter | Owner requirement |
| `service_area_requests` | Bahar wale customer ka lead capture — "jab aap yahan aayein to bataiye". Yahi agli expansion ki list hai | Owner requirement |
| `village_aliases` | Ek gaon ke kai naam: "Raniganj"/"रानीगंज"/"Rani Ganj", aur uske tole ("Rampur Purwa" → रामपुर). **Village picker ki search isi pe chalti hai** — aur village hi service-area ka primary gate hai | Owner requirement |

### 1.4 🔧 BADLI (8 tables)

| Table | Badlav |
|---|---|
| `users` | Role enum 6 → 4 · `pin_hash` hataya (ab sirf OTP) · `created_by`, `disabled_at/by/reason` add · **`role` ka DEFAULT 'CUSTOMER'** (security ki pehli deewar) |
| `products` | `shop_id` → `supplier_id` · `item_type` (PRODUCT/SERVICE) add · service fields (`visiting_charge`, `service_duration_min`, `is_quote_based`) · `cost_price` (margin) · slug ab globally unique (pehle per-shop tha) |
| `categories` | `item_type` add · vertical se `MEAT` hataya, `SERVICE` joda |
| `orders` | `shop_id` hataya · `order_type` (DELIVERY/SERVICE) add · **status enum poora naya** (§2) · `visiting_charge` add · `confirmed_at`/`preparing_at`/`assigned_at`/`out_for_delivery_at`/`completed_at` timestamps add · `payment_status` me `AWAITING_VERIFICATION` |
| `order_items` | `item_type`, `supplier_name` (snapshot), `tax_rate` add |
| `payments` | `CLAIMED` → `AWAITING_VERIFICATION` (naam saaf) · gateway fields rahe (OFF hain) |
| `delivery_assignments` | `job_type` (DELIVERY/SERVICE_VISIT) add · `fail_reason` add |
| `reviews` | `target_type` me `SHOP` → `ORDER` |
| `addresses` | `zone_id`, `check_method` (VILLAGE/POLYGON/RADIUS/MANUAL/UNKNOWN), `gps_accuracy_m` add — support call pe "ye pata kyun block hua" ka jawab yahin milta hai |
| `villages` | `is_popular`, `order_count` (nightly rollup), `zone_id` add — village ab sirf ek lookup table nahi, **service area ka primary gate** hai, isliye picker aur admin dono ke liye ye fields chahiye |

---

## 2. Order state machine — v2 vs v3

| v2 | v3 | Kyun |
|---|---|---|
| PENDING | **PENDING_PAYMENT** \| **CONFIRMED** | Instruction §12. COD order seedha CONFIRMED me jaata hai; UPI order PENDING_PAYMENT me rukta hai |
| ACCEPTED (dukaandaar) | **CONFIRMED** (admin/supervisor) | Ab dukaandaar hai hi nahi |
| — | **OUT_FOR_DELIVERY** | §12 me explicitly maanga |
| — | **SCHEDULED / IN_PROGRESS / COMPLETED** | Service orders ke liye |
| — | **PAYMENT_FAILED / DELIVERY_FAILED / RETURNED** | §12 me maange gaye |

```
DELIVERY : PENDING_PAYMENT ─┐
                            ├─→ CONFIRMED → PREPARING → READY_FOR_PICKUP
           (COD seedha) ────┘        ↓
                                  ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
SERVICE  : PENDING_PAYMENT/CONFIRMED → SCHEDULED → ASSIGNED → IN_PROGRESS → COMPLETED
Terminal : DELIVERED · COMPLETED · CANCELLED · REJECTED · PAYMENT_FAILED
           · DELIVERY_FAILED · RETURNED
```
⚠️ Rider ke reject karne se order **kabhi freeze nahi hota** (§12): assignment REJECTED hoti hai,
order wapas READY_FOR_PICKUP me aata hai, aur admin/supervisor dobara assign kar sakta hai.
`delivery_assignments` pe `order_id` ka UNIQUE index **jaanbujh kar nahi hai** — warna
dobara assign karna hi impossible ho jaata.

---

## 3. Schema quality checks (§13 ki list)

| Check | Nateeja |
|---|---|
| **Foreign keys** | 53 FK. Har child ka parent defined. Delete behaviour soch kar chuna: `CASCADE` (user ka data), `SET NULL` (optional reference), koi cascade nahi (orders — history kabhi nahi udni chahiye) |
| **Indexes** | Har FK pe index. Composite index query pattern ke hisaab se (`orders(customer_id, placed_at)`, `orders(status, placed_at)`, `delivery_assignments(rider_id, status)`). 5 FULLTEXT index |
| **Unique constraints** | `users.phone`, `users.referral_code`, `products.slug`, `products.sku`, `orders.order_number`, `payments.order_id`, `payments.upi_utr`, `order_idempotency(user_id, idem_key)`, `reviews(order_id, target_type, target_id)`, `cart_items(cart_id, product_id)`, `notifications(user_id, dedupe_key)`, `staff_profiles.employee_code`, `tracking_sessions.assignment_id` |
| **Transactions** | Order placement, cancel/refund, adjustment, wallet, COD settlement, staff creation — sab transaction ke andar, `SELECT ... FOR UPDATE` ke saath |
| **Cascading** | ✅ Test kiya: user delete → sessions/tokens/cart/wallet/addresses cascade; orders **nahi** (history bachti hai, customer_id FK block karta hai — soch samajh kar) |
| **Nullable** | Money columns NOT NULL DEFAULT 0.00. Optional GPS nullable (gaon me pin nahi milta). `final_*` columns nullable = "koi adjustment nahi hua" |
| **Data types** | Money `DECIMAL(10,2)`, percent `DECIMAL(5,2)`, coordinates `DECIMAL(10,7)` (~1 cm precision), distance `DECIMAL(6,2)`. **FLOAT kahin nahi** |
| **Date/time** | Sab `DATETIME` (TIMESTAMP nahi — 2038 problem). App aur DB dono `Asia/Kolkata` pe. Connection pe `SET time_zone='+05:30'` |
| **Status fields** | ENUM (CHECK constraint MariaDB/MySQL dono me thoda alag behave karta hai). Transitions code ke state machine me, DB me nahi |
| **User roles** | 4-value ENUM + **DEFAULT 'CUSTOMER'** |
| **Delivery assignments** | Re-assignment allowed (upar §2 dekho) |
| **Order lifecycle** | 16-value ENUM + har transition ka timestamp column |
| **Inventory concurrency** | §4 |

---

## 4. Inventory concurrency (§14 — ye alag se dhyaan maangta hai)

### 4.1 Stock ghatane ka sahi tarika
```sql
START TRANSACTION;
  -- product_id ASC order me lock karo (deadlock se bachne ke liye)
  SELECT stock_qty FROM products WHERE id = ? FOR UPDATE;
  -- app me check: stock_qty >= qty, warna ROLLBACK + saaf error
  UPDATE products
     SET stock_qty = stock_qty - ?,
         sold_count = sold_count + ?
   WHERE id = ?;
  INSERT INTO inventory_logs (...) VALUES (...);
COMMIT;
```

### 4.2 ⚠️ UNSIGNED underflow — ye bug maine asli DB pe pakda hai

`sold_count`, `used_count`, `rating_count`, `total_deliveries`, `view_count` sab
`INT UNSIGNED` hain. Cancel karte waqt inhe ghatana padta hai:

```sql
-- ❌ ERROR 1690: BIGINT UNSIGNED value is out of range
UPDATE products SET sold_count = sold_count - 5 WHERE id = 1;

-- ❌ YE BHI FAIL HOTA HAI — subtraction pehle evaluate hoti hai,
--    GREATEST ko clamp karne ka mauka hi nahi milta
UPDATE products SET sold_count = GREATEST(0, sold_count - 5) WHERE id = 1;

-- ✅ SAHI
UPDATE products SET sold_count = sold_count - LEAST(sold_count, 5) WHERE id = 1;
-- ✅ YE BHI SAHI
UPDATE products SET sold_count = GREATEST(0, CAST(sold_count AS SIGNED) - 5) WHERE id = 1;
```

Dono galat aur dono sahi patterns MariaDB 10.11 pe chala kar verify kiye gaye hain.
**Agar ye galat likha to har order cancellation ka poora transaction fail hoga** —
stock wapas nahi aayega, refund nahi hoga, aur error samajh me nahi aayega.
Code me ek hi helper hoga: `decrementUnsigned(table, column, amount, where)`.

### 4.3 Concurrency test (TEST_REPORT me)
- Stock = 1, do concurrent order → **exactly ek** pass, dusra saaf error
- Stock = 10, das concurrent order of qty 1 → das pass, stock 0, ek bhi oversell nahi
- Cancel ke baad stock wapas, `sold_count` sahi, `inventory_logs` me dono entry

---

## 5. v2 se seekhe hue 5 bugs (v3 me pehle se fix hain)

Ye v2 ke review me nikle the — v3 me inka fix schema me hi baithaya gaya hai:

1. **Router order-number ko lowercase kar deta tha** → har order URL 404. (v3: NestJS route params case-sensitive; order_number `VARCHAR(20)` uppercase)
2. **`delivery_assignments` pe UNIQUE(order_id)** → rider reject kare to order hamesha ke liye atak jaata. (v3: normal index)
3. **Delivery OTP verify record karne ki jagah nahi thi** → (v3: `otp_verified_at`, `otp_attempts`)
4. **Auto-cancel cron prescription-pending orders ko maar deta tha** → (v3: `rx_pending_timeout_hours` alag setting + query me exclusion)
5. **`AWAITING_VERIFICATION` payment wala order cancel hone pe refund kahin darj nahi hota tha** → (v3: `REFUND_PENDING` status + admin queue)

---

## 6. Retention aur cleanup (nightly cron)

| Table | Rule |
|---|---|
| `otp_requests` | 7 din |
| `auth_sessions` | expired/revoked 30 din baad |
| `rate_limits` | 1 din |
| `order_idempotency` | 1 din |
| `delivery_locations` | 7 din (breadcrumb ki zaroorat itni hi hai) |
| `tracking_sessions` | 90 din (ended sessions) |
| `search_logs` | 90 din |
| `jobs` | done 7 din, failed 30 din |
| `webhook_events` | 90 din |
| `prescriptions` | **file** `rx_retention_days` (default 365) ke baad delete, row `purged_at` ke saath rehti hai |
| `audit_logs` | **kabhi delete nahi** (compliance) |
| `wallet_transactions` | **kabhi delete nahi** (paisa) |
| `orders`, `order_items` | **kabhi delete nahi** |

---

## 7. Backup

- Nightly `mysqldump --single-transaction` → gzip → `storage/backups/`, 14 din rakho
- Har hafte ek backup off-server (laptop/Drive) — **ye manual step hai aur zaroori hai**
- Hostinger ka apna backup bhi ON rakho (dono independent hone chahiye)
- Restore ka drill 3 mahine me ek baar — backup jo kabhi restore na kiya gaya ho, backup nahi hai
- ⚠️ Backup me `users.phone`, addresses, prescriptions ka reference hota hai — file encrypted rakho
