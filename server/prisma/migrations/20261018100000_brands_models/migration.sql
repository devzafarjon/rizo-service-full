-- Brands, models by other makers, the technician's "I repair" list and the admin queue override.
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "is_own" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by_name" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brands_key_key" ON "brands"("key");

-- The company's own brand; every existing product belongs to it.
INSERT INTO "brands" ("id", "name", "key", "is_own") VALUES ('brand_rizo', 'RIZO', 'rizo', true);

ALTER TABLE "products" ADD COLUMN "brand_id" TEXT NOT NULL DEFAULT 'brand_rizo';
ALTER TABLE "products" ADD COLUMN "added_by_name" TEXT;
ALTER TABLE "products" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX "products_brand_id_idx" ON "products"("brand_id");
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "staff_skills" (
    "id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "brand_id" TEXT,
    "product_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_skills_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_skills_staff_user_id_idx" ON "staff_skills"("staff_user_id");
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_requests" ADD COLUMN "queue_override_reason" TEXT;
ALTER TABLE "service_requests" ADD COLUMN "queue_override_at" TIMESTAMP(3);
ALTER TABLE "service_requests" ADD COLUMN "queue_override_by" TEXT;
