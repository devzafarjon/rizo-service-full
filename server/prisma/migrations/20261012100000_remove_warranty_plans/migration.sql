-- Warranty extensions (paid plans and manual goodwill months) are removed; warranty start is now a company-wide setting (warranty_starts_on).
DROP TABLE IF EXISTS "warranty_plan_purchases";
DROP TABLE IF EXISTS "warranty_plans";
ALTER TABLE "products" DROP COLUMN IF EXISTS "warranty_starts_on";
ALTER TABLE "sales" DROP COLUMN IF EXISTS "extension_months", DROP COLUMN IF EXISTS "extension_reason";
