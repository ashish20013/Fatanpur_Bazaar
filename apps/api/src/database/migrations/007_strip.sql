-- Header ke neeche wali patli patti — malik ke control me, code me nahi.
-- Abhi wahan ek banaya hua gaon ka drishya dikhta hai. Jab malik apne delivery boy ki asli
-- photo khinche, wo `strip_image_url` me daal dega aur patti me wahi dikhne lagegi — code
-- chhuye bina. Photo chaudi-patli honi chahiye (kam se kam 1200×200), warna crop ho jayegi.
-- `strip_subtitle` me ek space dalne ka matlab hai "doosri line nahi chahiye" (khali = default).
INSERT INTO settings (`key`, value, type, group_name, label, is_public) VALUES
  ('strip_enabled',   '1', 'bool',   'content', 'हेडर के नीचे पट्टी दिखाएँ', 1),
  ('strip_image_url', '',  'string', 'content', 'पट्टी की फ़ोटो (चौड़ी-पतली, कम से कम 1200×200)', 1),
  ('strip_title',     '',  'string', 'content', 'पट्टी की पहली लाइन (खाली = तय लाइन)', 1),
  ('strip_subtitle',  '',  'string', 'content', 'पट्टी की दूसरी लाइन (खाली = तय लाइन, एक स्पेस = कोई लाइन नहीं)', 1)
ON DUPLICATE KEY UPDATE value = IF(updated_by IS NULL, VALUES(value), value);
