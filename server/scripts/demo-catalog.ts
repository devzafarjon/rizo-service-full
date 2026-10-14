/**
 * Fills in the reference data a fresh production database does not have (the demo loader only creates customers, sales
 * and requests): defect and return-reason codes, completion/diagnosis checklists, customer help guides, a partner
 * service centre, and the accountant and warehouse logins. Same data as `prisma/seed.ts`, but it never creates demo
 * requests. Safe to run again: existing rows are kept, tables that already have content are left alone.
 *
 *   DATABASE_URL=... npm run demo:catalog -w server
 */
import { PrismaClient, StaffRole } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

const prisma = new PrismaClient();

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

const item = (id: string, uz: string, ru: string, en: string, required = false) => ({ id, uz, ru, en, required });

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/x").hostname;
  console.log(`Catalog data for ${host}`);

  for (const code of defectCodes) {
    await prisma.defectCode.upsert({ where: { kind_code: { kind: code.kind, code: code.code } }, update: {}, create: code });
  }
  console.log(`Defect and return-reason codes: ${await prisma.defectCode.count()}`);

  if ((await prisma.checklistTemplate.count()) === 0) {
    await prisma.checklistTemplate.createMany({
      data: [
        { kind: "diagnosis", productCategory: null, items: [item("power", "Elektr ta'minotini tekshirish", "Проверить питание", "Check the power supply"), item("display", "Xato kodini yozib olish", "Записать код ошибки", "Note the error code"), item("visual", "Tashqi ko'rik (shikast, suv, chang)", "Внешний осмотр (повреждения, вода, пыль)", "Visual check (damage, water, dust)")] },
        { kind: "completion", productCategory: null, items: [item("tested", "Qurilma ishlashi sinab ko'rildi", "Работа устройства проверена", "The device was tested", true), item("clean", "Ish joyi tozalandi", "Рабочее место убрано", "The work area was cleaned"), item("explained", "Mijozga tushuntirildi", "Клиенту объяснено", "Explained to the customer")] },
        { kind: "completion", productCategory: "Refrigerators", items: [item("tested", "Qurilma ishlashi sinab ko'rildi", "Работа устройства проверена", "The device was tested", true), item("temp", "Sovutish harorati normal", "Температура охлаждения в норме", "Cooling temperature is normal", true), item("door", "Eshik zichligi tekshirildi", "Уплотнитель двери проверен", "Door seal checked"), item("clean", "Ish joyi tozalandi", "Рабочее место убрано", "The work area was cleaned")] },
      ],
    });
  }
  console.log(`Checklist templates: ${await prisma.checklistTemplate.count()}`);

  if ((await prisma.helpArticle.count()) === 0) {
    await prisma.helpArticle.createMany({
      data: [
        { productCategory: "Refrigerators", titleUz: "Muzlatkich yaxshi sovutmayapti", titleRu: "Холодильник плохо охлаждает", titleEn: "The fridge does not cool well", bodyUz: "1. Eshik yaxshi yopilishini tekshiring.\n2. Orqa devor bilan oraliq kamida 5 sm bo'lsin.\n3. Haroratni 3-5 darajaga qo'ying.\n4. 24 soatda o'zgarmasa, servisga yozing.", bodyRu: "1. Проверьте, плотно ли закрывается дверь.\n2. Расстояние до задней стенки — не менее 5 см.\n3. Поставьте температуру 3–5 градусов.\n4. Если за 24 часа ничего не изменилось, напишите в сервис.", bodyEn: "1. Check that the door closes tightly.\n2. Leave at least 5 cm to the back wall.\n3. Set the temperature to 3-5 degrees.\n4. If nothing changes in 24 hours, write to the service.", sortOrder: 1 },
        { productCategory: "Washing machines", titleUz: "Kir yuvish mashinasi suv to'kmayapti", titleRu: "Стиральная машина не сливает воду", titleEn: "The washing machine does not drain", bodyUz: "1. Drenaj filtrini tozalang.\n2. Shlang bukilib qolmaganini tekshiring.\n3. Mashinani o'chirib qayta yoqing.", bodyRu: "1. Очистите фильтр слива.\n2. Проверьте, не перегнут ли шланг.\n3. Выключите и снова включите машину.", bodyEn: "1. Clean the drain filter.\n2. Check that the hose is not kinked.\n3. Switch the machine off and on again.", sortOrder: 1 },
        { productCategory: null, titleUz: "Servisga murojaat qilishdan oldin", titleRu: "Перед обращением в сервис", titleEn: "Before you contact the service", bodyUz: "Seriya raqami va xaridni tasdiqlovchi chekni tayyorlang. Nosozlikni telefon bilan suratga oling.", bodyRu: "Подготовьте серийный номер и чек. Сфотографируйте неисправность.", bodyEn: "Have the serial number and the receipt ready. Take a photo of the fault.", sortOrder: 9 },
      ],
    });
  }
  console.log(`Help articles: ${await prisma.helpArticle.count()}`);

  if ((await prisma.serviceCenter.count({ where: { isPartner: true } })) === 0) {
    await prisma.serviceCenter.create({ data: { name: "Samarkand partner service", regionCode: "30", address: "Registan 5, Samarkand", phone: "+998 66 200 00 02", workingHours: "Mon-Sat 09:00-18:00", lat: 39.654, lng: 66.9597, isPartner: true, payoutPercent: 30, payoutFixedPerJob: 8000 } });
  }
  console.log(`Partner centres: ${await prisma.serviceCenter.count({ where: { isPartner: true } })}`);

  await prisma.staffUser.upsert({
    where: { phone: "998900000006" },
    update: {},
    create: { name: "Gulnora Yusupova", phone: "998900000006", passwordHash: await hashPassword("acc12345"), role: StaffRole.accountant },
  });
  await prisma.staffUser.upsert({
    where: { phone: "998900000007" },
    update: {},
    create: { name: "Rustam Qodirov", phone: "998900000007", passwordHash: await hashPassword("ware1234"), role: StaffRole.warehouse },
  });
  console.log(`Staff: ${await prisma.staffUser.count()} (accountant and warehouse logins ready)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
