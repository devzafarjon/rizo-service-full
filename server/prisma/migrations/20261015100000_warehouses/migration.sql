-- CreateEnum
CREATE TYPE "WarehouseKind" AS ENUM ('central', 'regional', 'branch');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('requested', 'shipped', 'received', 'rejected', 'cancelled');

-- AlterTable
ALTER TABLE "part_orders" ADD COLUMN     "warehouse_id" TEXT;

-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN     "warehouse_id" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "transfer_id" TEXT,
ADD COLUMN     "warehouse_id" TEXT;

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "WarehouseKind" NOT NULL DEFAULT 'regional',
    "region_code" VARCHAR(2) NOT NULL DEFAULT '00',
    "address" TEXT,
    "phone" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "service_center_id" TEXT,
    "lead_days_same_region" INTEGER NOT NULL DEFAULT 1,
    "lead_days_other_region" INTEGER NOT NULL DEFAULT 3,
    "note" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_stocks" (
    "id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "spare_part_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "min_quantity" INTEGER,
    "low_notified_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "spare_part_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "from_warehouse_id" TEXT NOT NULL,
    "to_warehouse_id" TEXT,
    "to_technician_id" TEXT,
    "service_request_id" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'requested',
    "eta_at" DATE,
    "shipped_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "stale_notified_at" TIMESTAMP(3),
    "late_notified_at" TIMESTAMP(3),
    "note" TEXT,
    "rejection_reason" TEXT,
    "requested_by_id" TEXT,
    "requested_by_name" TEXT,
    "requested_by_role" TEXT,
    "shipped_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "part_stocks_spare_part_id_idx" ON "part_stocks"("spare_part_id");

-- CreateIndex
CREATE UNIQUE INDEX "part_stocks_warehouse_id_spare_part_id_key" ON "part_stocks"("warehouse_id", "spare_part_id");

-- CreateIndex
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers"("status");

-- CreateIndex
CREATE INDEX "stock_transfers_from_warehouse_id_status_idx" ON "stock_transfers"("from_warehouse_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_to_warehouse_id_status_idx" ON "stock_transfers"("to_warehouse_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_service_request_id_idx" ON "stock_transfers"("service_request_id");

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_orders" ADD CONSTRAINT "part_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_service_center_id_fkey" FOREIGN KEY ("service_center_id") REFERENCES "service_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_stocks" ADD CONSTRAINT "part_stocks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_stocks" ADD CONSTRAINT "part_stocks_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_technician_id_fkey" FOREIGN KEY ("to_technician_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: one central warehouse that holds everything that is in stock today.
INSERT INTO "warehouses" ("id", "name", "kind", "region_code", "lead_days_same_region", "lead_days_other_region", "note", "created_at")
VALUES ('wh_central', 'Markaziy ombor', 'central', '01', 1, 3, NULL, CURRENT_TIMESTAMP);

INSERT INTO "part_stocks" ("id", "warehouse_id", "spare_part_id", "quantity", "updated_at")
SELECT 'ps_central_' || "id", 'wh_central', "id", "stock_quantity", CURRENT_TIMESTAMP FROM "spare_parts";

UPDATE "part_orders" SET "warehouse_id" = 'wh_central' WHERE "status" IN ('requested', 'ordered');
