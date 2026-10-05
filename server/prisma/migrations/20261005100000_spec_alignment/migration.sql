-- Align with the product spec: one status model (new / in_progress / paused /
-- completed / picked_up / cancelled), resolution type, replacement items,
-- installation-date warranty, part cost price, product categories, feedback tags.

-- 1. New enums and request columns
CREATE TYPE "ResolutionType" AS ENUM ('repair', 'replace');
CREATE TYPE "PickupConfirmationType" AS ENUM ('tap', 'signature');

ALTER TABLE "service_requests" ADD COLUMN "resolution_type" "ResolutionType";
ALTER TABLE "service_requests" ADD COLUMN "assigned_at" TIMESTAMP(3);
ALTER TABLE "service_requests" ADD COLUMN "pickup_confirmation_type" "PickupConfirmationType";
ALTER TABLE "service_requests" RENAME COLUMN "pickup_confirmed_at" TO "picked_up_at";

-- 2. Backfill from the old status values before they are collapsed
UPDATE "service_requests" SET "resolution_type" = 'replace' WHERE "status"::text = 'replaced';
UPDATE "service_requests" SET "resolution_type" = 'repair'
  WHERE "type" = 'repair' AND "status"::text IN ('closed', 'ready_for_pickup');
UPDATE "service_requests" SET "assigned_at" = "created_at" WHERE "assigned_technician_id" IS NOT NULL;
UPDATE "service_requests" SET "pickup_confirmation_type" =
  CASE WHEN "pickup_signature_url" IS NOT NULL THEN 'signature'::"PickupConfirmationType" ELSE 'tap'::"PickupConfirmationType" END
  WHERE "picked_up_at" IS NOT NULL;

-- 3. Collapse the status enum
ALTER TABLE "service_requests" ALTER COLUMN "status" TYPE TEXT USING "status"::text;

UPDATE "service_requests" SET "status" =
  CASE
    WHEN "status" IN ('replaced', 'closed', 'completed', 'ready_for_pickup') THEN
      CASE WHEN "picked_up_at" IS NOT NULL THEN 'picked_up' ELSE 'completed' END
    WHEN EXISTS (
      SELECT 1 FROM "request_pauses" p
      WHERE p."service_request_id" = "service_requests"."id" AND p."resumed_at" IS NULL
    ) THEN 'paused'
    WHEN "status" IN ('scheduled', 'received') THEN 'new'
    ELSE 'in_progress'
  END;

CREATE TYPE "RequestStatus_new" AS ENUM ('new', 'in_progress', 'paused', 'completed', 'picked_up', 'cancelled');
ALTER TABLE "service_requests" ALTER COLUMN "status" TYPE "RequestStatus_new" USING "status"::"RequestStatus_new";
DROP TYPE "RequestStatus";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";

-- 4. Staff, sales, parts
ALTER TABLE "staff_users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "sales" ADD COLUMN "installation_date" DATE;
UPDATE "sales" s SET
  "installation_date" = (r."completed_at" AT TIME ZONE 'Asia/Tashkent')::date,
  "warranty_expiry" = ((r."completed_at" AT TIME ZONE 'Asia/Tashkent')::date + (s."warranty_months" || ' months')::interval)::date
FROM "service_requests" r
WHERE r."sale_id" = s."id" AND r."type" = 'installation' AND r."completed_at" IS NOT NULL;

-- Existing parts keep their previous profit behaviour (cost = sell price) until an admin edits the cost.
ALTER TABLE "spare_parts" ADD COLUMN "cost_price" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "spare_parts" SET "cost_price" = "price";

-- 5. Applicable product categories (many per service / part)
ALTER TABLE "service_catalog_items" ADD COLUMN "product_categories" TEXT[];
UPDATE "service_catalog_items" SET "product_categories" = ARRAY["product_category"];
ALTER TABLE "service_catalog_items" DROP COLUMN "product_category";
DROP INDEX IF EXISTS "service_catalog_items_product_category_idx";

ALTER TABLE "spare_parts" ADD COLUMN "product_categories" TEXT[];
UPDATE "spare_parts" SET "product_categories" = ARRAY["product_category"];
ALTER TABLE "spare_parts" DROP COLUMN "product_category";
DROP INDEX IF EXISTS "spare_parts_product_category_idx";

-- 6. Product categories table
CREATE TABLE "product_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

INSERT INTO "product_categories" ("id", "name")
SELECT gen_random_uuid()::text, c FROM (
  SELECT "category" AS c FROM "products"
  UNION SELECT unnest("product_categories") FROM "service_catalog_items"
  UNION SELECT unnest("product_categories") FROM "spare_parts"
) names WHERE c IS NOT NULL AND c <> '';

ALTER TABLE "products" ADD CONSTRAINT "products_category_fkey"
  FOREIGN KEY ("category") REFERENCES "product_categories"("name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Replacement items and feedback tags
CREATE TABLE "replacement_items" (
  "id" TEXT NOT NULL,
  "service_request_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "serial_number" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "replacement_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "replacement_items_service_request_id_key" ON "replacement_items"("service_request_id");
ALTER TABLE "replacement_items" ADD CONSTRAINT "replacement_items_service_request_id_fkey"
  FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replacement_items" ADD CONSTRAINT "replacement_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feedback" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
