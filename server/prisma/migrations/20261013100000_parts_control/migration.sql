-- AlterTable
ALTER TABLE "part_orders" ADD COLUMN     "late_notified_at" TIMESTAMP(3),
ADD COLUMN     "ordered_at" TIMESTAMP(3),
ADD COLUMN     "supplier_id" TEXT;

-- AlterTable
ALTER TABLE "spare_parts" ADD COLUMN     "supplier_id" TEXT,
ADD COLUMN     "target_stock" INTEGER;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "telegram" TEXT,
    "note" TEXT,
    "lead_time_days" INTEGER NOT NULL DEFAULT 3,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_orders" ADD CONSTRAINT "part_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

