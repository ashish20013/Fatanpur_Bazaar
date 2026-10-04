-- Owner's decisions, 25 Sept 2026. Three rules that remove friction for a village customer who
-- is ordering online for the first time, plus the switch that makes the night hours honest.

-- 1. No minimum order. "₹99 से ऊपर" turns a first-time customer away at the one moment he was
--    willing to try; a ₹25 order that arrives builds the habit that a refused ₹80 order kills.
UPDATE settings SET value = '0.00' WHERE `key` = 'min_order';

-- 2. No delivery charge — anywhere, at any basket size. The free-delivery threshold therefore
--    has no work left to do; 0 keeps the arithmetic honest instead of leaving a dead number.
UPDATE settings SET value = '0.00' WHERE `key` = 'delivery_fee';
UPDATE settings SET value = '0.00' WHERE `key` = 'free_delivery_above';
UPDATE villages SET delivery_fee = 0.00, min_order = 0.00;
-- Zones can carry their own fee/min and would silently win over the settings above.
UPDATE service_zones SET delivery_fee = 0.00, min_order = 0.00;

-- 3. The shop closes at night, but the website does not. An order placed at 11pm is a real order;
--    refusing it sends the customer to sleep annoyed and to someone else tomorrow. We accept it
--    and tell him plainly when it will arrive. Set to 0 to go back to refusing after hours.
INSERT INTO settings (`key`, value, type, group_name, label, is_public) VALUES
  ('accept_orders_when_closed', '1', 'bool', 'order', 'Accept orders while the shop is closed', 1)
ON DUPLICATE KEY UPDATE value = VALUES(value);

-- 4. UPI without the UTR step (A17): a customer who has paid taps "I have paid" and his order is
--    confirmed at once. Above this amount it still waits for a human to check the bank app, which
--    is the only real protection a direct-VPA shop has. ₹2000 covers virtually every village order.
UPDATE settings SET value = '2000.00' WHERE `key` = 'upi_auto_accept_limit';
