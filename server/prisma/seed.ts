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
import fs from "node:fs";
import path from "node:path";
import { uploadsRoot } from "../src/lib/uploads.js";
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

  const shopTech = await prisma.staffUser.upsert({
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

  for (const name of new Set(products.map((product) => product.category))) {
    await prisma.productCategory.upsert({ where: { name }, update: {}, create: { name } });
  }

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
    { name: "Standard installation", nameUz: "Standart o‘rnatish", nameRu: "Стандартная установка", nameEn: "Standard installation", price: 180000, productCategories: ["Refrigerators"] },
    { name: "Diagnostic visit", nameUz: "Diagnostika tashrifi", nameRu: "Диагностический визит", nameEn: "Diagnostic visit", price: 80000, productCategories: ["Refrigerators"] },
    { name: "Gas refill", nameUz: "Gaz to‘ldirish", nameRu: "Заправка газом", nameEn: "Gas refill", price: 220000, productCategories: ["Refrigerators"] },
    { name: "Washer installation", nameUz: "Kir yuvish mashinasini o‘rnatish", nameRu: "Установка стиральной машины", nameEn: "Washer installation", price: 150000, productCategories: ["Washing machines"] },
    { name: "Drum cleaning", nameUz: "Barabanni tozalash", nameRu: "Чистка барабана", nameEn: "Drum cleaning", price: 110000, productCategories: ["Washing machines"] },
    { name: "AC installation", nameUz: "Konditsioner o‘rnatish", nameRu: "Установка кондиционера", nameEn: "AC installation", price: 350000, productCategories: ["Air conditioners"] },
    { name: "AC diagnostic visit", nameUz: "Konditsioner diagnostikasi", nameRu: "Диагностика кондиционера", nameEn: "AC diagnostic visit", price: 90000, productCategories: ["Air conditioners"] },
    { name: "Remote setup", nameUz: "Pultni sozlash", nameRu: "Настройка пульта", nameEn: "Remote setup", price: 40000, productCategories: ["Televisions"] },
    { name: "TV wall mount & setup", nameUz: "Televizorni devorga o‘rnatish", nameRu: "Монтаж телевизора на стену", nameEn: "TV wall mount & setup", price: 120000, productCategories: ["Televisions"] },
  ];

  for (const item of services) {
    const existing = await prisma.serviceCatalogItem.findFirst({
      where: { name: item.name },
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

  // Periodic / seasonal maintenance is not a RIZO Service product.
  await prisma.serviceCatalogItem.deleteMany({
    where: { name: "Seasonal AC maintenance", requestLines: { none: {} } },
  });

  await prisma.serviceCatalogItem.updateMany({
    where: { name: "Compressor check" },
    data: {
      nameUz: "Kompressor tekshiruvi",
      nameRu: "Проверка компрессора",
      nameEn: "Compressor check",
    },
  });

  const parts = [
    { name: "Door gasket", nameUz: "Eshik qistirmasi", nameRu: "Уплотнитель двери", nameEn: "Door gasket", price: 95000, costPrice: 62000, productCategories: ["Refrigerators"], stockQuantity: 14 },
    { name: "Thermostat", nameUz: "Termostat", nameRu: "Термостат", nameEn: "Thermostat", price: 140000, costPrice: 91000, productCategories: ["Refrigerators"], stockQuantity: 8 },
    { name: "Drain pump", nameUz: "Drenaj nasosi", nameRu: "Сливной насос", nameEn: "Drain pump", price: 175000, costPrice: 114000, productCategories: ["Washing machines"], stockQuantity: 6 },
    { name: "Inlet valve", nameUz: "Kirish klapani", nameRu: "Впускной клапан", nameEn: "Inlet valve", price: 89000, costPrice: 58000, productCategories: ["Washing machines"], stockQuantity: 11 },
    { name: "Capacitor", nameUz: "Kondensator", nameRu: "Конденсатор", nameEn: "Capacitor", price: 65000, costPrice: 42000, productCategories: ["Air conditioners"], stockQuantity: 20 },
    { name: "Remote control", nameUz: "Pult", nameRu: "Пульт", nameEn: "Remote control", price: 45000, costPrice: 29000, productCategories: ["Televisions"], stockQuantity: 18 },
  ];

  for (const item of parts) {
    const existing = await prisma.sparePart.findFirst({
      where: { name: item.name },
    });
    if (!existing) {
      await prisma.sparePart.create({ data: item });
    } else {
      await prisma.sparePart.update({
        where: { id: existing.id },
        data: { nameUz: item.nameUz, nameRu: item.nameRu, nameEn: item.nameEn, costPrice: item.costPrice },
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
      installationDate: fridgeSaleDate,
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

  const tvSale = await prisma.sale.findUniqueOrThrow({ where: { invoiceNumber: "RZ-1002" } });
  const acSale = await prisma.sale.findUniqueOrThrow({ where: { invoiceNumber: "RZ-1003" } });
  const washerSale = await prisma.sale.findUniqueOrThrow({ where: { invoiceNumber: "RZ-1004" } });

  // Demo requests, one per board column, so every screen has something to show.
  if ((await prisma.serviceRequest.count()) === 0) {
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
    const demoPhoto = "/api/uploads/seed/demo-photo.svg";
    fs.mkdirSync(path.join(uploadsRoot, "seed"), { recursive: true });
    fs.writeFileSync(
      path.join(uploadsRoot, "seed", "demo-photo.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><rect width="640" height="420" fill="#F4F0FA"/><rect x="230" y="90" width="180" height="240" rx="14" fill="#fff" stroke="#7B00E0" stroke-width="6"/><circle cx="320" cy="150" r="22" fill="#F7941E"/><text x="320" y="380" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#7B00E0">Demo job photo</text></svg>',
    );

    type Seed = {
      type: ServiceType;
      customer: typeof dilnoza;
      product: typeof fridge;
      sale: { id: string } | null;
      issue: string;
      defect?: "dead_on_arrival" | "failed_during_use";
      location: LocationType;
      tech: typeof mobileTech;
      status: RequestStatus;
      createdHoursAgo: number;
      priority?: "low" | "medium" | "high" | "urgent";
      warranty: WarrantyStatus;
      source?: "rizo_market" | "rizo_service";
      byCustomer?: boolean;
    };

    async function seedRequest(input: Seed) {
      const createdAt = hoursAgo(input.createdHoursAgo);
      const displayId = await allocateDisplayId(prisma, {
        regionCode: input.customer.regionCode,
        address: input.customer.address,
        at: createdAt,
      });
      const worked = input.status !== "new";
      return prisma.serviceRequest.create({
        data: {
          displayId,
          type: input.type,
          source: input.source ?? "rizo_service",
          submittedByCustomer: input.byCustomer ?? false,
          saleId: input.sale?.id ?? null,
          customerId: input.customer.id,
          productId: input.product.id,
          issueDescription: input.issue,
          defectType: input.defect ?? null,
          locationType: input.location,
          customerLocation: input.location === "on_site" ? { address: input.customer.address, lat: 41.311081, lng: 69.240562 } : undefined,
          technicianTypeRequired: input.tech.technicianType ?? TechnicianType.mobile,
          assignedTechnicianId: input.tech.id,
          assignedAt: createdAt,
          status: input.status,
          priority: input.priority ?? "medium",
          warrantyStatus: input.warranty,
          isPaidRepair: input.type === "repair" && input.warranty !== "in_warranty",
          paymentStatus: input.warranty === "in_warranty" ? "not_required" : "pending",
          acceptedAt: worked ? new Date(createdAt.getTime() + 30 * 60_000) : null,
          arrivedAt: worked && input.location === "on_site" ? new Date(createdAt.getTime() + 45 * 60_000) : null,
          createdAt,
        },
      });
    }

    // New and already overdue (New has a 1 day timer).
    await seedRequest({
      type: ServiceType.repair, customer: dilnoza, product: tv, sale: tvSale, defect: "failed_during_use",
      issue: "Screen flickers and turns off after a few minutes.", location: LocationType.in_shop, tech: shopTech,
      status: RequestStatus.new, createdHoursAgo: 30, priority: "high", warranty: WarrantyStatus.expired, byCustomer: true,
    });
    // In progress, on site.
    await seedRequest({
      type: ServiceType.installation, customer: jasur, product: ac, sale: acSale,
      issue: "Install the new split air conditioner in the living room.", location: LocationType.on_site, tech: mobileTech,
      status: RequestStatus.in_progress, createdHoursAgo: 5, warranty: WarrantyStatus.in_warranty, source: "rizo_market",
    });
    // Paused with a reason and a technician-set timer.
    const paused = await seedRequest({
      type: ServiceType.repair, customer: jasur, product: washer, sale: washerSale, defect: "dead_on_arrival",
      issue: "Washer does not start; display stays dark.", location: LocationType.on_site, tech: mobileTech,
      status: RequestStatus.paused, createdHoursAgo: 20, priority: "urgent", warranty: WarrantyStatus.in_warranty,
    });
    await prisma.requestPause.create({
      data: { serviceRequestId: paused.id, reason: "Waiting for a control board from the warehouse", customTimerHours: 48, pausedAt: hoursAgo(6) },
    });

    // Completed in-shop repair, waiting for the customer to collect it.
    const gasket = await prisma.sparePart.findFirstOrThrow({ where: { name: "Door gasket" } });
    const diagnostic = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { name: "Diagnostic visit" } });
    const done = await seedRequest({
      type: ServiceType.repair, customer: dilnoza, product: fridge, sale: fridgeSale, defect: "failed_during_use",
      issue: "Door does not seal and the fridge warms up.", location: LocationType.in_shop, tech: shopTech,
      status: RequestStatus.completed, createdHoursAgo: 52, warranty: WarrantyStatus.in_warranty,
    });
    await prisma.serviceRequest.update({
      where: { id: done.id },
      data: { completedAt: hoursAgo(4), resolutionType: "repair", estimatedCost: 190000, finalCost: 0 },
    });
    await prisma.requestServiceLine.create({ data: { serviceRequestId: done.id, serviceCatalogItemId: diagnostic.id, priceAtTime: diagnostic.price } });
    await prisma.requestPartLine.create({
      data: { serviceRequestId: done.id, sparePartId: gasket.id, quantity: 1, priceAtTime: gasket.price, costAtTime: gasket.costPrice },
    });
    await prisma.sparePart.update({ where: { id: gasket.id }, data: { stockQuantity: { decrement: 1 } } });
    await prisma.requestPhoto.create({ data: { serviceRequestId: done.id, photoUrl: demoPhoto, uploadedBy: shopTech.name, staffUserId: shopTech.id } });

    // Picked up and rated.
    const picked = await seedRequest({
      type: ServiceType.repair, customer: dilnoza, product: tv, sale: tvSale, defect: "failed_during_use",
      issue: "Remote control stopped working.", location: LocationType.in_shop, tech: shopTech,
      status: RequestStatus.picked_up, createdHoursAgo: 150, warranty: WarrantyStatus.expired,
    });
    const remote = await prisma.sparePart.findFirstOrThrow({ where: { name: "Remote control" } });
    const remoteSetup = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { name: "Remote setup" } });
    await prisma.serviceRequest.update({
      where: { id: picked.id },
      data: {
        completedAt: hoursAgo(120),
        pickupConfirmedAt: hoursAgo(100),
        pickupConfirmedBy: dilnoza.id,
        pickupConfirmationType: "tap",
        resolutionType: "repair",
        estimatedCost: 85000,
        finalCost: 85000,
        paymentStatus: "paid",
      },
    });
    await prisma.requestServiceLine.create({ data: { serviceRequestId: picked.id, serviceCatalogItemId: remoteSetup.id, priceAtTime: remoteSetup.price } });
    await prisma.requestPartLine.create({
      data: { serviceRequestId: picked.id, sparePartId: remote.id, quantity: 1, priceAtTime: remote.price, costAtTime: remote.costPrice },
    });
    await prisma.requestPhoto.create({ data: { serviceRequestId: picked.id, photoUrl: demoPhoto, uploadedBy: shopTech.name, staffUserId: shopTech.id } });
    await prisma.feedback.create({
      data: { serviceRequestId: picked.id, customerId: dilnoza.id, rating: 5, comment: "Fast and polite service.", tags: ["fast", "polite"] },
    });

    // The fridge was installed the day it was sold.
    const install = await seedRequest({
      type: ServiceType.installation, customer: dilnoza, product: fridge, sale: fridgeSale,
      issue: "Install newly purchased refrigerator and check cooling.", location: LocationType.on_site, tech: mobileTech,
      status: RequestStatus.completed, createdHoursAgo: 24 * 240, warranty: WarrantyStatus.in_warranty, source: "rizo_market",
    });
    await prisma.serviceRequest.update({
      where: { id: install.id },
      data: { completedAt: fridgeSaleDate, estimatedCost: 180000, finalCost: 0 },
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
