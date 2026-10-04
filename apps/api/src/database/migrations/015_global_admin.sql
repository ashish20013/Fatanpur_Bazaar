-- Global admin, the footer the owner asked for, and the Cashfree keys he will type in later.
--
-- ⚠️ SCHEMA AND DEFAULTS ONLY. Which phone number is the global admin is seed data, not schema —
-- it lives in seeds/global-admin.ts, which is idempotent and re-runnable. A migration runs once
-- and, if the row it is looking for does not exist yet, silently does nothing and marks itself
-- applied forever. That is exactly how the category pictures went missing on the live database,
-- and it must not happen to the account that owns the shop.

-- ── Global admin ──────────────────────────────────────────────────────────────
-- Until now ADMIN meant "the owner", so a second admin was a second owner. The role now opens the
-- admin panel; this flag says whose panel it is. Exactly one row carries it.
ALTER TABLE users ADD COLUMN is_global_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER role;

-- The owner's phone in one place, so the seed and the admin screen agree on who he is.
INSERT IGNORE INTO settings (`key`, `value`, `type`, `group_name`, `label`, is_public) VALUES
('global_admin_phone', '8576891104', 'string', 'system', 'Main admin (owner) phone — server only', 0);

-- ── Footer (owner's brief: credit line, call to order, Play Store icon, nothing else) ─────────
INSERT IGNORE INTO settings (`key`, `value`, `type`, `group_name`, `label`, is_public) VALUES
('footer_credit_name',  'ASK Infotech',            'string', 'brand', 'Footer credit — name',          1),
('footer_credit_email', 'contact@askinfotech.in',  'string', 'brand', 'Footer credit — email',         1),
('footer_credit_url',   '',                        'string', 'brand', 'Footer credit — website link',  1),
-- A placeholder the owner replaces with the real listing on publication day (Admin → Settings →
-- brand → playstore_url). Clearing this value hides the badge completely, which is the right state
-- for a shop whose app is not out yet — a button that opens a "not found" page is worse than none.
('playstore_url',       'https://play.google.com/store/apps/details?id=com.fatanpurbazaar.app', 'string', 'brand', 'Play Store app link', 1),
('app_badge_enabled',   '1',                       'bool',   'brand', 'Show the app download badge',   1);

-- ── Cashfree (approval pending — every key is typed in from the admin panel) ──────────────────
-- ⚠️ cashfree_secret_key and cashfree_webhook_secret are stored ENCRYPTED (common/utils/secretbox)
-- and are never returned by the API, not even to the owner. is_public MUST stay 0 on all four.
INSERT IGNORE INTO settings (`key`, `value`, `type`, `group_name`, `label`, is_public) VALUES
('payment_gateway_driver',  'cashfree', 'string', 'payment', 'Gateway driver (cashfree / razorpay)', 0),
('cashfree_mode',           'TEST',     'string', 'payment', 'Cashfree mode — TEST or PROD',         0),
('cashfree_app_id',         '',         'string', 'payment', 'Cashfree App ID',                      0),
('cashfree_secret_key',     '',         'string', 'payment', 'Cashfree Secret Key',                  0),
('cashfree_webhook_secret', '',         'string', 'payment', 'Cashfree webhook secret',              0),
('cashfree_return_url',     '',         'string', 'payment', 'Return URL after payment (optional)',  0);
