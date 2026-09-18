-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN "locale" VARCHAR(5) NOT NULL DEFAULT 'uz';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "locale" VARCHAR(5) NOT NULL DEFAULT 'uz';

-- AlterTable
ALTER TABLE "products" ADD COLUMN "name_uz" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN "name_ru" TEXT NOT NULL DEFAULT '';
ALTER TABLE "products" ADD COLUMN "name_en" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "service_catalog_items" ADD COLUMN "name_uz" TEXT NOT NULL DEFAULT '';
ALTER TABLE "service_catalog_items" ADD COLUMN "name_ru" TEXT NOT NULL DEFAULT '';
ALTER TABLE "service_catalog_items" ADD COLUMN "name_en" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "spare_parts" ADD COLUMN "name_uz" TEXT NOT NULL DEFAULT '';
ALTER TABLE "spare_parts" ADD COLUMN "name_ru" TEXT NOT NULL DEFAULT '';
ALTER TABLE "spare_parts" ADD COLUMN "name_en" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "code" TEXT;
ALTER TABLE "notifications" ADD COLUMN "params" JSONB;

UPDATE "products"
SET "name_uz" = "name", "name_ru" = "name", "name_en" = "name"
WHERE "name_uz" = '' OR "name_ru" = '' OR "name_en" = '';

UPDATE "service_catalog_items"
SET "name_uz" = "name", "name_ru" = "name", "name_en" = "name"
WHERE "name_uz" = '' OR "name_ru" = '' OR "name_en" = '';

UPDATE "spare_parts"
SET "name_uz" = "name", "name_ru" = "name", "name_en" = "name"
WHERE "name_uz" = '' OR "name_ru" = '' OR "name_en" = '';

UPDATE "service_catalog_items" SET
  "name_uz" = 'Standart o''rnatish',
  "name_ru" = 'Стандартная установка',
  "name_en" = 'Standard installation'
WHERE "name" = 'Standard installation';

UPDATE "service_catalog_items" SET
  "name_uz" = 'Diagnostika tashrifi',
  "name_ru" = 'Диагностический визит',
  "name_en" = 'Diagnostic visit'
WHERE "name" = 'Diagnostic visit';

UPDATE "service_catalog_items" SET
  "name_uz" = 'Gaz to''ldirish',
  "name_ru" = 'Заправка газом',
  "name_en" = 'Gas refill'
WHERE "name" = 'Gas refill';

UPDATE "service_catalog_items" SET
  "name_uz" = 'Kir yuvish mashinasini o''rnatish',
  "name_ru" = 'Установка стиральной машины',
  "name_en" = 'Washer installation'
WHERE "name" = 'Washer installation';

UPDATE "service_catalog_items" SET
  "name_uz" = 'Barabanni tozalash',
  "name_ru" = 'Чистка барабана',
  "name_en" = 'Drum cleaning'
WHERE "name" = 'Drum cleaning';

UPDATE "service_catalog_items" SET
  "name_uz" = 'Konditsioner o''rnatish',
  "name_ru" = 'Установка кондиционера',
  "name_en" = 'AC installation'
WHERE "name" = 'AC installation';

UPDATE "service_catalog_items" SET
  "name_uz" = 'Mavsumiy konditsioner xizmati',
  "name_ru" = 'Сезонное ТО кондиционера',
  "name_en" = 'Seasonal AC maintenance'
WHERE "name" = 'Seasonal AC maintenance';

UPDATE "service_catalog_items" SET
  "name_uz" = 'Televizorni devorga o''rnatish',
  "name_ru" = 'Монтаж телевизора на стену',
  "name_en" = 'TV wall mount & setup'
WHERE "name" = 'TV wall mount & setup';

UPDATE "spare_parts" SET
  "name_uz" = 'Eshik qistirmasi',
  "name_ru" = 'Уплотнитель двери',
  "name_en" = 'Door gasket'
WHERE "name" = 'Door gasket';

UPDATE "spare_parts" SET
  "name_uz" = 'Termostat',
  "name_ru" = 'Термостат',
  "name_en" = 'Thermostat'
WHERE "name" = 'Thermostat';

UPDATE "spare_parts" SET
  "name_uz" = 'Drenaj nasosi',
  "name_ru" = 'Сливной насос',
  "name_en" = 'Drain pump'
WHERE "name" = 'Drain pump';

UPDATE "spare_parts" SET
  "name_uz" = 'Kirish klapani',
  "name_ru" = 'Впускной клапан',
  "name_en" = 'Inlet valve'
WHERE "name" = 'Inlet valve';

UPDATE "spare_parts" SET
  "name_uz" = 'Kondensator',
  "name_ru" = 'Конденсатор',
  "name_en" = 'Capacitor'
WHERE "name" = 'Capacitor';

UPDATE "spare_parts" SET
  "name_uz" = 'Pult',
  "name_ru" = 'Пульт',
  "name_en" = 'Remote control'
WHERE "name" = 'Remote control';
