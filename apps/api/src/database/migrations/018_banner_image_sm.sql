-- Banner images are uploaded at two widths (640 w for mobile, 1280 w for desktop) but only
-- the 1280 w URL was stored. The 640 w was reverse-engineered at query time by regex-replacing
-- the suffix — fragile (breaks if the slug itself contains "-1280"), and impossible to verify
-- against disk. This column stores the 640 w URL from the upload pipeline so both are DB-backed.
ALTER TABLE banners ADD COLUMN image_url_sm VARCHAR(500) DEFAULT NULL AFTER image_url;

-- Backfill existing rows: the 640 w file is always stored at the same path with -640 instead
-- of -1280. Only touch rows that actually have image_url set.
UPDATE banners SET image_url_sm = REPLACE(image_url, '-1280.webp', '-640.webp')
  WHERE image_url IS NOT NULL AND image_url LIKE '%-1280.webp';
