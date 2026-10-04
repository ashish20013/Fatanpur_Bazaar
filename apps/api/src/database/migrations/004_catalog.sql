-- ============================================================================
-- 004 — catalog expansion (owner's Sept-2026 brief). Additive only, same rules as 002/003:
-- no existing column is dropped or changed, every INSERT is IGNORE, every settings UPDATE is
-- guarded by `updated_by IS NULL` so an admin's own choice is never reverted.
-- ============================================================================

-- The owner does NOT hold a drug / fertiliser / fireworks / pathology licence. For every such item
-- the shop is only the DELIVERY PARTNER: the licensed shop sells against its own bill. That is a
-- fact about the supplier, not about each product, so it lives on `suppliers` and is shown on the
-- product card / page exactly like the supplier name (same `show_on_product` flag).
ALTER TABLE suppliers
  ADD COLUMN mediator_note    VARCHAR(180) NULL AFTER show_on_product,
  ADD COLUMN mediator_note_en VARCHAR(180) NULL AFTER mediator_note;

-- Until now the tile icon came from the product's category, so every item in a category looked the
-- same. With ~150 new items in five categories (fireworks + diyas, seeds + fertiliser + pesticide,
-- tablets + syrups + test kits) one icon per category is useless, so a product may carry its own.
-- NULL keeps the old behaviour: COALESCE(p.icon, c.icon, pc.icon).
ALTER TABLE products ADD COLUMN icon VARCHAR(40) NULL AFTER slug;

-- Medicines (Sharma Medical Store) and seeds/fertiliser (Anil Beej Bhandar) are now sold through
-- their own licensed shops, so the two verticals go live. Only flipped if no admin ever touched it.
UPDATE settings SET `value` = '1' WHERE `key` = 'vertical_PHARMACY_enabled'   AND updated_by IS NULL;
UPDATE settings SET `value` = '1' WHERE `key` = 'vertical_AGRI_INPUT_enabled' AND updated_by IS NULL;

INSERT IGNORE INTO schema_migrations (version) VALUES ('004_catalog');
