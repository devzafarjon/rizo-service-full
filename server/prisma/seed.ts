import {
  LocationType,
  PrismaClient,
  RequestStatus,
  ServiceType,
  StaffRole,
  TechnicianType,
  WarrantyStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { allocateDisplayId } from "../src/lib/displayId.js";

const prisma = new PrismaClient();

function utcMonthsAgo(months: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()));
}

function addMonths(date: Date, months: number) {
  const cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return cursor;
}

async function main() {
  const password = (plain: string) => bcrypt.hash(plain, 10);

  await prisma.staffUser.upsert({
    where: { phone: "998900000001" },
    update: {},
    create: {
      name: "Madina Karimova",
      phone: "998900000001",
      passwordHash: await password("admin123"),
      role: StaffRole.admin,
    },
  });

  const mobileTech = await prisma.staffUser.upsert({
    where: { phone: "998900000002" },
    update: {},
    create: {
      name: "Aziz Rakhimov",
      phone: "998900000002",
      passwordHash: await password("tech123"),
      role: StaffRole.technician,
      technicianType: TechnicianType.mobile,
      isAvailable: true,
    },
  });

  await prisma.staffUser.upsert({
    where: { phone: "998900000004" },
    update: {},
    create: {
      name: "Bekzod Tursunov",
      phone: "998900000004",
      passwordHash: await password("tech123"),
      role: StaffRole.technician,
      technicianType: TechnicianType.service_center,
      isAvailable: true,
    },
  });

  const dilnoza = await prisma.customer.upsert({
    where: { phone: "998900000003" },
    update: {},
    create: {
      name: "Dilnoza Alieva",
      phone: "998900000003",
      passwordHash: await password("customer123"),
      address: "12 Amir Temur Avenue, Tashkent",
      regionCode: "01",
      notes: "Prefers afternoon visits",
    },
  });

  const jasur = await prisma.customer.upsert({
    where: { phone: "998901112233" },
    update: {},
    create: {
      name: "Jasur Nazarov",
      phone: "998901112233",
      passwordHash: await password("customer123"),
      address: "45 Bunyodkor Street, Tashkent",
      regionCode: "01",
    },
  });

  await prisma.customer.upsert({
    where: { phone: "998907778899" },
    update: {},
    create: {
      name: "Malika Yusupova",
      phone: "998907778899",
      passwordHash: await password("customer123"),
      address: "8 Navoi Street, Samarkand",
      regionCode: "30",
      notes: "Call before arriving",
    },
  });

  const products = [
    { name: "RIZO Frost 280", nameUz: "RIZO Frost 280", nameRu: "RIZO Frost 280", nameEn: "RIZO Frost 280", sku: "REF-280", category: "Refrigerators" },
    { name: "RIZO Wash Pro 7", nameUz: "RIZO Wash Pro 7", nameRu: "RIZO Wash Pro 7", nameEn: "RIZO Wash Pro 7", sku: "WM-7", category: "Washing machines" },
    { name: "RIZO Cool 12", nameUz: "RIZO Cool 12", nameRu: "RIZO Cool 12", nameEn: "RIZO Cool 12", sku: "AC-12", category: "Air conditioners" },
    { name: "RIZO Vision 43", nameUz: "RIZO Vision 43", nameRu: "RIZO Vision 43", nameEn: "RIZO Vision 43", sku: "TV-43", category: "Televisions" },
  ];

  const savedProducts = [];
  for (const product of products) {
    savedProducts.push(
      await prisma.product.upsert({
        where: { sku: product.sku },
        update: {
          name: product.name,
          nameUz: product.nameUz,
          nameRu: product.nameRu,
          nameEn: product.nameEn,
          category: product.category,
        },
        create: product,
      }),
    );
  }

  const [fridge, washer, ac, tv] = savedProducts;

  const services = [
    { name: "Standard installation", nameUz: "Standart o‘rnatish", nameRu: "Стандартная установка", nameEn: "Standard installation", price: 180000, productCategory: "Refrigerators" },
    { name: "Diagnostic visit", nameUz: "Diagnostika tashrifi", nameRu: "Диагностический визит", nameEn: "Diagnostic visit", price: 80000, productCategory: "Refrigerators" },
    { name: "Gas refill", nameUz: "Gaz to‘ldirish", nameRu: "Заправка газом", nameEn: "Gas refill", price: 220000, productCategory: "Refrigerators" },
    { name: "Washer installation", nameUz: "Kir yuvish mashinasini o‘rnatish", nameRu: "Установка стиральной машины", nameEn: "Washer installation", price: 150000, productCategory: "Washing machines" },
    { name: "Drum cleaning", nameUz: "Barabanni tozalash", nameRu: "Чистка барабана", nameEn: "Drum cleaning", price: 110000, productCategory: "Washing machines" },
    { name: "AC installation", nameUz: "Konditsioner o‘rnatish", nameRu: "Установка кондиционера", nameEn: "AC installation", price: 350000, productCategory: "Air conditioners" },
    { name: "Seasonal AC maintenance", nameUz: "Mavsumiy konditsioner xizmati", nameRu: "Сезонное ТО кондиционера", nameEn: "Seasonal AC maintenance", price: 160000, productCategory: "Air conditioners" },
    { name: "TV wall mount & setup", nameUz: "Televizorni devorga o‘rnatish", nameRu: "Монтаж телевизора на стену", nameEn: "TV wall mount & setup", price: 120000, productCategory: "Televisions" },
  ];

  for (const item of services) {
    const existing = await prisma.serviceCatalogItem.findFirst({
      where: { name: item.name, productCategory: item.productCategory },
    });
    if (!existing) {
      await prisma.serviceCatalogItem.create({ data: item });
    } else {
      await prisma.serviceCatalogItem.update({
        where: { id: existing.id },
        data: { nameUz: item.nameUz, nameRu: item.nameRu, nameEn: item.nameEn },
      });
    }
  }

  await prisma.serviceCatalogItem.updateMany({
    where: { name: "Compressor check" },
    data: {
      nameUz: "Kompressor tekshiruvi",
      nameRu: "Проверка компрессора",
      nameEn: "Compressor check",
    },
  });

  const parts = [
    { name: "Door gasket", nameUz: "Eshik qistirmasi", nameRu: "Уплотнитель двери", nameEn: "Door gasket", price: 95000, productCategory: "Refrigerators", stockQuantity: 14 },
    { name: "Thermostat", nameUz: "Termostat", nameRu: "Термостат", nameEn: "Thermostat", price: 140000, productCategory: "Refrigerators", stockQuantity: 8 },
    { name: "Drain pump", nameUz: "Drenaj nasosi", nameRu: "Сливной насос", nameEn: "Drain pump", price: 175000, productCategory: "Washing machines", stockQuantity: 6 },
    { name: "Inlet valve", nameUz: "Kirish klapani", nameRu: "Впускной клапан", nameEn: "Inlet valve", price: 89000, productCategory: "Washing machines", stockQuantity: 11 },
    { name: "Capacitor", nameUz: "Kondensator", nameRu: "Конденсатор", nameEn: "Capacitor", price: 65000, productCategory: "Air conditioners", stockQuantity: 20 },
    { name: "Remote control", nameUz: "Pult", nameRu: "Пульт", nameEn: "Remote control", price: 45000, productCategory: "Televisions", stockQuantity: 18 },
  ];

  for (const item of parts) {
    const existing = await prisma.sparePart.findFirst({
      where: { name: item.name, productCategory: item.productCategory },
    });
    if (!existing) {
      await prisma.sparePart.create({ data: item });
    } else {
      await prisma.sparePart.update({
        where: { id: existing.id },
        data: { nameUz: item.nameUz, nameRu: item.nameRu, nameEn: item.nameEn },
      });
    }
  }

  const fridgeSaleDate = utcMonthsAgo(8);
  const tvSaleDate = utcMonthsAgo(14);
  const acSaleDate = utcMonthsAgo(3);

  const fridgeSale = await prisma.sale.upsert({
    where: { invoiceNumber: "RZ-1001" },
    update: {},
    create: {
      customerId: dilnoza.id,
      productId: fridge.id,
      quantity: 1,
      saleDate: fridgeSaleDate,
      pricePaid: 4500000,
      warrantyMonths: 24,
      warrantyExpiry: addMonths(fridgeSaleDate, 24),
      invoiceNumber: "RZ-1001",
    },
  });

  await prisma.sale.upsert({
    where: { invoiceNumber: "RZ-1002" },
    update: {},
    create: {
      customerId: dilnoza.id,
      productId: tv.id,
      quantity: 1,
      saleDate: tvSaleDate,
      pricePaid: 3200000,
      warrantyMonths: 12,
      warrantyExpiry: addMonths(tvSaleDate, 12),
      invoiceNumber: "RZ-1002",
    },
  });

  await prisma.sale.upsert({
    where: { invoiceNumber: "RZ-1003" },
    update: {},
    create: {
      customerId: jasur.id,
      productId: ac.id,
      quantity: 1,
      saleDate: acSaleDate,
      pricePaid: 6200000,
      warrantyMonths: 18,
      warrantyExpiry: addMonths(acSaleDate, 18),
      invoiceNumber: "RZ-1003",
    },
  });

  await prisma.sale.upsert({
    where: { invoiceNumber: "RZ-1004" },
    update: {},
    create: {
      customerId: jasur.id,
      productId: washer.id,
      quantity: 1,
      saleDate: utcMonthsAgo(1),
      pricePaid: 3800000,
      warrantyMonths: 24,
      warrantyExpiry: addMonths(utcMonthsAgo(1), 24),
      invoiceNumber: "RZ-1004",
    },
  });

  const existingInstall = await prisma.serviceRequest.findFirst({
    where: { saleId: fridgeSale.id, type: ServiceType.installation },
  });
  if (!existingInstall) {
    const installedAt = utcMonthsAgo(8);
    const displayId = await allocateDisplayId(prisma, {
      regionCode: dilnoza.regionCode,
      address: dilnoza.address,
      at: installedAt,
    });
    await prisma.serviceRequest.create({
      data: {
        displayId,
        type: ServiceType.installation,
        source: "rizo_market",
        submittedByCustomer: false,
        saleId: fridgeSale.id,
        customerId: dilnoza.id,
        productId: fridge.id,
        issueDescription: "Install newly purchased refrigerator and check cooling.",
        locationType: LocationType.in_shop,
        technicianTypeRequired: TechnicianType.service_center,
        assignedTechnicianId: mobileTech.id,
        status: RequestStatus.completed,
        priority: "medium",
        warrantyStatus: WarrantyStatus.in_warranty,
        paymentStatus: "not_required",
        receivedAt: installedAt,
        acceptedAt: installedAt,
        completedAt: installedAt,
        createdAt: installedAt,
      },
    });
  }

  console.log("Seeded demo accounts and catalog:");
  console.log("  Admin      998900000001 / admin123");
  console.log("  Technician 998900000002 / tech123  (mobile)");
  console.log("  Technician 998900000004 / tech123  (service center)");
  console.log("  Customer   998900000003 / customer123");
  console.log("  Invoices   RZ-1001, RZ-1002, RZ-1003, RZ-1004");

  const { backfillNotificationI18n } = await import("../src/lib/notifyCustomer.js");
  await backfillNotificationI18n();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
