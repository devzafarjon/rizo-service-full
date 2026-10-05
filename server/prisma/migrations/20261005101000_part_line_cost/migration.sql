-- Remember what a part cost us when it was used, so profit stays correct if cost prices change later.
ALTER TABLE "request_part_lines" ADD COLUMN "cost_at_time" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "request_part_lines" l SET "cost_at_time" = p."cost_price" FROM "spare_parts" p WHERE p."id" = l."spare_part_id";
