-- Seed: 006_seed_service_categories.sql
-- 5 categories (these are already seeded in the migration, but ensure idempotency)
-- The migration 00000000000009 already inserts these categories.
-- This seed ensures they exist if migration seed was skipped.

INSERT INTO service_category (category_name, category_icon_name, category_sort_order)
VALUES
  ('Emergency Services', 'emergency', 1),
  ('Financial Assistance', 'wallet', 2),
  ('Recovery Support', 'build', 3),
  ('Reporting', 'analytics', 4),
  ('Information', 'information-circle', 5)
ON CONFLICT (category_name) DO NOTHING;
