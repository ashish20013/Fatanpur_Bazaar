-- ============================================================================
-- 002 — additive only (schema.sql stays the single source of truth; no column is changed).
-- New tables + settings rows that the algorithms in BUILD_PROMPT reference but schema.sql
-- does not seed. Every INSERT is IGNORE so re-running never overwrites owner edits.
-- See ASSUMPTIONS.md §DB for the reasoning behind each item.
-- ============================================================================

-- "आने पर बताएं" on an out-of-stock product page (A9).
CREATE TABLE IF NOT EXISTS stock_alerts (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NULL,
  phone       VARCHAR(15) NOT NULL,
  notified_at DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_alert (product_id, phone),
  KEY idx_stock_alert_pending (product_id, notified_at),
  CONSTRAINT fk_salert_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_salert_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A8.7 "मेरा गाँव इसमें नहीं है": the free-text area + the "served via GPS, new area" admin flag.
-- addresses has no column for either, so they live in a 1:1 side table.
CREATE TABLE IF NOT EXISTS address_area_flags (
  address_id   BIGINT UNSIGNED NOT NULL,
  area_text    VARCHAR(200) NULL,
  flag_new_area TINYINT(1) NOT NULL DEFAULT 0,
  reviewed_by  BIGINT UNSIGNED NULL,
  reviewed_at  DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (address_id),
  KEY idx_aaf_flag (flag_new_area, reviewed_at),
  CONSTRAINT fk_aaf_address FOREIGN KEY (address_id) REFERENCES addresses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A24 quote-based service work: technician proposes, customer approves before COMPLETED.
CREATE TABLE IF NOT EXISTS service_quotes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id  BIGINT UNSIGNED NOT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  status      ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  proposed_by BIGINT UNSIGNED NULL,
  decided_at  DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_squote_booking (booking_id),
  CONSTRAINT fk_squote_booking FOREIGN KEY (booking_id) REFERENCES service_bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Settings referenced by the algorithms but absent from schema.sql's seed.
INSERT IGNORE INTO settings (`key`, `value`, `type`, `group_name`, `label`, is_public) VALUES
('allow_admin_creation',     '0',     'bool',   'auth',     'Naya ADMIN banana allowed? (default OFF — security)', 0),
('store_open_time',          '07:00', 'string', 'order',    'Dukaan khulne ka samay (HH:MM)', 1),
('store_close_time',         '21:00', 'string', 'order',    'Dukaan band hone ka samay (HH:MM)', 1),
('store_address',            'Fatanpur Bazaar, Raniganj, Pratapgarh, Uttar Pradesh 230301', 'string', 'brand', 'Pata (NAP — Google Business jaisa)', 1),
('prep_minutes',             '20',    'int',    'order',    'Taiyari ka samay (ETA)', 0),
('minutes_per_km',           '4',     'int',    'order',    'Prati km minute (ETA)', 0),
('eta_buffer_minutes',       '10',    'int',    'order',    'ETA buffer', 0),
('default_eta_minutes',      '45',    'int',    'order',    'GPS na ho to ETA', 1),
('adjust_cancel_window_min', '5',     'int',    'order',    'Adjustment ke baad customer cancel window (min)', 0),
('review_request_delay_min', '30',    'int',    'order',    'Delivery ke kitni der baad review request', 0),
('low_stock_digest',         '1',     'bool',   'order',    'Low stock daily digest', 0),
('max_reschedules',          '2',     'int',    'service',  'Service max reschedule', 0),
('reschedule_cutoff_hours',  '2',     'int',    'service',  'Slot se kitne ghante pehle tak reschedule', 0),
('tracking_offline_seconds', '180',   'int',    'tracking', 'Itni der ping nahi → sampark toota', 0),
('cod_alert_amount',         '3000.00','decimal','payment', 'Rider cod_in_hand alert (₹)', 0),
('cod_alert_days',           '3',     'int',    'payment',  'Rider COD itne din purana → alert', 0),
('email',                    'support@fatanpurbazaar.com', 'string', 'brand', 'Support email', 1);

INSERT IGNORE INTO schema_migrations (version) VALUES ('002_additions');
