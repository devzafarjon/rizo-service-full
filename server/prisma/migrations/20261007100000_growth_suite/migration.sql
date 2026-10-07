-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StaffRole" ADD VALUE 'accountant';
ALTER TYPE "StaffRole" ADD VALUE 'warehouse';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "anonymized_at" TIMESTAMP(3),
ADD COLUMN     "deletion_requested_at" TIMESTAMP(3),
ADD COLUMN     "preferred_channel" VARCHAR(10) NOT NULL DEFAULT 'both';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "fiscal_receipt_number" TEXT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "external_id" TEXT;

-- AlterTable
ALTER TABLE "service_centers" ADD COLUMN     "is_partner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payout_fixed_per_job" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payout_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "completion_checklist" JSONB,
ADD COLUMN     "escalated_at" TIMESTAMP(3),
ADD COLUMN     "escalation_level" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "eta_minutes" INTEGER,
ADD COLUMN     "eta_set_at" TIMESTAMP(3),
ADD COLUMN     "visit_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "visit_reschedule_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "visit_slot" VARCHAR(11);

-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN     "base_lat" DOUBLE PRECISION,
ADD COLUMN     "base_lng" DOUBLE PRECISION,
ADD COLUMN     "skill_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totp_secret" TEXT;

-- CreateTable
CREATE TABLE "technician_stocks" (
    "id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "spare_part_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "spare_part_id" TEXT NOT NULL,
    "technician_id" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "service_request_id" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "product_category" TEXT,
    "items" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_articles" (
    "id" TEXT NOT NULL,
    "product_category" TEXT,
    "product_id" TEXT,
    "title_uz" TEXT NOT NULL DEFAULT '',
    "title_ru" TEXT NOT NULL DEFAULT '',
    "title_en" TEXT NOT NULL DEFAULT '',
    "body_uz" TEXT NOT NULL DEFAULT '',
    "body_ru" TEXT NOT NULL DEFAULT '',
    "body_en" TEXT NOT NULL DEFAULT '',
    "video_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL DEFAULT '',
    "name_ru" TEXT NOT NULL DEFAULT '',
    "name_en" TEXT NOT NULL DEFAULT '',
    "months" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "product_categories" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_plan_purchases" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "payment_method" "PaymentMethod",
    "fiscal_receipt_number" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),
    "created_by_name" TEXT,

    CONSTRAINT "warranty_plan_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "technician_stocks_technician_id_spare_part_id_key" ON "technician_stocks"("technician_id", "spare_part_id");

-- CreateIndex
CREATE INDEX "stock_movements_spare_part_id_idx" ON "stock_movements"("spare_part_id");

-- CreateIndex
CREATE INDEX "stock_movements_technician_id_idx" ON "stock_movements"("technician_id");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "checklist_templates_kind_product_category_idx" ON "checklist_templates"("kind", "product_category");

-- CreateIndex
CREATE INDEX "help_articles_product_category_idx" ON "help_articles"("product_category");

-- CreateIndex
CREATE INDEX "warranty_plan_purchases_sale_id_idx" ON "warranty_plan_purchases"("sale_id");

-- CreateIndex
CREATE INDEX "warranty_plan_purchases_status_idx" ON "warranty_plan_purchases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_external_id_key" ON "sales"("external_id");

-- AddForeignKey
ALTER TABLE "technician_stocks" ADD CONSTRAINT "technician_stocks_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_stocks" ADD CONSTRAINT "technician_stocks_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_plan_purchases" ADD CONSTRAINT "warranty_plan_purchases_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_plan_purchases" ADD CONSTRAINT "warranty_plan_purchases_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "warranty_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_plan_purchases" ADD CONSTRAINT "warranty_plan_purchases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

