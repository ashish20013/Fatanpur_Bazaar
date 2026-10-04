-- Ek din ka order counter. Pehle har order MAX(order_number) padh kar +1 karta tha; jab do
-- customer ek hi second me order karte hain to dono ko same number milta tha aur doosre ka
-- order duplicate-key se fail ho jaata tha (test me 10 me se 6 fail hue).
-- Ab counter ek hi atomic statement se badhta hai, isliye number kabhi takraata nahi.
CREATE TABLE IF NOT EXISTS order_counters (
  ymd CHAR(8) NOT NULL,
  seq INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (ymd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jis din ye migration chalti hai us din ke orders pehle se ho sakte hain — counter wahin se
-- shuru karo, warna pehla naya order FB-YYYYMMDD-0001 maangega jo already maujood hai.
INSERT INTO order_counters (ymd, seq)
SELECT SUBSTRING(order_number, 4, 8) AS ymd, MAX(CAST(SUBSTRING(order_number, 13) AS UNSIGNED)) AS seq
  FROM orders
 WHERE order_number LIKE 'FB-%'
 GROUP BY SUBSTRING(order_number, 4, 8)
ON DUPLICATE KEY UPDATE seq = GREATEST(order_counters.seq, VALUES(seq));
