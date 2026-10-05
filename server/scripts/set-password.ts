import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { normalizePhone } from "../src/lib/phone.js";

// Usage: npm run set-password -w server -- <staff|customer> <phone> <new password>
// Run it with DATABASE_URL pointing at the database you want to change (the production one, for a live site).
const [kind, rawPhone, password] = process.argv.slice(2);
if ((kind !== "staff" && kind !== "customer") || !rawPhone || !password) {
  console.error("Usage: npm run set-password -w server -- <staff|customer> <phone> <new password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Use at least 8 characters.");
  process.exit(1);
}

const prisma = new PrismaClient();
const phone = normalizePhone(rawPhone);
const passwordHash = await hashPassword(password);
const result =
  kind === "staff"
    ? await prisma.staffUser.updateMany({ where: { phone }, data: { passwordHash } })
    : await prisma.customer.updateMany({ where: { phone }, data: { passwordHash } });
await prisma.$disconnect();
if (result.count === 0) {
  console.error(`No ${kind} account with phone ${phone}.`);
  process.exit(1);
}
console.log(`Password updated for ${kind} ${phone}.`);
