-- ============================================================================
-- 003 — owner redesign (Sept 2026). Additive only, same rules as 002:
-- schema.sql stays the single source of truth, no existing column is touched,
-- every INSERT is IGNORE, so re-running never overwrites owner edits.
-- See ASSUMPTIONS.md §"Redesign 2026-09" for the reasoning behind each item.
-- ============================================================================

-- Rural address details. In a village the house is found by "whose son", which road and which
-- direction — not by a street number. `addresses` has no column for these, so they live in a
-- 1:1 side table (same pattern as 002's address_area_flags).
CREATE TABLE IF NOT EXISTS address_extras (
  address_id      BIGINT UNSIGNED NOT NULL,
  guardian_name   VARCHAR(120) NULL,
  alt_phone       VARCHAR(15)  NULL,
  district        VARCHAR(80)  NULL,
  pincode         CHAR(6)      NULL,
  directions      VARCHAR(500) NULL,
  delivery_note   VARCHAR(300) NULL,
  location_method ENUM('GPS','MAP_PIN','DESCRIBED') NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (address_id),
  CONSTRAINT fk_aext_address FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Snapshot of the same details at order time (orders.ship_* is a snapshot too): editing or deleting
-- an address later must never change what the rider sees for an order already placed.
CREATE TABLE IF NOT EXISTS order_ship_extras (
  order_id        BIGINT UNSIGNED NOT NULL,
  guardian_name   VARCHAR(120) NULL,
  alt_phone       VARCHAR(15)  NULL,
  district        VARCHAR(80)  NULL,
  pincode         CHAR(6)      NULL,
  directions      VARCHAR(500) NULL,
  delivery_note   VARCHAR(300) NULL,
  location_method ENUM('GPS','MAP_PIN','DESCRIBED') NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (order_id),
  CONSTRAINT fk_oext_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Owner rule: "admin gives the supervisor access, the supervisor gives the delivery boy access".
-- A holder of this permission may create / disable / re-enable DELIVERY_BOY accounts only, and may
-- grant them only RIDER_GRANTABLE_PERMISSIONS (shared-types). Never admins, never supervisors.
INSERT IGNORE INTO permissions (code, label, group_name, is_dangerous) VALUES
('staff.manage_riders', 'Delivery partner jodna / band karna', 'staff', 1);
INSERT IGNORE INTO role_permissions (role, permission_code) VALUES
('SUPERVISOR', 'staff.manage_riders');

INSERT IGNORE INTO settings (`key`, `value`, `type`, `group_name`, `label`, is_public) VALUES
('show_upcoming_categories', '1',          'bool',   'catalog', 'Licence baaki wali shreni rail me "जल्द" ke saath dikhe (bina link)', 1),
('delivery_window_label',    '30–60 मिनट', 'string', 'order',   'Header me delivery ka waada', 1),
('delivery_timer_minutes',   '30',         'int',    'order',   'Order timer: pehle itne minute hara, phir itne hi peela', 1),
('default_district',         'प्रतापगढ़',   'string', 'geo',     'Pata form ka default zila', 1),
('default_pincode',          '',           'string', 'geo',     'Pata form ka default pincode (khaali = grahak bharega)', 1),
('require_location',         '1',          'bool',   'geo',     'Pata sahejne ke liye location zaroori (GPS / map pin / raasta likhna)', 1);

-- Doctors, health check-ups and vehicle hire are services the owner wants live from day one
-- (Sept-2026 brief). Only flipped if no admin has ever touched the switch.
UPDATE settings SET `value` = '1' WHERE `key` = 'vertical_SERVICE_enabled' AND updated_by IS NULL;

INSERT IGNORE INTO schema_migrations (version) VALUES ('003_redesign');

-- The first seed generated "name on a green square" placeholder photos. They look machine-made and
-- carry no information, so they are removed: the site now shows designed label tiles until the
-- owner uploads real photos (admin → Products → photo). Real uploads never live under /seed/.
DELETE FROM product_images WHERE url LIKE '%/products/seed/%';
UPDATE order_items SET image_url = NULL WHERE image_url LIKE '%/products/seed/%';

-- Admin-typed search keywords, kept verbatim so the product editor can show them again
-- (products.search_text is derived from name + synonyms + these and cannot be split back).
CREATE TABLE IF NOT EXISTS product_keywords (
  product_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  keywords   VARCHAR(500) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_keywords_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
