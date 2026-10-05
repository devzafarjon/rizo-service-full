-- CreateEnum
CREATE TYPE "RequestDecision" AS ENUM ('warranty_repair', 'paid_repair', 'replace', 'refund', 'reject');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('draft', 'sent', 'approved', 'declined', 'expired');

-- CreateEnum
CREATE TYPE "EstimateLineKind" AS ENUM ('service', 'part', 'labor', 'other');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card', 'transfer', 'payme', 'click', 'other');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('payment', 'refund');

-- CreateEnum
CREATE TYPE "PartOrderStatus" AS ENUM ('requested', 'ordered', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "DefectCodeKind" AS ENUM ('defect', 'return_reason');

-- CreateEnum
CREATE TYPE "SaleSource" AS ENUM ('rizo', 'registered');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'partial';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RequestStatus" ADD VALUE 'diagnosing';
ALTER TYPE "RequestStatus" ADD VALUE 'awaiting_decision';
ALTER TYPE "RequestStatus" ADD VALUE 'awaiting_parts';
ALTER TYPE "RequestStatus" ADD VALUE 'ready';
ALTER TYPE "RequestStatus" ADD VALUE 'rejected';
ALTER TYPE "RequestStatus" ADD VALUE 'replaced';
ALTER TYPE "RequestStatus" ADD VALUE 'refunded';

-- AlterEnum
ALTER TYPE "ResolutionType" ADD VALUE 'refund';

-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'receptionist';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "warranty_covers_labor" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "warranty_covers_parts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "warranty_months" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "warranty_starts_on" TEXT NOT NULL DEFAULT 'installation';

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "extension_months" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "extension_reason" TEXT,
ADD COLUMN     "is_verified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "serial_number" TEXT,
ADD COLUMN     "source" "SaleSource" NOT NULL DEFAULT 'rizo',
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "decided_at" TIMESTAMP(3),
ADD COLUMN     "decision" "RequestDecision",
ADD COLUMN     "decision_note" TEXT,
ADD COLUMN     "defect_code_id" TEXT,
ADD COLUMN     "en_route_at" TIMESTAMP(3),
ADD COLUMN     "fiscal_receipt_number" TEXT,
ADD COLUMN     "intake_checklist" JSONB,
ADD COLUMN     "intake_notes" TEXT,
ADD COLUMN     "intake_signature_url" TEXT,
ADD COLUMN     "is_repeat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legal_due_at" TIMESTAMP(3),
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "repair_warranty_until" DATE,
ADD COLUMN     "repeat_of_id" TEXT,
ADD COLUMN     "return_reason_id" TEXT,
ADD COLUMN     "scheduled_at" TIMESTAMP(3),
ADD COLUMN     "serial_number" TEXT,
ADD COLUMN     "service_center_id" TEXT,
ADD COLUMN     "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tracking_token" TEXT,
ADD COLUMN     "worked_minutes" INTEGER;

-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN     "pay_fixed_per_job" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pay_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "service_center_id" TEXT;

-- CreateTable
CREATE TABLE "service_centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region_code" VARCHAR(2) NOT NULL DEFAULT '00',
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "working_hours" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "is_authorized" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimates" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "declined_at" TIMESTAMP(3),
    "decline_reason" TEXT,
    "created_by_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_lines" (
    "id" TEXT NOT NULL,
    "estimate_id" TEXT NOT NULL,
    "kind" "EstimateLineKind" NOT NULL,
    "service_catalog_item_id" TEXT,
    "spare_part_id" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "is_selected" BOOLEAN NOT NULL DEFAULT true,
    "is_fulfilled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL DEFAULT 'payment',
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_orders" (
    "id" TEXT NOT NULL,
    "spare_part_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "PartOrderStatus" NOT NULL DEFAULT 'requested',
    "supplier" TEXT,
    "note" TEXT,
    "service_request_id" TEXT,
    "expected_at" DATE,
    "received_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_codes" (
    "id" TEXT NOT NULL,
    "kind" "DefectCodeKind" NOT NULL DEFAULT 'defect',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL DEFAULT '',
    "name_ru" TEXT NOT NULL DEFAULT '',
    "name_en" TEXT NOT NULL DEFAULT '',
    "product_category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_adjustments" (
    "id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "estimates_service_request_id_idx" ON "estimates"("service_request_id");

-- CreateIndex
CREATE INDEX "estimate_lines_estimate_id_idx" ON "estimate_lines"("estimate_id");

-- CreateIndex
CREATE INDEX "payments_service_request_id_idx" ON "payments"("service_request_id");

-- CreateIndex
CREATE INDEX "part_orders_status_idx" ON "part_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "defect_codes_kind_code_key" ON "defect_codes"("kind", "code");

-- CreateIndex
CREATE INDEX "pay_adjustments_staff_user_id_idx" ON "pay_adjustments"("staff_user_id");

-- CreateIndex
CREATE INDEX "sales_serial_number_idx" ON "sales"("serial_number");

-- Existing requests get a random, unguessable tracking token.
UPDATE "service_requests" SET "tracking_token" = md5(random()::text || clock_timestamp()::text || "id") || md5("id" || random()::text) WHERE "tracking_token" IS NULL;
ALTER TABLE "service_requests" ALTER COLUMN "tracking_token" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_tracking_token_key" ON "service_requests"("tracking_token");

-- CreateIndex
CREATE INDEX "service_requests_serial_number_idx" ON "service_requests"("serial_number");

-- CreateIndex
CREATE INDEX "service_requests_scheduled_at_idx" ON "service_requests"("scheduled_at");

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_defect_code_id_fkey" FOREIGN KEY ("defect_code_id") REFERENCES "defect_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_return_reason_id_fkey" FOREIGN KEY ("return_reason_id") REFERENCES "defect_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_orders" ADD CONSTRAINT "part_orders_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_orders" ADD CONSTRAINT "part_orders_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_adjustments" ADD CONSTRAINT "pay_adjustments_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Legal repair deadline (20 days) for repairs that are still open; status timestamps start at creation.
UPDATE "service_requests" SET "status_changed_at" = COALESCE("completed_at", "accepted_at", "created_at");
UPDATE "service_requests" SET "legal_due_at" = "created_at" + interval '20 days' WHERE "type" = 'repair';
