-- AlterTable
ALTER TABLE "customers" ADD COLUMN "region_code" VARCHAR(2) NOT NULL DEFAULT '00';

UPDATE "customers"
SET "region_code" = '10'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%toshkent viloyat%'
    OR "address" ILIKE '%tashkent viloyat%'
    OR "address" ILIKE '%tashkent region%'
    OR "address" ILIKE '%toshkent region%'
  );

UPDATE "customers"
SET "region_code" = '01'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%tashkent%'
    OR "address" ILIKE '%toshkent%'
  );

UPDATE "customers"
SET "region_code" = '40'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%farg%ona%'
    OR "address" ILIKE '%fergana%'
    OR "address" ILIKE '%ferghana%'
    OR "address" ILIKE '%fargona%'
  );

UPDATE "customers"
SET "region_code" = '60'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%andijon%'
    OR "address" ILIKE '%andijan%'
  );

UPDATE "customers"
SET "region_code" = '50'
WHERE "region_code" = '00'
  AND "address" ILIKE '%namangan%';

UPDATE "customers"
SET "region_code" = '30'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%samarqand%'
    OR "address" ILIKE '%samarkand%'
  );

UPDATE "customers"
SET "region_code" = '20'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%sirdaryo%'
    OR "address" ILIKE '%sirdarya%'
    OR "address" ILIKE '%syrdarya%'
    OR "address" ILIKE '%guliston%'
    OR "address" ILIKE '%gulistan%'
  );

UPDATE "customers"
SET "region_code" = '25'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%jizzax%'
    OR "address" ILIKE '%jizzakh%'
  );

UPDATE "customers"
SET "region_code" = '70'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%qashqadaryo%'
    OR "address" ILIKE '%kashkadarya%'
    OR "address" ILIKE '%qarshi%'
    OR "address" ILIKE '%karshi%'
  );

UPDATE "customers"
SET "region_code" = '75'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%surxondaryo%'
    OR "address" ILIKE '%surkhandarya%'
    OR "address" ILIKE '%termez%'
  );

UPDATE "customers"
SET "region_code" = '80'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%buxoro%'
    OR "address" ILIKE '%bukhara%'
  );

UPDATE "customers"
SET "region_code" = '85'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%navoiy%'
    OR "address" ILIKE '%navoi%'
  );

UPDATE "customers"
SET "region_code" = '90'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%xorazm%'
    OR "address" ILIKE '%khorezm%'
    OR "address" ILIKE '%khiva%'
    OR "address" ILIKE '%urganch%'
    OR "address" ILIKE '%urgench%'
  );

UPDATE "customers"
SET "region_code" = '95'
WHERE "region_code" = '00'
  AND (
    "address" ILIKE '%qoraqalpog%'
    OR "address" ILIKE '%karakalpak%'
    OR "address" ILIKE '%nukus%'
  );

-- CreateTable
CREATE TABLE "daily_request_counters" (
    "date" DATE NOT NULL,
    "last_sequence" INTEGER NOT NULL,

    CONSTRAINT "daily_request_counters_pkey" PRIMARY KEY ("date")
);

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN "display_id" TEXT;

WITH ordered AS (
  SELECT
    sr.id,
    to_char((sr.created_at AT TIME ZONE 'Asia/Tashkent'), 'DDMMYY') AS ddmmyy,
    ((sr.created_at AT TIME ZONE 'Asia/Tashkent')::date) AS local_date,
    COALESCE(NULLIF(c.region_code, ''), '00') AS region_code,
    row_number() OVER (
      PARTITION BY ((sr.created_at AT TIME ZONE 'Asia/Tashkent')::date)
      ORDER BY sr.created_at ASC, sr.id ASC
    ) AS seq
  FROM "service_requests" sr
  JOIN "customers" c ON c.id = sr.customer_id
)
UPDATE "service_requests" AS sr
SET "display_id" = ordered.ddmmyy || ordered.region_code || lpad(ordered.seq::text, 4, '0')
FROM ordered
WHERE sr.id = ordered.id;

INSERT INTO "daily_request_counters" ("date", "last_sequence")
SELECT
  ((created_at AT TIME ZONE 'Asia/Tashkent')::date) AS local_date,
  COUNT(*)::int
FROM "service_requests"
GROUP BY ((created_at AT TIME ZONE 'Asia/Tashkent')::date)
ON CONFLICT ("date") DO UPDATE SET "last_sequence" = EXCLUDED."last_sequence";

ALTER TABLE "service_requests" ALTER COLUMN "display_id" SET NOT NULL;

CREATE UNIQUE INDEX "service_requests_display_id_key" ON "service_requests"("display_id");
