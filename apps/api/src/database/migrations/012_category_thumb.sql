-- A category's photo is shown at 62–70 px in the rail and 44 px in a section heading, yet the
-- column only held the 600 px file. Twenty of those on the home page is ~600 KB of pictures nobody
-- ever sees at full size — on a 3G phone in a village that is most of the page.
--
-- The 200 px variant is already written to disk at upload (ImagesService makes 200/600/1200), so
-- this only stores its URL, exactly as product_images already keeps `url` and `url_sm` side by
-- side. Existing rows are backfilled by name, since the files are named `<base>-<width>.webp`.

ALTER TABLE categories ADD COLUMN image_url_sm VARCHAR(255) NULL AFTER image_url;

UPDATE categories
   SET image_url_sm = REPLACE(image_url, '-600.webp', '-200.webp')
 WHERE image_url IS NOT NULL
   AND image_url LIKE '%-600.webp'
   AND image_url_sm IS NULL;
