-- Owner's rule (Sept 2026): the phone's own location is always captured when an address is saved,
-- even when the customer is NOT standing at the delivery point — the admin and the delivery partner
-- want to know where the order was actually placed from. The delivery point itself stays in
-- addresses.latitude/longitude; these columns are only the order's origin, plus the answer to
-- "are you at the place where you want the goods?". Additive only.
ALTER TABLE address_extras
  ADD COLUMN origin_lat DECIMAL(10,7) NULL,
  ADD COLUMN origin_lng DECIMAL(10,7) NULL,
  ADD COLUMN origin_accuracy_m SMALLINT UNSIGNED NULL,
  ADD COLUMN ordered_from_here TINYINT(1) NULL;

ALTER TABLE order_ship_extras
  ADD COLUMN origin_lat DECIMAL(10,7) NULL,
  ADD COLUMN origin_lng DECIMAL(10,7) NULL,
  ADD COLUMN origin_accuracy_m SMALLINT UNSIGNED NULL,
  ADD COLUMN ordered_from_here TINYINT(1) NULL;

-- The district is fixed for the whole service area; the customer never types it.
INSERT INTO settings (`key`, value, type, group_name, label, is_public)
VALUES ('default_district', 'प्रतापगढ़', 'STRING', 'delivery', 'ज़िला (तय)', 1)
ON DUPLICATE KEY UPDATE value = IF(updated_by IS NULL, VALUES(value), value);
