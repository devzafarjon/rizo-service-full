-- Existing davriy texnik xizmat jobs and their children.
DELETE FROM "notifications" WHERE "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "type" = 'maintenance');
DELETE FROM "feedback" WHERE "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "type" = 'maintenance');
DELETE FROM "request_notes" WHERE "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "type" = 'maintenance');
DELETE FROM "request_photos" WHERE "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "type" = 'maintenance');
DELETE FROM "request_extra_expenses" WHERE "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "type" = 'maintenance');
DELETE FROM "request_part_lines" WHERE "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "type" = 'maintenance');
DELETE FROM "request_service_lines" WHERE "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "type" = 'maintenance');
DELETE FROM "request_pauses" WHERE "service_request_id" IN (SELECT "id" FROM "service_requests" WHERE "type" = 'maintenance');
DELETE FROM "service_requests" WHERE "type" = 'maintenance';

ALTER TABLE "service_requests" DROP COLUMN "is_recurring";
ALTER TABLE "service_requests" DROP COLUMN "recurrence_interval_months";
ALTER TABLE "service_requests" DROP COLUMN "next_due_date";

CREATE TYPE "ServiceType_new" AS ENUM ('installation', 'repair');
ALTER TABLE "service_requests" ALTER COLUMN "type" TYPE "ServiceType_new" USING ("type"::text::"ServiceType_new");
DROP TYPE "ServiceType";
ALTER TYPE "ServiceType_new" RENAME TO "ServiceType";

CREATE TYPE "RequestStatus_new" AS ENUM (
  'scheduled',
  'in_progress',
  'completed',
  'received',
  'diagnosing',
  'awaiting_parts',
  'repairing',
  'ready_for_pickup',
  'replaced',
  'closed'
);
ALTER TABLE "service_requests" ALTER COLUMN "status" TYPE "RequestStatus_new" USING ("status"::text::"RequestStatus_new");
DROP TYPE "RequestStatus";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
