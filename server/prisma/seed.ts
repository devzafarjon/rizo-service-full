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

  await prisma.staffUser.upsert({
    where: { phone: "998900000005" },
    update: {},
    create: {
      name: "Nigora Sodiqova",
      phone: "998900000005",
      passwordHash: await password("desk123"),
      role: StaffRole.receptionist,
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
      payPercent: 20,
      payFixedPerJob: 15000,
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
      payPercent: 25,
      payFixedPerJob: 10000,
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
      serialNumber: "RF280-A1001",
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
      serialNumber: "TV43-B2002",
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
      serialNumber: "AC12-C3003",
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
      serialNumber: "WM7-D4004",
    },
  });

  const centers = [
    { name: "RIZO Service — Chilonzor", regionCode: "01", address: "Chilonzor 9, Tashkent", phone: "+998712000001", workingHours: "Mon–Sat 09:00–18:00", lat: 41.2755, lng: 69.2035 },
    { name: "RIZO Service — Samarqand", regionCode: "30", address: "Registon ko‘chasi 12, Samarkand", phone: "+998662000002", workingHours: "Mon–Sat 09:00–18:00", lat: 39.6542, lng: 66.9597 },
  ];
  for (const center of centers) {
    if (!(await prisma.serviceCenter.findFirst({ where: { name: center.name } }))) await prisma.serviceCenter.create({ data: center });
  }
  const shopCenter = await prisma.serviceCenter.findFirstOrThrow({ where: { regionCode: "01" } });
  await prisma.staffUser.updateMany({ where: { phone: "998900000004" }, data: { serviceCenterId: shopCenter.id } });

  const defectCodes = [
    { kind: "defect" as const, code: "D01", name: "Does not power on", nameUz: "Yoqilmaydi", nameRu: "Не включается", nameEn: "Does not power on", productCategory: null },
    { kind: "defect" as const, code: "D02", name: "Cooling failure", nameUz: "Sovutmaydi", nameRu: "Не охлаждает", nameEn: "Cooling failure", productCategory: "Refrigerators" },
    { kind: "defect" as const, code: "D03", name: "Leak", nameUz: "Suv oqadi", nameRu: "Протечка", nameEn: "Leak", productCategory: "Washing machines" },
    { kind: "defect" as const, code: "D04", name: "Screen defect", nameUz: "Ekran nosozligi", nameRu: "Дефект экрана", nameEn: "Screen defect", productCategory: "Televisions" },
    { kind: "defect" as const, code: "D05", name: "Noise or vibration", nameUz: "Shovqin yoki tebranish", nameRu: "Шум или вибрация", nameEn: "Noise or vibration", productCategory: null },
    { kind: "return_reason" as const, code: "R01", name: "Defective on arrival", nameUz: "Brak keldi", nameRu: "Брак при получении", nameEn: "Defective on arrival", productCategory: null },
    { kind: "return_reason" as const, code: "R02", name: "Cannot be repaired", nameUz: "Ta’mirlab bo‘lmaydi", nameRu: "Не подлежит ремонту", nameEn: "Cannot be repaired", productCategory: null },
    { kind: "return_reason" as const, code: "R03", name: "Customer changed their mind", nameUz: "Mijoz fikridan qaytdi", nameRu: "Клиент передумал", nameEn: "Customer changed their mind", productCategory: null },
  ];
  for (const code of defectCodes) {
    await prisma.defectCode.upsert({ where: { kind_code: { kind: code.kind, code: code.code } }, update: {}, create: code });
  }

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
          legalDueAt: input.type === "repair" ? new Date(createdAt.getTime() + 20 * 86_400_000) : null,
          statusChangedAt: hoursAgo(Math.min(input.createdHoursAgo, 8)),
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
      status: RequestStatus.ready, createdHoursAgo: 52, warranty: WarrantyStatus.in_warranty,
    });
    await prisma.serviceRequest.update({
      where: { id: done.id },
      data: { completedAt: hoursAgo(4), resolutionType: "repair", estimatedCost: 190000, finalCost: 0, decision: "warranty_repair", decidedAt: hoursAgo(40), repairWarrantyUntil: new Date(Date.now() + 30 * 86_400_000), serialNumber: "RF280-A1001", workedMinutes: 95 },
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
    await prisma.payment.create({
      data: { serviceRequestId: picked.id, kind: "payment", method: "cash", amount: 85000, createdByName: shopTech.name, note: "Paid at the counter" },
    });
    await prisma.serviceRequest.update({
      where: { id: picked.id },
      data: { decision: "paid_repair", decidedAt: hoursAgo(140), serialNumber: "TV43-B2002", repairWarrantyUntil: new Date(Date.now() + 14 * 86_400_000), workedMinutes: 70 },
    });

    // Waiting for the customer: an estimate was sent and not answered yet.
    const decisionJob = await seedRequest({
      type: ServiceType.repair, customer: jasur, product: tv, sale: null, defect: "failed_during_use",
      issue: "TV has vertical lines on the screen.", location: LocationType.in_shop, tech: shopTech,
      status: RequestStatus.awaiting_decision, createdHoursAgo: 12, warranty: WarrantyStatus.not_applicable,
    });
    const tvService = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { name: "TV wall mount & setup" } });
    await prisma.serviceRequest.update({ where: { id: decisionJob.id }, data: { decision: "paid_repair", isPaidRepair: true, serialNumber: "TV43-X9999" } });
    const estimate = await prisma.estimate.create({
      data: {
        serviceRequestId: decisionJob.id,
        status: "sent",
        sentAt: hoursAgo(10),
        validUntil: new Date(Date.now() + 6 * 86_400_000),
        createdByName: shopTech.name,
        note: "Panel cable replacement and testing",
        lines: {
          create: [
            { kind: "labor", name: "Diagnostics and panel cable replacement", quantity: 1, unitPrice: 160000 },
            { kind: "part", sparePartId: remote.id, name: remote.name, quantity: 1, unitPrice: remote.price, isOptional: true },
            { kind: "service", serviceCatalogItemId: tvService.id, name: tvService.name, quantity: 1, unitPrice: 75000, isOptional: true },
          ],
        },
      },
    });
    void estimate;

    // Waiting for a part that is on order.
    const partsJob = await seedRequest({
      type: ServiceType.repair, customer: jasur, product: washer, sale: washerSale, defect: "failed_during_use",
      issue: "Drains slowly and leaks from the bottom.", location: LocationType.on_site, tech: mobileTech,
      status: RequestStatus.awaiting_parts, createdHoursAgo: 40, warranty: WarrantyStatus.in_warranty,
    });
    const drainPump = await prisma.sparePart.findFirstOrThrow({ where: { name: "Drain pump" } });
    await prisma.serviceRequest.update({ where: { id: partsJob.id }, data: { decision: "warranty_repair", decidedAt: hoursAgo(30), serialNumber: "WM7-D4004" } });
    await prisma.partOrder.create({
      data: { sparePartId: drainPump.id, quantity: 2, status: "ordered", supplier: "Maishiy Texnika Ltd", serviceRequestId: partsJob.id, expectedAt: new Date(Date.now() + 3 * 86_400_000), note: "For a warranty repair" },
    });

    // Closed without a repair: replaced under warranty, and a rejected claim with a reason.
    const replacedJob = await seedRequest({
      type: ServiceType.repair, customer: dilnoza, product: ac, sale: null, defect: "dead_on_arrival",
      issue: "Unit does not start from the first day.", location: LocationType.in_shop, tech: shopTech,
      status: RequestStatus.replaced, createdHoursAgo: 200, warranty: WarrantyStatus.in_warranty,
    });
    await prisma.serviceRequest.update({
      where: { id: replacedJob.id },
      data: { completedAt: hoursAgo(180), resolutionType: "replace", decision: "replace", decidedAt: hoursAgo(190), finalCost: 0, estimatedCost: 0, paymentStatus: "not_required", serialNumber: "AC12-OLD-1" },
    });
    await prisma.replacementItem.create({ data: { serviceRequestId: replacedJob.id, productId: ac.id, serialNumber: "AC12-NEW-7781" } });
    const rejectedJob = await seedRequest({
      type: ServiceType.repair, customer: jasur, product: fridge, sale: null, defect: "failed_during_use",
      issue: "Door glass cracked.", location: LocationType.in_shop, tech: shopTech,
      status: RequestStatus.rejected, createdHoursAgo: 260, warranty: WarrantyStatus.not_applicable,
    });
    await prisma.serviceRequest.update({
      where: { id: rejectedJob.id },
      data: { completedAt: hoursAgo(250), decision: "reject", decidedAt: hoursAgo(250), rejectionReason: "Physical damage is not covered by the warranty", paymentStatus: "not_required" },
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
    const installService = await prisma.serviceCatalogItem.findFirstOrThrow({ where: { name: "Standard installation" } });
    await prisma.requestServiceLine.create({
      data: { serviceRequestId: install.id, serviceCatalogItemId: installService.id, priceAtTime: installService.price },
    });
    await prisma.requestPhoto.create({
      data: { serviceRequestId: install.id, photoUrl: demoPhoto, uploadedBy: mobileTech.name, staffUserId: mobileTech.id },
    });
  }

  // A couple of upcoming visits so the calendar is not empty in a fresh demo.
  const upcoming = await prisma.serviceRequest.findMany({ where: { status: "new", scheduledAt: null }, orderBy: { createdAt: "asc" }, take: 2, select: { id: true } });
  for (const [index, job] of upcoming.entries()) {
    const visit = new Date();
    visit.setDate(visit.getDate() + index + 1);
    visit.setHours(10 + index * 3, 0, 0, 0);
    await prisma.serviceRequest.update({ where: { id: job.id }, data: { scheduledAt: visit } });
  }

  // Demo data for the newer features: accountant, warehouse, checklists, help guides, warranty plans, a partner centre.
  await prisma.staffUser.upsert({
    where: { phone: "998900000006" },
    update: {},
    create: { name: "Gulnora Yusupova", phone: "998900000006", passwordHash: await password("acc12345"), role: StaffRole.accountant },
  });
  await prisma.staffUser.upsert({
    where: { phone: "998900000007" },
    update: {},
    create: { name: "Rustam Qodirov", phone: "998900000007", passwordHash: await password("ware1234"), role: StaffRole.warehouse },
  });
  await prisma.staffUser.update({ where: { phone: "998900000002" }, data: { skillCategories: ["Refrigerators", "Washing machines", "Air conditioners"], baseLat: 41.3111, baseLng: 69.2797 } });
  await prisma.staffUser.update({ where: { phone: "998900000004" }, data: { skillCategories: [], baseLat: 41.2995, baseLng: 69.2401 } });

  if ((await prisma.checklistTemplate.count()) === 0) {
    const item = (id: string, uz: string, ru: string, en: string, required = false) => ({ id, uz, ru, en, required });
    await prisma.checklistTemplate.createMany({
      data: [
        { kind: "diagnosis", productCategory: null, items: [item("power", "Elektr ta'minotini tekshirish", "Проверить питание", "Check the power supply"), item("display", "Xato kodini yozib olish", "Записать код ошибки", "Note the error code"), item("visual", "Tashqi ko'rik (shikast, suv, chang)", "Внешний осмотр (повреждения, вода, пыль)", "Visual check (damage, water, dust)")] },
        { kind: "completion", productCategory: null, items: [item("tested", "Qurilma ishlashi sinab ko'rildi", "Работа устройства проверена", "The device was tested", true), item("clean", "Ish joyi tozalandi", "Рабочее место убрано", "The work area was cleaned"), item("explained", "Mijozga tushuntirildi", "Клиенту объяснено", "Explained to the customer")] },
        { kind: "completion", productCategory: "Refrigerators", items: [item("tested", "Qurilma ishlashi sinab ko'rildi", "Работа устройства проверена", "The device was tested", true), item("temp", "Sovutish harorati normal", "Температура охлаждения в норме", "Cooling temperature is normal", true), item("door", "Eshik zichligi tekshirildi", "Уплотнитель двери проверен", "Door seal checked"), item("clean", "Ish joyi tozalandi", "Рабочее место убрано", "The work area was cleaned")] },
      ],
    });
  }
  if ((await prisma.helpArticle.count()) === 0) {
    await prisma.helpArticle.createMany({
      data: [
        { productCategory: "Refrigerators", titleUz: "Muzlatkich yaxshi sovutmayapti", titleRu: "Холодильник плохо охлаждает", titleEn: "The fridge does not cool well", bodyUz: "1. Eshik yaxshi yopilishini tekshiring.\n2. Orqa devor bilan oraliq kamida 5 sm bo'lsin.\n3. Haroratni 3-5 darajaga qo'ying.\n4. 24 soatda o'zgarmasa, servisga yozing.", bodyRu: "1. Проверьте, плотно ли закрывается дверь.\n2. Расстояние до задней стенки — не менее 5 см.\n3. Поставьте температуру 3–5 градусов.\n4. Если за 24 часа ничего не изменилось, напишите в сервис.", bodyEn: "1. Check that the door closes tightly.\n2. Leave at least 5 cm to the back wall.\n3. Set the temperature to 3-5 degrees.\n4. If nothing changes in 24 hours, write to the service.", sortOrder: 1 },
        { productCategory: "Washing machines", titleUz: "Kir yuvish mashinasi suv to'kmayapti", titleRu: "Стиральная машина не сливает воду", titleEn: "The washing machine does not drain", bodyUz: "1. Drenaj filtrini tozalang.\n2. Shlang bukilib qolmaganini tekshiring.\n3. Mashinani o'chirib qayta yoqing.", bodyRu: "1. Очистите фильтр слива.\n2. Проверьте, не перегнут ли шланг.\n3. Выключите и снова включите машину.", bodyEn: "1. Clean the drain filter.\n2. Check that the hose is not kinked.\n3. Switch the machine off and on again.", sortOrder: 1 },
        { productCategory: null, titleUz: "Servisga murojaat qilishdan oldin", titleRu: "Перед обращением в сервис", titleEn: "Before you contact the service", bodyUz: "Seriya raqami va xaridni tasdiqlovchi chekni tayyorlang. Nosozlikni telefon bilan suratga oling.", bodyRu: "Подготовьте серийный номер и чек. Сфотографируйте неисправность.", bodyEn: "Have the serial number and the receipt ready. Take a photo of the fault.", sortOrder: 9 },
      ],
    });
  }
  if ((await prisma.warrantyPlan.count()) === 0) {
    await prisma.warrantyPlan.createMany({
      data: [
        { name: "+12 months", nameUz: "+12 oy kafolat", nameRu: "+12 месяцев гарантии", nameEn: "+12 months warranty", months: 12, price: 250000, productCategories: ["Refrigerators", "Washing machines", "Air conditioners", "Televisions"] },
        { name: "+24 months", nameUz: "+24 oy kafolat", nameRu: "+24 месяца гарантии", nameEn: "+24 months warranty", months: 24, price: 450000, productCategories: ["Refrigerators", "Washing machines", "Air conditioners", "Televisions"] },
      ],
    });
  }
  if ((await prisma.serviceCenter.count({ where: { isPartner: true } })) === 0) {
    await prisma.serviceCenter.create({ data: { name: "Samarkand partner service", regionCode: "30", address: "Registan 5, Samarkand", phone: "+998 66 200 00 02", workingHours: "Mon-Sat 09:00-18:00", lat: 39.654, lng: 66.9597, isPartner: true, payoutPercent: 30, payoutFixedPerJob: 8000 } });
  }

  console.log("Seeded demo accounts and catalog:");
  console.log("  Admin      998900000001 / admin123");
  console.log("  Technician 998900000002 / tech123  (mobile)");
  console.log("  Technician 998900000004 / tech123  (service center)");
  console.log("  Front desk 998900000005 / desk123  (receptionist)");
  console.log("  Customer   998900000003 / customer123");
  console.log("  Accountant 998900000006 / acc12345  (reports and money, read only)");
  console.log("  Warehouse  998900000007 / ware1234  (parts and technician stock)");
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
