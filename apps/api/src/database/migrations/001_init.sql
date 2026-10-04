-- =====================================================================
--  FATANPUR BAZAAR — DATABASE SCHEMA v3  (single-store + services)
--  Stack: NestJS + MySQL 8 / MariaDB 10.4+  ·  utf8mb4_unicode_ci  ·  InnoDB
--
--  v3 me kya badla (v2 marketplace schema se):
--   - Roles ab sirf 4: CUSTOMER, ADMIN, SUPERVISOR, DELIVERY_BOY
--   - shops / shop_timings / shop_payouts / doctors / consultations  → HATAYE
--   - suppliers → ADDED (product ke neeche "X dukaan se" dikhane ke liye)
--   - permissions / role_permissions / user_permissions → ADDED (RBAC)
--   - carts / cart_items → ADDED (server-side cart, mobile+web sync)
--   - service_bookings → ADDED (saman ke saath services bhi)
--   - tracking_sessions → ADDED (live tracking + stale detection)
--   - auth_sessions (JWT refresh) / device_tokens (FCM) → ADDED
--   - orders.status ab naya state machine (PENDING_PAYMENT … OUT_FOR_DELIVERY)
--
--  ⚠️ UNSIGNED counters ghataane ka niyam (poore codebase me):
--     `col = col - LEAST(col, n)`   ✅
--     `col = col - n`               ❌ ERROR 1690 → transaction rollback
--     `col = GREATEST(0, col - n)`  ❌ ye bhi fail hota hai (subtraction pehle hoti hai)
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
--  1. SYSTEM
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    VARCHAR(80) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  `key`        VARCHAR(80)  NOT NULL,
  `value`      TEXT         NULL,
  `type`       ENUM('string','int','decimal','bool','json') NOT NULL DEFAULT 'string',
  `group_name` VARCHAR(40)  NOT NULL DEFAULT 'general',
  `label`      VARCHAR(160) NULL,
  is_public    TINYINT(1)   NOT NULL DEFAULT 0,  -- frontend ko bheja ja sakta hai?
  updated_by   BIGINT UNSIGNED NULL,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`),
  KEY idx_settings_group (`group_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cron/queue bookkeeping — settings me NAHI (warna cache har baar flush hota)
CREATE TABLE cron_state (
  task        VARCHAR(60) NOT NULL,
  last_run_at DATETIME NULL,
  last_ok_at  DATETIME NULL,
  last_error  VARCHAR(500) NULL,
  run_count   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (task)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- In-process queue (Redis/BullMQ ke bina). NestJS @Cron isko drain karta hai.
CREATE TABLE jobs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type         VARCHAR(60)  NOT NULL,
  payload      JSON         NULL,
  priority     TINYINT      NOT NULL DEFAULT 5,
  run_after    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts     TINYINT      NOT NULL DEFAULT 0,
  max_attempts TINYINT      NOT NULL DEFAULT 5,
  locked_at    DATETIME     NULL,
  locked_by    VARCHAR(40)  NULL,
  done_at      DATETIME     NULL,
  failed_at    DATETIME     NULL,
  last_error   VARCHAR(500) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_jobs_pick (done_at, failed_at, run_after, priority),
  KEY idx_jobs_type (type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Har sensitive staff action ka trail (instruction §31)
CREATE TABLE audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    BIGINT UNSIGNED NULL,
  actor_role  VARCHAR(20)  NULL,
  action      VARCHAR(60)  NOT NULL,   -- staff.create, order.status_change, price.update …
  entity      VARCHAR(40)  NULL,
  entity_id   VARCHAR(40)  NULL,
  before_json JSON         NULL,
  after_json  JSON         NULL,
  ip_address  VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_actor (actor_id, created_at),
  KEY idx_audit_entity (entity, entity_id),
  KEY idx_audit_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limits (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bucket       VARCHAR(140) NOT NULL,
  window_start DATETIME     NOT NULL,
  hits         INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rate (bucket, window_start),
  KEY idx_rate_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment/provider webhooks — duplicate delivery se bachne ke liye (instruction §30)
CREATE TABLE webhook_events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider     VARCHAR(30)  NOT NULL,
  event_id     VARCHAR(120) NOT NULL,
  event_type   VARCHAR(60)  NULL,
  payload      JSON         NULL,
  signature_ok TINYINT(1)   NOT NULL DEFAULT 0,
  processed_at DATETIME     NULL,
  error        VARCHAR(500) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_webhook (provider, event_id),
  KEY idx_webhook_processed (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_daily (
  stat_date        DATE NOT NULL,
  orders_placed    INT UNSIGNED NOT NULL DEFAULT 0,
  orders_delivered INT UNSIGNED NOT NULL DEFAULT 0,
  orders_cancelled INT UNSIGNED NOT NULL DEFAULT 0,
  services_completed INT UNSIGNED NOT NULL DEFAULT 0,
  gmv              DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  cod_amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  upi_amount       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  delivery_fees    DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  new_customers    INT UNSIGNED NOT NULL DEFAULT 0,
  active_customers INT UNSIGNED NOT NULL DEFAULT 0,
  avg_order_value  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  avg_delivery_minutes INT UNSIGNED NULL,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  2. IDENTITY, ROLES & PERMISSIONS
--  ⚠️ role kabhi bhi frontend se accept nahi hoga (instruction §4, §23, §35)
-- =====================================================================

CREATE TABLE users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone          VARCHAR(15) NOT NULL,           -- E.164 bina '+': 919876543210
  name           VARCHAR(120) NULL,
  email          VARCHAR(160) NULL,
  -- ⚠️ DEFAULT 'CUSTOMER' — public registration is column ko chhoo hi nahi sakti.
  --    Staff banane ka rasta sirf admin service layer se jaata hai.
  role           ENUM('CUSTOMER','ADMIN','SUPERVISOR','DELIVERY_BOY')
                 NOT NULL DEFAULT 'CUSTOMER',
  status         ENUM('ACTIVE','DISABLED','DELETED') NOT NULL DEFAULT 'ACTIVE',
  phone_verified TINYINT(1) NOT NULL DEFAULT 0,
  avatar_url     VARCHAR(255) NULL,
  referral_code  VARCHAR(12) NOT NULL,
  language       ENUM('hi','en') NOT NULL DEFAULT 'hi',
  created_by     BIGINT UNSIGNED NULL,           -- staff kisne banaya (audit)
  disabled_at    DATETIME NULL,
  disabled_by    BIGINT UNSIGNED NULL,
  disable_reason VARCHAR(255) NULL,
  last_login_at  DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_referral (referral_code),
  KEY idx_users_role (role, status),
  KEY idx_users_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sirf staff ke liye (ADMIN / SUPERVISOR / DELIVERY_BOY)
CREATE TABLE staff_profiles (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NOT NULL,
  employee_code  VARCHAR(20) NOT NULL,
  designation    VARCHAR(80) NULL,
  supervisor_id  BIGINT UNSIGNED NULL,           -- kis supervisor ke under
  joined_on      DATE NULL,
  -- delivery boy ke liye
  vehicle_type   ENUM('CYCLE','BIKE','SCOOTER','OTHER') NULL,
  vehicle_number VARCHAR(20) NULL,
  id_proof_type  VARCHAR(40) NULL,
  id_proof_last4 VARCHAR(8) NULL,
  id_proof_url   VARCHAR(255) NULL,              -- PRIVATE storage
  is_available   TINYINT(1) NOT NULL DEFAULT 0,  -- duty on/off
  cod_in_hand    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_deliveries INT UNSIGNED NOT NULL DEFAULT 0,
  rating_avg     DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count   INT UNSIGNED NOT NULL DEFAULT 0,
  notes          VARCHAR(500) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_user (user_id),
  UNIQUE KEY uq_staff_code (employee_code),
  KEY idx_staff_supervisor (supervisor_id),
  KEY idx_staff_available (is_available),
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_sup FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Granular permissions — SUPERVISOR ko default me staff banane ka haq NAHI (§5)
CREATE TABLE permissions (
  code       VARCHAR(60)  NOT NULL,   -- orders.update_status, staff.create …
  label      VARCHAR(120) NOT NULL,
  group_name VARCHAR(40)  NOT NULL DEFAULT 'general',
  is_dangerous TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (code),
  KEY idx_perm_group (group_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
  role            ENUM('CUSTOMER','ADMIN','SUPERVISOR','DELIVERY_BOY') NOT NULL,
  permission_code VARCHAR(60) NOT NULL,
  PRIMARY KEY (role, permission_code),
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-user override (grant ya revoke). ADMIN ke alawa kisi ko dena optional hai.
CREATE TABLE user_permissions (
  user_id         BIGINT UNSIGNED NOT NULL,
  permission_code VARCHAR(60) NOT NULL,
  granted         TINYINT(1) NOT NULL DEFAULT 1,  -- 0 = explicitly revoke
  granted_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_code),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_up_perm FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OTP hashed hi store hoga. Kabhi plain nahi, kabhi log nahi, kabhi API response me nahi.
CREATE TABLE otp_requests (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone        VARCHAR(15) NOT NULL,
  code_hash    VARCHAR(255) NOT NULL,
  purpose      ENUM('LOGIN','REGISTER','STAFF_LOGIN','PHONE_CHANGE') NOT NULL DEFAULT 'LOGIN',
  channel      ENUM('SMS','WHATSAPP','MANUAL','DEV') NOT NULL DEFAULT 'SMS',
  attempts     TINYINT NOT NULL DEFAULT 0,
  provider_ref VARCHAR(120) NULL,
  ip_address   VARCHAR(45) NULL,
  consumed_at  DATETIME NULL,
  expires_at   DATETIME NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_otp_phone (phone, created_at),
  KEY idx_otp_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- JWT access token short-lived (memory me), refresh token yahan hashed
CREATE TABLE auth_sessions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  device_id         VARCHAR(80) NULL,
  platform          ENUM('WEB','ANDROID','IOS') NOT NULL DEFAULT 'WEB',
  user_agent        VARCHAR(255) NULL,
  ip_address        VARCHAR(45) NULL,
  last_used_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at        DATETIME NOT NULL,
  revoked_at        DATETIME NULL,
  revoke_reason     VARCHAR(120) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_token (refresh_token_hash),
  KEY idx_session_user (user_id, expires_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FCM (React Native app) — instruction §29
CREATE TABLE device_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token       VARCHAR(255) NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  platform    ENUM('ANDROID','IOS','WEB') NOT NULL DEFAULT 'ANDROID',
  device_id   VARCHAR(80) NULL,
  app_version VARCHAR(20) NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  fail_count  TINYINT NOT NULL DEFAULT 0,
  last_ok_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_device_token (token_hash),
  KEY idx_device_user (user_id, is_active),
  CONSTRAINT fk_device_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Web Push (browser) — FCM se alag, website ke liye
CREATE TABLE push_subscriptions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  endpoint      TEXT NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  p256dh        VARCHAR(255) NOT NULL,
  auth_key      VARCHAR(255) NOT NULL,
  user_agent    VARCHAR(255) NULL,
  fail_count    TINYINT NOT NULL DEFAULT 0,
  last_ok_at    DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_user (user_id),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  type       VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
  title      VARCHAR(160) NOT NULL,
  body       VARCHAR(500) NOT NULL,
  link_url   VARCHAR(255) NULL,
  data_json  JSON NULL,
  -- duplicate notification rokne ke liye (instruction §29)
  dedupe_key VARCHAR(120) NULL,
  is_read    TINYINT(1) NOT NULL DEFAULT 0,
  pushed_at  DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notif_dedupe (user_id, dedupe_key),
  KEY idx_notif_user (user_id, is_read, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  3. GEO / SERVICE AREA
-- =====================================================================

CREATE TABLE villages (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(120) NOT NULL,
  name_hi      VARCHAR(120) NULL,
  slug         VARCHAR(140) NOT NULL,
  block_name   VARCHAR(120) NULL,
  district     VARCHAR(120) NOT NULL DEFAULT 'Pratapgarh',
  state        VARCHAR(120) NOT NULL DEFAULT 'Uttar Pradesh',
  pincode      VARCHAR(10) NOT NULL DEFAULT '230301',
  latitude     DECIMAL(10,7) NOT NULL,
  longitude    DECIMAL(10,7) NOT NULL,
  distance_km  DECIMAL(6,2) NOT NULL DEFAULT 0,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  min_order    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  eta_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  -- ⚠️ Village list HI asli service-area gate hai (GPS sirf validation hai) —
  --    isliye ye fields picker aur admin dono ke liye zaroori hain
  is_popular   TINYINT(1) NOT NULL DEFAULT 0,   -- picker me sabse upar
  order_count  INT UNSIGNED NOT NULL DEFAULT 0, -- nightly cron se — kaunsa gaon kitna order deta hai
  zone_id      BIGINT UNSIGNED NULL,            -- kaunse zone me aata hai (cached)
  seo_title       VARCHAR(180) NULL,
  seo_description VARCHAR(320) NULL,
  intro_html      TEXT NULL,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_villages_slug (slug),
  KEY idx_villages_active (is_active, sort_order),
  KEY idx_villages_popular (is_active, is_popular, order_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ek hi gaon ke kai naam hote hain: "Raniganj" / "रानीगंज" / "Rani Ganj",
-- aur uske tole/purwe ("Rampur Purwa" → Rampur). Picker ki search aur admin ki
-- dedup dono isi table se chalti hain.
CREATE TABLE village_aliases (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  village_id BIGINT UNSIGNED NOT NULL,
  alias      VARCHAR(140) NOT NULL,
  alias_type ENUM('SPELLING','HAMLET','LANDMARK','OLD_NAME') NOT NULL DEFAULT 'SPELLING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_alias (alias),
  KEY idx_alias_village (village_id),
  CONSTRAINT fk_alias_village FOREIGN KEY (village_id) REFERENCES villages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Delivery boundary. Ek row = ek zone. Zone RADIUS ho sakta hai ya POLYGON
-- (admin map pe kheench kar banata hai). Multiple zone ho sakte hain alag fee/ETA ke saath.
-- priority sabse chhoti wali zone pehle match hoti hai (inner zone pehle).
CREATE TABLE service_zones (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(120) NOT NULL,          -- "Fatanpur 6 km"
  name_hi        VARCHAR(120) NULL,
  mode           ENUM('RADIUS','POLYGON') NOT NULL DEFAULT 'RADIUS',
  center_lat     DECIMAL(10,7) NULL,             -- mode=RADIUS ke liye
  center_lng     DECIMAL(10,7) NULL,
  radius_km      DECIMAL(6,2) NULL,
  -- mode=POLYGON: GeoJSON Polygon coordinates [[lng,lat], ...] — pehla point aakhri = closed
  -- ⚠️ JSON ke andar SQL se query mat karna; poora decode karke code me point-in-polygon
  polygon_geojson JSON NULL,
  -- Bounding box — polygon test se PEHLE ka sasta filter (index-friendly)
  bbox_min_lat   DECIMAL(10,7) NULL,
  bbox_max_lat   DECIMAL(10,7) NULL,
  bbox_min_lng   DECIMAL(10,7) NULL,
  bbox_max_lng   DECIMAL(10,7) NULL,
  delivery_fee   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  min_order      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  eta_minutes    SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  priority       SMALLINT NOT NULL DEFAULT 10,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  note           VARCHAR(255) NULL,
  updated_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_zone_active (is_active, priority),
  KEY idx_zone_bbox (bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jo log area ke bahar se aaye — unka number lo. Ye aapki agli expansion ki list hai.
CREATE TABLE service_area_requests (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NULL,
  phone        VARCHAR(15) NULL,
  area_text    VARCHAR(200) NULL,               -- customer ne jo likha ("Antu ke paas")
  village_guess VARCHAR(120) NULL,
  latitude     DECIMAL(10,7) NULL,
  longitude    DECIMAL(10,7) NULL,
  distance_km  DECIMAL(6,2) NULL,
  source       ENUM('CHECKOUT','ADDRESS','HOMEPAGE','APP') NOT NULL DEFAULT 'CHECKOUT',
  status       ENUM('NEW','NOTED','CONTACTED','NOW_SERVED') NOT NULL DEFAULT 'NEW',
  admin_note   VARCHAR(300) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sar_status (status, created_at),
  KEY idx_sar_village (village_guess),
  KEY idx_sar_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE addresses (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NOT NULL,
  village_id     BIGINT UNSIGNED NULL,
  label          VARCHAR(40) NOT NULL DEFAULT 'Ghar',
  receiver_name  VARCHAR(120) NOT NULL,
  phone          VARCHAR(15) NOT NULL,
  line1          VARCHAR(255) NOT NULL,
  landmark       VARCHAR(255) NULL,
  latitude       DECIMAL(10,7) NULL,
  longitude      DECIMAL(10,7) NULL,
  distance_km    DECIMAL(6,2) NULL,
  is_serviceable TINYINT(1) NOT NULL DEFAULT 1,
  -- Serviceability ka faisla kaise hua — support call pe ye sabse kaam ki cheez hoti hai
  zone_id        BIGINT UNSIGNED NULL,
  check_method   ENUM('VILLAGE','POLYGON','RADIUS','MANUAL','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  gps_accuracy_m SMALLINT UNSIGNED NULL,
  is_default     TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at     DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_addr_user (user_id, deleted_at),
  KEY idx_addr_village (village_id),
  CONSTRAINT fk_addr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_addr_village FOREIGN KEY (village_id) REFERENCES villages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  4. CATALOG  (single store — sab kuch admin list karta hai)
-- =====================================================================

-- Supplier = jis dukaan/mandi se saman aata hai.
-- Iska koi login/dashboard NAHI hai. Sirf product ke neeche "X dukaan se" dikhane
-- aur internal purchase tracking ke liye.
CREATE TABLE suppliers (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(160) NOT NULL,
  name_hi      VARCHAR(160) NULL,
  type         ENUM('SHOP','MANDI','FARMER','DISTRIBUTOR','OTHER') NOT NULL DEFAULT 'SHOP',
  contact_person VARCHAR(120) NULL,
  phone        VARCHAR(15) NULL,
  village_id   BIGINT UNSIGNED NULL,
  address_line VARCHAR(255) NULL,
  gstin        VARCHAR(20) NULL,
  fssai_license VARCHAR(30) NULL,
  fssai_expiry DATE NULL,
  show_on_product TINYINT(1) NOT NULL DEFAULT 1,  -- product page pe naam dikhaye?
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  notes        VARCHAR(500) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_supplier_active (is_active),
  KEY idx_supplier_village (village_id),
  CONSTRAINT fk_supplier_village FOREIGN KEY (village_id) REFERENCES villages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id  BIGINT UNSIGNED NULL,
  -- vertical = kill-switch group. MEAT hataya gaya (owner ka faisla).
  vertical   ENUM('VEGETABLES','FRUITS','GROCERY','PHARMACY','AGRI_INPUT','SERVICE','OTHER')
             NOT NULL DEFAULT 'GROCERY',
  item_type  ENUM('PRODUCT','SERVICE') NOT NULL DEFAULT 'PRODUCT',
  name       VARCHAR(120) NOT NULL,
  name_hi    VARCHAR(120) NULL,
  slug       VARCHAR(140) NOT NULL,
  image_url  VARCHAR(255) NULL,
  icon       VARCHAR(40) NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  seo_title       VARCHAR(180) NULL,
  seo_description VARCHAR(320) NULL,
  intro_html      TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cat_slug (slug),
  KEY idx_cat_parent (parent_id, sort_order),
  KEY idx_cat_vertical (vertical, is_active),
  CONSTRAINT fk_cat_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ek hi table products + services dono ke liye (item_type se alag hote hain)
CREATE TABLE products (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NULL,
  item_type   ENUM('PRODUCT','SERVICE') NOT NULL DEFAULT 'PRODUCT',
  sku         VARCHAR(40) NULL,
  name        VARCHAR(200) NOT NULL,
  name_hi     VARCHAR(200) NULL,
  slug        VARCHAR(220) NOT NULL,
  description TEXT NULL,
  brand       VARCHAR(120) NULL,

  -- PRODUCT fields
  unit        VARCHAR(30) NOT NULL DEFAULT 'piece',
  unit_value  DECIMAL(10,3) NOT NULL DEFAULT 1.000,
  mrp         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  price       DECIMAL(10,2) NOT NULL,
  cost_price  DECIMAL(10,2) NULL,               -- internal margin tracking
  stock_qty   INT NOT NULL DEFAULT 0,
  low_stock_at INT NOT NULL DEFAULT 5,
  is_weighted TINYINT(1) NOT NULL DEFAULT 0,    -- sabzi: taul me farak aata hai

  -- SERVICE fields (item_type='SERVICE' pe hi use hote hain)
  service_duration_min SMALLINT UNSIGNED NULL,
  visiting_charge      DECIMAL(10,2) NULL,
  is_quote_based       TINYINT(1) NOT NULL DEFAULT 0,  -- "kaam dekh kar rate"
  service_note         VARCHAR(500) NULL,

  is_available TINYINT(1) NOT NULL DEFAULT 1,
  -- Regulatory
  prescription_required TINYINT(1) NOT NULL DEFAULT 0,
  is_regulated          TINYINT(1) NOT NULL DEFAULT 0,
  max_qty_per_order     INT NOT NULL DEFAULT 50,
  hsn_code    VARCHAR(12) NULL,
  tax_rate    DECIMAL(5,2) NOT NULL DEFAULT 0.00,  -- price TAX-INCLUSIVE hai
  -- Search & SEO
  search_text      VARCHAR(500) NULL,
  meta_title       VARCHAR(180) NULL,
  meta_description VARCHAR(320) NULL,
  rating_avg   DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count INT UNSIGNED NOT NULL DEFAULT 0,
  sold_count   INT UNSIGNED NOT NULL DEFAULT 0,
  view_count   INT UNSIGNED NOT NULL DEFAULT 0,
  is_featured  TINYINT(1) NOT NULL DEFAULT 0,
  created_by   BIGINT UNSIGNED NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prod_slug (slug),
  UNIQUE KEY uq_prod_sku (sku),
  KEY idx_prod_cat (category_id, is_available),
  KEY idx_prod_type (item_type, is_available),
  KEY idx_prod_supplier (supplier_id),
  KEY idx_prod_featured (is_featured, is_available),
  FULLTEXT KEY ft_products (name, name_hi, search_text),
  CONSTRAINT fk_prod_cat FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_prod_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_images (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  url        VARCHAR(255) NOT NULL,
  url_sm     VARCHAR(255) NULL,
  width      SMALLINT UNSIGNED NULL,
  height     SMALLINT UNSIGNED NULL,
  alt        VARCHAR(200) NULL,
  sort_order TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_pimg_product (product_id, sort_order),
  CONSTRAINT fk_pimg_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE search_synonyms (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  term      VARCHAR(80) NOT NULL,
  maps_to   VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_syn_term (term)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE search_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  query         VARCHAR(160) NOT NULL,
  results_count INT UNSIGNED NOT NULL DEFAULT 0,
  user_id       BIGINT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_search_query (query, created_at),
  KEY idx_search_zero (results_count, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE banners (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title      VARCHAR(160) NOT NULL,
  subtitle   VARCHAR(200) NULL,
  image_url  VARCHAR(255) NULL,
  link_url   VARCHAR(255) NULL,
  position   ENUM('HOME_TOP','HOME_MID','CATEGORY') NOT NULL DEFAULT 'HOME_TOP',
  starts_at  DATETIME NULL,
  ends_at    DATETIME NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_banner_pos (position, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  5. CART  (server-side — web aur mobile me same cart)
-- =====================================================================

CREATE TABLE carts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NULL,             -- guest cart ke liye NULL
  guest_key  CHAR(36) NULL,                    -- guest ka uuid (login pe merge)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_user (user_id),
  UNIQUE KEY uq_cart_guest (guest_key),
  KEY idx_cart_updated (updated_at),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cart_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cart_id    BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity   INT NOT NULL DEFAULT 1,
  -- service booking ke liye chuni hui slot (item_type=SERVICE)
  slot_date  DATE NULL,
  slot_start TIME NULL,
  note       VARCHAR(255) NULL,
  added_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_product (cart_id, product_id),
  KEY idx_citem_product (product_id),
  CONSTRAINT fk_citem_cart FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
  CONSTRAINT fk_citem_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  6. MONEY PRIMITIVES
-- =====================================================================

CREATE TABLE wallets (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  balance    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_user (user_id),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wallet_transactions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  wallet_id     BIGINT UNSIGNED NOT NULL,
  type          ENUM('CREDIT','DEBIT') NOT NULL,
  source        ENUM('ORDER_PAYMENT','ORDER_REFUND','REFERRAL_REWARD','CASHBACK',
                     'ADMIN_ADJUSTMENT','RIDER_EARNING','PAYOUT') NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  reference_id  VARCHAR(40) NULL,
  note          VARCHAR(255) NULL,
  created_by    BIGINT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wtxn_wallet (wallet_id, created_at),
  CONSTRAINT fk_wtxn_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupons (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(30) NOT NULL,
  title           VARCHAR(160) NULL,
  description     VARCHAR(255) NULL,
  discount_type   ENUM('FLAT','PERCENT') NOT NULL DEFAULT 'FLAT',
  discount_value  DECIMAL(10,2) NOT NULL,
  max_discount    DECIMAL(10,2) NULL,
  min_order_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  usage_limit     INT UNSIGNED NULL,
  used_count      INT UNSIGNED NOT NULL DEFAULT 0,
  per_user_limit  INT UNSIGNED NOT NULL DEFAULT 1,
  first_order_only TINYINT(1) NOT NULL DEFAULT 0,
  applies_to      ENUM('ALL','PRODUCT','SERVICE') NOT NULL DEFAULT 'ALL',
  starts_at       DATETIME NOT NULL,
  expires_at      DATETIME NOT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_code (code),
  KEY idx_coupon_active (is_active, starts_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  7. ORDERS  (delivery + service, ek hi table)
-- =====================================================================

CREATE TABLE order_idempotency (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  idem_key   CHAR(36) NOT NULL,
  order_id   BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_idem (user_id, idem_key),
  KEY idx_idem_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_number  VARCHAR(20) NOT NULL,            -- FB-20260907-0001
  customer_id   BIGINT UNSIGNED NOT NULL,
  address_id    BIGINT UNSIGNED NOT NULL,
  order_type    ENUM('DELIVERY','SERVICE') NOT NULL DEFAULT 'DELIVERY',

  -- DELIVERY path : PENDING_PAYMENT|CONFIRMED → PREPARING → READY_FOR_PICKUP
  --                 → ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED
  -- SERVICE  path : PENDING_PAYMENT|CONFIRMED → SCHEDULED → ASSIGNED
  --                 → IN_PROGRESS → COMPLETED
  status        ENUM('PENDING_PAYMENT','CONFIRMED','PREPARING','READY_FOR_PICKUP',
                     'ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED',
                     'SCHEDULED','IN_PROGRESS','COMPLETED',
                     'CANCELLED','REJECTED','PAYMENT_FAILED','DELIVERY_FAILED','RETURNED')
                NOT NULL DEFAULT 'PENDING_PAYMENT',

  items_total   DECIMAL(10,2) NOT NULL,
  delivery_fee  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  visiting_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  wallet_used   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  grand_total   DECIMAL(10,2) NOT NULL,
  -- adjustment (taul/stock) ke baad ka asli amount
  final_items_total DECIMAL(10,2) NULL,
  final_grand_total DECIMAL(10,2) NULL,
  adjusted_at   DATETIME NULL,
  adjusted_by   BIGINT UNSIGNED NULL,
  adjustment_note VARCHAR(300) NULL,

  payment_method ENUM('COD','UPI','WALLET','GATEWAY') NOT NULL DEFAULT 'COD',
  payment_status ENUM('PENDING','AWAITING_VERIFICATION','PAID','FAILED',
                      'REFUND_PENDING','REFUNDED') NOT NULL DEFAULT 'PENDING',

  -- Address snapshot (customer baad me address badle to purana order na bigde)
  ship_name     VARCHAR(120) NOT NULL,
  ship_phone    VARCHAR(15) NOT NULL,
  ship_line1    VARCHAR(255) NOT NULL,
  ship_landmark VARCHAR(255) NULL,
  ship_village  VARCHAR(120) NULL,
  ship_lat      DECIMAL(10,7) NULL,
  ship_lng      DECIMAL(10,7) NULL,
  distance_km   DECIMAL(6,2) NULL,

  coupon_id     BIGINT UNSIGNED NULL,
  requires_prescription TINYINT(1) NOT NULL DEFAULT 0,
  prescription_status ENUM('NONE','PENDING_REVIEW','APPROVED','REJECTED')
                      NOT NULL DEFAULT 'NONE',
  customer_note VARCHAR(500) NULL,
  cancel_reason VARCHAR(255) NULL,
  cancelled_by  ENUM('CUSTOMER','ADMIN','SUPERVISOR','DELIVERY_BOY','SYSTEM') NULL,
  eta_minutes   SMALLINT UNSIGNED NULL,

  placed_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at  DATETIME NULL,
  preparing_at  DATETIME NULL,
  ready_at      DATETIME NULL,
  assigned_at   DATETIME NULL,
  picked_up_at  DATETIME NULL,
  out_for_delivery_at DATETIME NULL,
  delivered_at  DATETIME NULL,
  completed_at  DATETIME NULL,
  cancelled_at  DATETIME NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_number (order_number),
  KEY idx_order_customer (customer_id, placed_at),
  KEY idx_order_status (status, placed_at),
  KEY idx_order_type (order_type, status),
  KEY idx_order_payment (payment_status, placed_at),
  CONSTRAINT fk_order_customer FOREIGN KEY (customer_id) REFERENCES users(id),
  CONSTRAINT fk_order_address FOREIGN KEY (address_id) REFERENCES addresses(id),
  CONSTRAINT fk_order_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id     BIGINT UNSIGNED NOT NULL,
  product_id   BIGINT UNSIGNED NULL,
  item_type    ENUM('PRODUCT','SERVICE') NOT NULL DEFAULT 'PRODUCT',
  -- snapshot: product baad me badla to history safe rehti hai
  product_name VARCHAR(200) NOT NULL,
  product_name_hi VARCHAR(200) NULL,
  supplier_name VARCHAR(160) NULL,
  image_url    VARCHAR(255) NULL,
  unit         VARCHAR(30) NOT NULL DEFAULT 'piece',
  unit_value   DECIMAL(10,3) NOT NULL DEFAULT 1.000,
  unit_price   DECIMAL(10,2) NOT NULL,
  mrp          DECIMAL(10,2) NULL,
  tax_rate     DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  quantity     INT NOT NULL,
  line_total   DECIMAL(10,2) NOT NULL,
  prescription_required TINYINT(1) NOT NULL DEFAULT 0,
  -- adjustment
  final_quantity   INT NULL,
  final_line_total DECIMAL(10,2) NULL,
  is_removed       TINYINT(1) NOT NULL DEFAULT 0,
  adjust_note      VARCHAR(160) NULL,
  PRIMARY KEY (id),
  KEY idx_oitem_order (order_id),
  KEY idx_oitem_product (product_id),
  CONSTRAINT fk_oitem_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oitem_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_status_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(24) NULL,
  to_status   VARCHAR(24) NOT NULL,
  changed_by  BIGINT UNSIGNED NULL,
  actor_role  VARCHAR(20) NULL,
  note        VARCHAR(255) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_oslog_order (order_id, created_at),
  CONSTRAINT fk_oslog_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oslog_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       BIGINT UNSIGNED NOT NULL,
  method         ENUM('COD','UPI','WALLET','GATEWAY') NOT NULL,
  status         ENUM('PENDING','AWAITING_VERIFICATION','PAID','FAILED',
                      'REFUND_PENDING','REFUNDED') NOT NULL DEFAULT 'PENDING',
  amount         DECIMAL(10,2) NOT NULL,
  amount_final   DECIMAL(10,2) NULL,
  refund_amount  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  -- UPI direct-to-bank (HDFC) — koi gateway nahi
  upi_vpa        VARCHAR(120) NULL,
  upi_utr        VARCHAR(40) NULL,
  upi_claimed_at DATETIME NULL,
  upi_screenshot VARCHAR(255) NULL,
  verified_by    BIGINT UNSIGNED NULL,           -- SIRF ADMIN
  verified_at    DATETIME NULL,
  reject_reason  VARCHAR(255) NULL,
  -- Gateway (future — code ready, settings se OFF)
  gateway            VARCHAR(30) NULL,
  gateway_order_id   VARCHAR(80) NULL,
  gateway_payment_id VARCHAR(80) NULL,
  gateway_signature  VARCHAR(255) NULL,
  failure_reason VARCHAR(255) NULL,
  refund_ref     VARCHAR(80) NULL,
  paid_at        DATETIME NULL,
  refunded_at    DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pay_order (order_id),
  UNIQUE KEY uq_pay_utr (upi_utr),
  KEY idx_pay_gateway (gateway_order_id),
  KEY idx_pay_status (status, created_at),
  CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  change_qty INT NOT NULL,
  qty_after  INT NOT NULL,
  reason     ENUM('ORDER','CANCEL','RESTOCK','MANUAL','CORRECTION','ADJUSTMENT') NOT NULL,
  reference  VARCHAR(40) NULL,
  actor_id   BIGINT UNSIGNED NULL,
  note       VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inv_product (product_id, created_at),
  CONSTRAINT fk_inv_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupon_usages (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coupon_id       BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  order_id        BIGINT UNSIGNED NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cusage_order (order_id),
  KEY idx_cusage_user (coupon_id, user_id),
  CONSTRAINT fk_cusage_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  CONSTRAINT fk_cusage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cusage_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE referrals (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  referrer_id      BIGINT UNSIGNED NOT NULL,
  referred_id      BIGINT UNSIGNED NOT NULL,
  reward_amount    DECIMAL(10,2) NULL,
  reward_issued_at DATETIME NULL,
  signup_ip        VARCHAR(45) NULL,
  is_flagged       TINYINT(1) NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ref_referred (referred_id),
  KEY idx_ref_referrer (referrer_id),
  CONSTRAINT fk_ref_referrer FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ref_referred FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  8. SERVICE BOOKINGS  (order_type = 'SERVICE')
-- =====================================================================

CREATE TABLE service_bookings (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       BIGINT UNSIGNED NOT NULL,
  scheduled_date DATE NOT NULL,
  slot_start     TIME NOT NULL,
  slot_end       TIME NOT NULL,
  technician_id  BIGINT UNSIGNED NULL,          -- staff user (DELIVERY_BOY / SUPERVISOR)
  visiting_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  final_amount   DECIMAL(10,2) NULL,            -- quote-based kaam ka final rate
  work_note      VARCHAR(1000) NULL,
  customer_note  VARCHAR(500) NULL,
  started_at     DATETIME NULL,
  completed_at   DATETIME NULL,
  completion_otp VARCHAR(6) NULL,               -- customer bolta hai, tab COMPLETED
  otp_verified_at DATETIME NULL,
  otp_attempts   TINYINT NOT NULL DEFAULT 0,
  reschedule_count TINYINT NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_order (order_id),
  KEY idx_booking_slot (scheduled_date, slot_start),
  KEY idx_booking_tech (technician_id, scheduled_date),
  CONSTRAINT fk_booking_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_tech FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  9. DELIVERY & LIVE TRACKING
-- =====================================================================

CREATE TABLE delivery_assignments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id      BIGINT UNSIGNED NOT NULL,
  rider_id      BIGINT UNSIGNED NOT NULL,
  job_type      ENUM('DELIVERY','SERVICE_VISIT') NOT NULL DEFAULT 'DELIVERY',
  status        ENUM('OFFERED','ACCEPTED','REJECTED','PICKED_UP','DELIVERED',
                     'FAILED','CANCELLED') NOT NULL DEFAULT 'OFFERED',
  assigned_by   BIGINT UNSIGNED NULL,
  earning       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  cod_collected DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  -- Delivery OTP: JAANBUJH KAR plain text (customer ko dikhana bhi hai, compare bhi karna hai).
  -- Short-lived, per-assignment, delivery ke baad NULL. Ye login credential NAHI hai.
  delivery_otp    VARCHAR(6) NULL,
  otp_verified_at DATETIME NULL,
  otp_attempts    TINYINT NOT NULL DEFAULT 0,
  reject_reason VARCHAR(255) NULL,
  fail_reason   VARCHAR(255) NULL,
  offered_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at   DATETIME NULL,
  picked_up_at  DATETIME NULL,
  delivered_at  DATETIME NULL,
  PRIMARY KEY (id),
  -- ⚠️ UNIQUE nahi: rider reject kare to usi order ka doosra assignment banega.
  --    "ek order pe ek hi ACTIVE assignment" rule service layer me transaction ke andar.
  KEY idx_assign_order (order_id, status),
  KEY idx_assign_rider (rider_id, status),
  CONSTRAINT fk_assign_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_assign_rider FOREIGN KEY (rider_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ek active tracking session per assignment. Socket.IO isi ko update karta hai.
-- ⚠️ Har GPS ping DB me nahi jaata — ye row "aakhri known position" rakhti hai.
CREATE TABLE tracking_sessions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id  BIGINT UNSIGNED NOT NULL,
  rider_id       BIGINT UNSIGNED NOT NULL,
  is_live        TINYINT(1) NOT NULL DEFAULT 1,
  last_lat       DECIMAL(10,7) NULL,
  last_lng       DECIMAL(10,7) NULL,
  last_accuracy_m SMALLINT UNSIGNED NULL,
  last_speed_kmh  DECIMAL(5,2) NULL,
  last_ping_at   DATETIME NULL,
  ping_count     INT UNSIGNED NOT NULL DEFAULT 0,
  persisted_count INT UNSIGNED NOT NULL DEFAULT 0,
  started_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at       DATETIME NULL,
  end_reason     ENUM('DELIVERED','CANCELLED','FAILED','TIMEOUT','MANUAL') NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_track_assignment (assignment_id),
  KEY idx_track_live (is_live, last_ping_at),
  KEY idx_track_rider (rider_id, is_live),
  CONSTRAINT fk_track_assign FOREIGN KEY (assignment_id) REFERENCES delivery_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_track_rider FOREIGN KEY (rider_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sparse breadcrumb trail: har ping nahi — sirf >100m movement ya 60s gap pe.
CREATE TABLE delivery_locations (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  latitude      DECIMAL(10,7) NOT NULL,
  longitude     DECIMAL(10,7) NOT NULL,
  accuracy_m    SMALLINT UNSIGNED NULL,
  recorded_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dloc_assign (assignment_id, recorded_at),
  CONSTRAINT fk_dloc_assign FOREIGN KEY (assignment_id) REFERENCES delivery_assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cod_settlements (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rider_id      BIGINT UNSIGNED NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  received_by   BIGINT UNSIGNED NOT NULL,
  reference     VARCHAR(80) NULL,
  note          VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cods_rider (rider_id, created_at),
  CONSTRAINT fk_cods_rider FOREIGN KEY (rider_id) REFERENCES users(id),
  CONSTRAINT fk_cods_admin FOREIGN KEY (received_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  10. TRUST & REGULATED
-- =====================================================================

CREATE TABLE reviews (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  order_id    BIGINT UNSIGNED NOT NULL,
  target_type ENUM('ORDER','PRODUCT','RIDER') NOT NULL,
  target_id   BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NULL,
  rating      TINYINT NOT NULL,
  comment     VARCHAR(1000) NULL,
  is_approved TINYINT(1) NOT NULL DEFAULT 1,
  is_flagged  TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_review_once (order_id, target_type, target_id),
  KEY idx_review_product (product_id, is_approved),
  KEY idx_review_created (created_at),
  CONSTRAINT fk_review_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_review_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Prescription review ab role se nahi, PERMISSION se hota hai (prescriptions.review)
CREATE TABLE prescriptions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  order_id    BIGINT UNSIGNED NULL,
  file_path   VARCHAR(255) NOT NULL,             -- webroot ke BAAHAR, private
  file_mime   VARCHAR(60) NOT NULL,
  file_size   INT UNSIGNED NULL,
  doctor_name VARCHAR(120) NULL,
  issued_on   DATE NULL,
  status      ENUM('PENDING_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by BIGINT UNSIGNED NULL,
  review_note VARCHAR(500) NULL,
  reviewed_at DATETIME NULL,
  expires_at  DATETIME NULL,
  purged_at   DATETIME NULL,                     -- retention ke baad file delete
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rx_user (user_id, status),
  KEY idx_rx_queue (status, created_at),
  KEY idx_rx_order (order_id),
  CONSTRAINT fk_rx_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rx_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
--  11. CONTENT / SEO
-- =====================================================================

CREATE TABLE pages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(120) NOT NULL,
  title       VARCHAR(180) NOT NULL,
  body_html   MEDIUMTEXT NOT NULL,
  seo_title   VARCHAR(180) NULL,
  seo_description VARCHAR(320) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_page_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE faqs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question   VARCHAR(300) NOT NULL,
  answer     TEXT NOT NULL,
  page_scope VARCHAR(60) NOT NULL DEFAULT 'home',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_faq_scope (page_scope, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_categories (
  id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(140) NOT NULL,
  description VARCHAR(300) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bcat_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_posts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_id    BIGINT UNSIGNED NOT NULL,
  category_id  BIGINT UNSIGNED NULL,
  title        VARCHAR(220) NOT NULL,
  slug         VARCHAR(240) NOT NULL,
  excerpt      VARCHAR(400) NULL,
  body_html    MEDIUMTEXT NOT NULL,
  cover_url    VARCHAR(255) NULL,
  status       ENUM('DRAFT','SCHEDULED','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  seo_title    VARCHAR(180) NULL,
  seo_description VARCHAR(320) NULL,
  read_minutes TINYINT UNSIGNED NOT NULL DEFAULT 3,
  view_count   INT UNSIGNED NOT NULL DEFAULT 0,
  published_at DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bpost_slug (slug),
  KEY idx_bpost_live (status, published_at),
  FULLTEXT KEY ft_blog (title, excerpt),
  CONSTRAINT fk_bpost_author FOREIGN KEY (author_id) REFERENCES users(id),
  CONSTRAINT fk_bpost_cat FOREIGN KEY (category_id) REFERENCES blog_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_tags (
  id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_btag_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE blog_post_tags (
  post_id BIGINT UNSIGNED NOT NULL,
  tag_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  KEY idx_bpt_tag (tag_id),
  CONSTRAINT fk_bpt_post FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_bpt_tag FOREIGN KEY (tag_id) REFERENCES blog_tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE contact_messages (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name         VARCHAR(120) NOT NULL,
  phone        VARCHAR(15) NOT NULL,
  subject      VARCHAR(180) NULL,
  message      VARCHAR(2000) NOT NULL,
  order_number VARCHAR(20) NULL,
  status       ENUM('NEW','IN_PROGRESS','RESOLVED') NOT NULL DEFAULT 'NEW',
  admin_note   VARCHAR(500) NULL,
  handled_by   BIGINT UNSIGNED NULL,
  ip_address   VARCHAR(45) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contact_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
--  SEED — PERMISSIONS
-- =====================================================================
INSERT INTO permissions (code, label, group_name, is_dangerous) VALUES
('orders.view',            'Orders dekhna',                  'orders', 0),
('orders.update_status',   'Order status badalna',           'orders', 0),
('orders.cancel',          'Order cancel karna',             'orders', 1),
('orders.adjust',          'Order me quantity/item badalna', 'orders', 1),
('orders.view_all',        'Sabhi customers ke orders',      'orders', 0),
('delivery.assign',        'Delivery boy assign karna',      'delivery', 0),
('delivery.reassign',      'Delivery dobara assign karna',   'delivery', 0),
('delivery.track',         'Live tracking dekhna',           'delivery', 0),
('delivery.settle_cod',    'COD cash jama lena',             'delivery', 1),
('products.view',          'Products dekhna',                'catalog', 0),
('products.manage',        'Product add/edit/delete',        'catalog', 1),
('products.price_change',  'Price badalna',                  'catalog', 1),
('categories.manage',      'Categories manage karna',        'catalog', 1),
('inventory.view',         'Stock dekhna',                   'inventory', 0),
('inventory.manage',       'Stock badalna',                  'inventory', 1),
('customers.view',         'Customers dekhna',               'customers', 0),
('customers.manage',       'Customer disable/edit',          'customers', 1),
('staff.view',             'Staff list dekhna',              'staff', 0),
('staff.create',           'Naya staff banana',              'staff', 1),
('staff.manage',           'Staff enable/disable/edit',      'staff', 1),
('permissions.manage',     'Permissions dena/lena',          'staff', 1),
('payments.view',          'Payments dekhna',                'payments', 0),
('payments.verify',        'UPI payment verify karna',       'payments', 1),
('payments.refund',        'Refund karna',                   'payments', 1),
('coupons.manage',         'Coupons manage karna',           'marketing', 1),
('prescriptions.review',   'Parchi (prescription) jaanchna', 'pharmacy', 1),
('content.manage',         'Blog/pages/FAQ manage karna',    'content', 0),
('reports.view',           'Reports dekhna',                 'reports', 0),
('audit.view',             'Audit logs dekhna',              'system', 0),
('settings.manage',        'Settings badalna',               'system', 1),
('suppliers.manage',       'Suppliers manage karna',         'catalog', 1),
('service_area.manage',    'Delivery boundary badalna',      'system', 1),
('service_area.view',      'Area requests dekhna',           'system', 0),
('villages.manage',        'Gaon add/edit/on-off karna',     'system', 1);

-- ADMIN ko sab kuch (code me bhi ADMIN bypass hai, ye documentation ke liye)
INSERT INTO role_permissions (role, permission_code)
  SELECT 'ADMIN', code FROM permissions;

-- SUPERVISOR — operational only. ⚠️ staff.* aur settings.* JAANBUJH KAR nahi diye (§5)
INSERT INTO role_permissions (role, permission_code) VALUES
('SUPERVISOR','orders.view'), ('SUPERVISOR','orders.update_status'),
('SUPERVISOR','orders.cancel'), ('SUPERVISOR','orders.adjust'),
('SUPERVISOR','orders.view_all'),
('SUPERVISOR','delivery.assign'), ('SUPERVISOR','delivery.reassign'),
('SUPERVISOR','delivery.track'),
('SUPERVISOR','products.view'), ('SUPERVISOR','inventory.view'),
('SUPERVISOR','inventory.manage'),
('SUPERVISOR','customers.view'), ('SUPERVISOR','staff.view'),
('SUPERVISOR','payments.view'), ('SUPERVISOR','reports.view'),
('SUPERVISOR','service_area.view'), ('SUPERVISOR','villages.manage');
-- SUPERVISOR gaon add/on-off kar sakta hai (rozana ka operational kaam hai —
-- "Rampur ka naya tola bhi serve karna hai"), par boundary nahi badal sakta.
-- ⚠️ SUPERVISOR ko `service_area.manage` JAANBUJH KAR nahi diya — boundary badalna
--    business ka faisla hai, operational nahi. ADMIN chahe to grant kar sakta hai.

-- DELIVERY_BOY — sirf apna kaam
INSERT INTO role_permissions (role, permission_code) VALUES
('DELIVERY_BOY','orders.view');

-- CUSTOMER ko koi staff permission nahi (uska access ownership se aata hai)

-- =====================================================================
--  SEED — SETTINGS
-- =====================================================================
INSERT INTO settings (`key`, `value`, `type`, `group_name`, `label`, is_public) VALUES
('site_name',              'Fatanpur Bazaar',   'string','brand','Site ka naam',1),
('site_name_hi',           'फतनपुर बाज़ार',       'string','brand','Hindi naam',1),
('support_phone',          '',                   'string','brand','Support number',1),
('whatsapp_number',        '',                   'string','brand','WhatsApp number',1),
('center_lat',             '25.7420000',         'decimal','geo','Bazaar latitude',0),
('center_lng',             '81.9540000',         'decimal','geo','Bazaar longitude',0),
('service_radius_km',      '6',                  'decimal','geo','Delivery radius (km)',1),
('boundary_mode',          'VILLAGE_PLUS_ZONE',  'string','geo','VILLAGE_ONLY | ZONE_ONLY | VILLAGE_PLUS_ZONE',0),
('gps_accuracy_threshold_m','500',               'int','geo','Isse kharab GPS pe block mat karo',0),
('allow_unlisted_inside_zone','1',               'bool','geo','Zone ke andar hai par gaon list me nahi → allow + admin flag',0),
('block_outside_hard',     '1',                  'bool','geo','Checkout pe bahar wale ko hard block',0),
('area_lead_capture',      '1',                  'bool','geo','Bahar wale ka number lo (expansion list)',0),
('delivery_fee',           '20.00',              'decimal','order','Delivery fee',1),
('free_delivery_above',    '299.00',             'decimal','order','Free delivery above',1),
('min_order',              '99.00',              'decimal','order','Minimum order',1),
('rider_per_delivery',     '20.00',              'decimal','order','Rider earning per delivery',0),
('referral_reward',        '50.00',              'decimal','order','Referral reward',1),
('referral_min_order',     '199.00',             'decimal','order','Referral min order',0),
('referral_daily_cap',     '3',                  'int','order','Referral daily cap',0),
('order_auto_cancel_min',  '30',                 'int','order','Confirm na ho to auto-cancel (min)',0),
('rx_pending_timeout_hours','24',                'int','order','Parchi review ka intezaar (ghante)',0),
('cod_unverified_limit',   '500.00',             'decimal','order','Phone verify nahi to COD limit',0),
('trust_orders_needed',    '1',                  'int','order','Trusted hone ke liye delivered orders',0),
('order_adjust_enabled',   '1',                  'bool','order','Taul/stock adjustment allowed',0),
('cod_enabled',            '1',                  'bool','payment','COD on/off',1),
('upi_enabled',            '1',                  'bool','payment','UPI on/off',1),
('upi_vpa',                '',                   'string','payment','HDFC UPI ID',0),
('upi_payee_name',         'Fatanpur Bazaar',    'string','payment','UPI payee name',0),
('upi_auto_accept_limit',  '500.00',             'decimal','payment','Isse upar admin verify ke bina confirm nahi',0),
('prepaid_required_before_pickup','1',           'bool','payment','Non-COD pickup se pehle PAID zaroori',0),
('gateway_enabled',        '0',                  'bool','payment','Payment gateway on/off',0),
('gateway_driver',         'razorpay',           'string','payment','Gateway driver',0),
('otp_driver',             'null',               'string','auth','SMS driver: null|fast2sms|msg91',0),
('otp_length',             '6',                  'int','auth','OTP length',0),
('otp_ttl_seconds',        '300',                'int','auth','OTP validity',0),
('otp_max_attempts',       '3',                  'int','auth','OTP max galat koshish',0),
('otp_resend_cooldown_sec','60',                 'int','auth','Resend cooldown',0),
('access_token_ttl_min',   '15',                 'int','auth','Access token minutes',0),
('refresh_token_ttl_days', '30',                 'int','auth','Refresh token days',0),
('vertical_VEGETABLES_enabled','1',              'bool','vertical','Sabzi',1),
('vertical_FRUITS_enabled',    '1',              'bool','vertical','Phal',1),
('vertical_GROCERY_enabled',   '1',              'bool','vertical','Kirana',1),
('vertical_PHARMACY_enabled',  '0',              'bool','vertical','Dawai (drug license ke baad)',1),
('vertical_AGRI_INPUT_enabled','0',              'bool','vertical','Kheti ka saman',1),
('vertical_SERVICE_enabled',   '0',              'bool','vertical','Services (booking)',1),
('service_slot_minutes',   '120',                'int','service','Ek slot kitne minute ka',0),
('service_open_time',      '08:00',              'string','service','Service din ka start',0),
('service_close_time',     '19:00',              'string','service','Service din ka end',0),
('tracking_ping_seconds',  '15',                 'int','tracking','Rider ping interval',0),
('tracking_persist_meters','100',                'int','tracking','Itna hile tabhi DB me save',0),
('tracking_stale_seconds', '90',                 'int','tracking','Isse purani location = stale',0),
('tracking_auto_end_min',  '120',                'int','tracking','Itni der baad session band',0),
('reviews_enabled',        '1',                  'bool','content','Reviews on/off',1),
('blog_enabled',           '1',                  'bool','content','Blog on/off',1),
('push_enabled',           '1',                  'bool','system','Push on/off',0),
('maintenance_mode',       '0',                  'bool','system','Maintenance mode',0),
('rx_retention_days',      '365',                'int','system','Parchi kitne din rakhein',0);

-- =====================================================================
--  SEED — DEFAULT SERVICE ZONE (6 km radius)
--  ⚠️ center_lat/lng approximate hain. Admin panel ke map editor se exact karo.
--  Baad me isi row ko mode='POLYGON' me badal kar map pe boundary kheench sakte ho.
-- =====================================================================
INSERT INTO service_zones
  (name, name_hi, mode, center_lat, center_lng, radius_km,
   bbox_min_lat, bbox_max_lat, bbox_min_lng, bbox_max_lng,
   delivery_fee, min_order, eta_minutes, priority, is_active, note)
VALUES
  ('Fatanpur 6 km', 'फतनपुर 6 किमी', 'RADIUS', 25.7420000, 81.9540000, 6.00,
   25.6880000, 25.7960000, 81.8940000, 82.0140000,
   20.00, 99.00, 45, 10, 1,
   'Default zone. Exact center admin map editor se set karein.');
