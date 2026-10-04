-- Category shop photographs.
--
-- The rail shows a photograph of a real shop front now, not a drawing, so these files ship with the
-- repo under storage/uploads/categories/seed/ and this migration points each category at them.
--
-- They sit in seed/ rather than in the dated upload folders on purpose: .gitignore keeps all of
-- storage/ out of the repo, and seed/ is the one exception carved out for it. That keeps the rule
-- honest — files a migration names must travel with the code, files a shopkeeper uploads must not.
-- Their names carry no random suffix for the same reason: a migration has to be able to name them.
--
-- Only rows that still have no picture are touched, so re-running this never undoes a photo the
-- shopkeeper uploaded himself through Admin → Categories → Photo (that one gets a hashed name in a
-- dated folder and stays untracked, as an upload should).
UPDATE categories SET image_url = '/uploads/categories/seed/cat-kirana-600.webp',            image_url_sm = '/uploads/categories/seed/cat-kirana-320.webp'            WHERE slug = 'kirana'            AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-fal-sabzi-600.webp',         image_url_sm = '/uploads/categories/seed/cat-fal-sabzi-320.webp'         WHERE slug = 'fal-sabzi'         AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-fast-food-600.webp',         image_url_sm = '/uploads/categories/seed/cat-fast-food-320.webp'         WHERE slug = 'fast-food'         AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-mithai-600.webp',            image_url_sm = '/uploads/categories/seed/cat-mithai-320.webp'            WHERE slug = 'mithai'            AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-electronics-600.webp',       image_url_sm = '/uploads/categories/seed/cat-electronics-320.webp'       WHERE slug = 'electronics'       AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-beauty-600.webp',            image_url_sm = '/uploads/categories/seed/cat-beauty-320.webp'            WHERE slug = 'beauty'            AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-kapde-600.webp',             image_url_sm = '/uploads/categories/seed/cat-kapde-320.webp'             WHERE slug = 'kapde'             AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-joote-chappal-600.webp',     image_url_sm = '/uploads/categories/seed/cat-joote-chappal-320.webp'     WHERE slug = 'joote-chappal'     AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-building-material-600.webp', image_url_sm = '/uploads/categories/seed/cat-building-material-320.webp' WHERE slug = 'building-material' AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-body-checkup-600.webp',      image_url_sm = '/uploads/categories/seed/cat-body-checkup-320.webp'      WHERE slug = 'body-checkup'      AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-dawai-600.webp',             image_url_sm = '/uploads/categories/seed/cat-dawai-320.webp'             WHERE slug = 'dawai'             AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-bhada-gadi-600.webp',        image_url_sm = '/uploads/categories/seed/cat-bhada-gadi-320.webp'        WHERE slug = 'bhada-gadi'        AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-beej-bhandar-600.webp',      image_url_sm = '/uploads/categories/seed/cat-beej-bhandar-320.webp'      WHERE slug = 'beej-bhandar'      AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-doctor-consult-600.webp',    image_url_sm = '/uploads/categories/seed/cat-doctor-consult-320.webp'    WHERE slug = 'doctor-consult'    AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-patakha-600.webp',           image_url_sm = '/uploads/categories/seed/cat-patakha-320.webp'           WHERE slug = 'patakha'           AND (image_url IS NULL OR image_url = '');
UPDATE categories SET image_url = '/uploads/categories/seed/cat-birthday-600.webp',          image_url_sm = '/uploads/categories/seed/cat-birthday-320.webp'          WHERE slug = 'birthday'          AND (image_url IS NULL OR image_url = '');
