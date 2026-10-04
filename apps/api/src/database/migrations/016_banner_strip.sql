-- The advertising strip above the goods, and the two knobs that drive it.
--
-- The slot itself is a banner row with position='HOME_TOP' — that already exists and the owner
-- manages it from Admin → Banners. What was missing is the pair of settings that decide whether
-- the strip appears at all and how long each slide holds, because "turn the ads off tonight" and
-- "they flick past too fast" are decisions he has to be able to make without a developer.
--
-- ⚠️ Both are PUBLIC: the website reads them server-side to render the strip. Neither carries
-- anything private — one is a yes/no and the other is a number of seconds.
INSERT IGNORE INTO settings (`key`, `value`, `type`, `group_name`, `label`, is_public) VALUES
('home_banner_enabled', '1', 'bool', 'brand', 'Show the advertising strip on the home page', 1),
-- Five seconds is the owner's figure. The renderer clamps it to 2–30 whatever lands here, so a
-- stray "0" cannot turn the strip into a flicker nobody can read.
('home_banner_seconds', '5', 'int',  'brand', 'Seconds each banner holds before sliding',    1);
