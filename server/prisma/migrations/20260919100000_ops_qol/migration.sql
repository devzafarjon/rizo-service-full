-- AlterTable
ALTER TABLE "spare_parts" ADD COLUMN "low_stock_threshold" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "spare_parts" ADD COLUMN "low_stock_notified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN "overdue_at" TIMESTAMP(3);
ALTER TABLE "service_requests" ADD COLUMN "overdue_notified_at" TIMESTAMP(3);
ALTER TABLE "service_requests" ADD COLUMN "pickup_confirmed_at" TIMESTAMP(3);
ALTER TABLE "service_requests" ADD COLUMN "pickup_signature_url" TEXT;
ALTER TABLE "service_requests" ADD COLUMN "pickup_confirmed_by" TEXT;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "telegram_chat_id" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE "notifications" ADD COLUMN "staff_user_id" TEXT;
ALTER TABLE "notifications" ADD COLUMN "spare_part_id" TEXT;
ALTER TABLE "notifications" ALTER COLUMN "customer_id" DROP NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "service_request_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "technician_schedules" (
    "id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "is_working" BOOLEAN NOT NULL DEFAULT true,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),

    CONSTRAINT "technician_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_type" TEXT NOT NULL,
    "user_name" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "code" TEXT,
    "entity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "technician_schedules_technician_id_date_key" ON "technician_schedules"("technician_id", "date");
CREATE INDEX "technician_schedules_date_idx" ON "technician_schedules"("date");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "outbound_messages_status_idx" ON "outbound_messages"("status");
CREATE INDEX "outbound_messages_created_at_idx" ON "outbound_messages"("created_at");
CREATE INDEX "notifications_staff_user_id_is_read_idx" ON "notifications"("staff_user_id", "is_read");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_staff_user_id_fkey" FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_spare_part_id_fkey" FOREIGN KEY ("spare_part_id") REFERENCES "spare_parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "technician_schedules" ADD CONSTRAINT "technician_schedules_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "staff_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "app_settings" ("key", "value") VALUES ('block_zero_stock', 'true') ON CONFLICT ("key") DO NOTHING;
