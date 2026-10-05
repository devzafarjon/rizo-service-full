import { PrismaClient, StaffRole } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

// Usage: DATABASE_URL="<the database>" npm run add-demo-accounts -w server
// Creates only the front-desk and customer demo accounts (nothing else) if they do not exist yet.
const prisma = new PrismaClient();

const staff = await prisma.staffUser.upsert({
  where: { phone: "998900000005" },
  update: {},
  create: { name: "Nigora Sodiqova", phone: "998900000005", passwordHash: await hashPassword("desk123"), role: StaffRole.receptionist },
});
const customer = await prisma.customer.upsert({
  where: { phone: "998900000003" },
  update: {},
  create: {
    name: "Dilnoza Alieva",
    phone: "998900000003",
    passwordHash: await hashPassword("customer123"),
    address: "12 Amir Temur Avenue, Tashkent",
    regionCode: "01",
  },
});
await prisma.$disconnect();
console.log(`Front desk ${staff.phone} and customer ${customer.phone} are ready.`);
