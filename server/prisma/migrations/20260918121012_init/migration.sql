-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('admin', 'technician');

-- CreateEnum
CREATE TYPE "TechnicianType" AS ENUM ('service_center', 'mobile');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('installation', 'repair', 'maintenance');

-- CreateEnum
CREATE TYPE "RequestSource" AS ENUM ('rizo_market', 'rizo_service');

-- CreateEnum
CREATE TYPE "DefectType" AS ENUM ('dead_on_arrival', 'failed_during_use');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('in_shop', 'on_site');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'received', 'diagnosing', 'awaiting_parts', 'repairing', 'ready_for_pickup', 'replaced', 'closed', 'due');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "WarrantyStatus" AS ENUM ('in_warranty', 'expired', 'not_applicable');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('not_required', 'pending', 'paid');

-- CreateEnum
CREATE TYPE "NoteAuthorScope" AS ENUM ('staff', 'customer');

-- CreateTable
CREATE TABLE "staff_users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "technician_type" "TechnicianType",
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sale_date" DATE NOT NULL,
    "price_paid" DECIMAL(12,2) NOT NULL,
    "warranty_months" INTEGER NOT NULL,
    "warranty_expiry" DATE NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_catalog_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "product_category" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "product_category" TEXT NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "source" "RequestSource" NOT NULL DEFAULT 'rizo_service',
    "submitted_by_customer" BOOLEAN NOT NULL DEFAULT false,
    "sale_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "issue_description" TEXT NOT NULL,
    "defect_type" "DefectType",
    "location_type" "LocationType" NOT NULL,
    "customer_location" JSONB,
    "technician_type_required" "TechnicianType" NOT NULL,
    "assigned_technician_id" TEXT,
    "status" "RequestStatus" NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'medium',
    "warranty_status" "WarrantyStatus" NOT NULL,
    "is_paid_repair" BOOLEAN NOT NULL DEFAULT false,
    "estimated_cost" DECIMAL(12,2),
    "final_cost" DECIMAL(12,2),
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'not_required',
    "customer_approved_at" TIMESTAMP(3),
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_interval_months" INTEGER,
    "next_due_date" DATE,
    "received_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_pauses" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "paused_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumed_at" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "custom_timer_hours" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "request_pauses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_service_lines" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "service_catalog_item_id" TEXT NOT NULL,
    "price_at_time" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "request_service_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_part_lines" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "spare_part_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_at_time" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "request_part_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_extra_expenses" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "request_extra_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_photos" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "photo_url" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "staff_user_id" TEXT,
    "customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_notes" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "author_scope" "NoteAuthorScope" NOT NULL,
    "staff_user_id" TEXT,
    "customer_id" TEXT,
    "note_text" TEXT NOT NULL,
    "is_visible_to_customer" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "service_request_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_phone_key" ON "staff_users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_number_key" ON "sales"("invoice_number");

-- CreateIndex
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");

-- CreateIndex
CREATE INDEX "sales_product_id_idx" ON "sales"("product_id");

-- CreateIndex
CREATE INDEX "service_catalog_items_product_category_idx" ON "service_catalog_items"("product_category");

-- CreateIndex
CREATE INDEX "spare_parts_product_category_idx" ON "spare_parts"("product_category");

-- CreateIndex
CREATE INDEX "service_requests_status_idx" ON "service_requests"("status");

-- CreateIndex
CREATE INDEX "service_requests_type_idx" ON "service_requests"("type");

-- CreateIndex
CREATE INDEX "service_requests_priority_idx" ON "service_requests"("priority");

-- CreateIndex
CREATE INDEX "service_requests_customer_id_idx" ON "service_requests"("customer_id");

-- CreateIndex
CREATE INDEX "service_requests_assigned_technician_id_idx" ON "service_requests"("assigned_technician_id");

-- CreateIndex
CREATE INDEX "service_requests_warranty_status_idx" ON "service_requests"("warranty_status");

-- CreateIndex
CREATE INDEX "request_pauses_service_request_id_idx" ON "request_pauses"("service_request_id");

-- CreateIndex
CREATE INDEX "request_service_lines_service_request_id_idx" ON "request_service_lines"("service_request_id");

-- CreateIndex
CREATE INDEX "request_part_lines_service_request_id_idx" ON "request_part_lines"("service_request_id");

-- CreateIndex
CREATE INDEX "request_extra_expenses_service_request_id_idx" ON "request_extra_expenses"("service_request_id");

-- CreateIndex
CREATE INDEX "request_photos_service_request_id_idx" ON "request_photos"("service_request_id");

-- CreateIndex
CREATE INDEX "request_notes_service_request_id_idx" ON "request_notes"("service_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_service_request_id_key" ON "feedback"("service_request_id");

-- CreateIndex
CREATE INDEX "feedback_customer_id_idx" ON "feedback"("customer_id");

-- CreateIndex
CREATE INDEX "notifications_customer_id_is_read_idx" ON "notifications"("customer_id", "is_read");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assigned_technician_id_fkey" FOREIGN KEY ("assigned_technician_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_pauses" ADD CONSTRAINT "request_pauses_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_service_lines" ADD CONSTRAINT "request_service_lines_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_service_lines" ADD CONSTRAINT "request_service_lines_service_catalog_item_id_fkey" FOREIGN KEY ("service_catalog_item_id") REFERENCES "service_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_part_lines" ADD CONSTRAINT "request_part_lines_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_part_lines" ADD CONSTRAINT "request_part_lines_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_extra_expenses" ADD CONSTRAINT "request_extra_expenses_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_photos" ADD CONSTRAINT "request_photos_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_photos" ADD CONSTRAINT "request_photos_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_photos" ADD CONSTRAINT "request_photos_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_notes" ADD CONSTRAINT "request_notes_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_notes" ADD CONSTRAINT "request_notes_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_notes" ADD CONSTRAINT "request_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
