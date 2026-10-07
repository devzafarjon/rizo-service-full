// Sends a test push to the phones a person is signed in on:  npm run push-test -w server -- <phone> [staff|customer]
// Needs FIREBASE_SERVICE_ACCOUNT (or FIREBASE_SERVICE_ACCOUNT_FILE) in the environment.
import { prisma } from "../src/lib/prisma.js";
import { pushConfigured, pushToCustomer, pushToStaff } from "../src/lib/push.js";
import { normalizePhone } from "../src/lib/phone.js";

const [rawPhone, scope = "staff"] = process.argv.slice(2);
if (!rawPhone) {
  console.error("Usage: push-test <phone> [staff|customer]");
  process.exit(1);
}
const phone = normalizePhone(rawPhone);
console.log(pushConfigured() ? "Firebase is configured." : "Firebase is NOT configured: the push will only be logged.");

// Points at a request of that person (the newest one the technician has, or the customer's own), so tapping the
// notification should open it in the app.
const ownerFilter = scope === "customer" ? { customer: { phone } } : { assignedTechnician: { phone } };
const request =
  (await prisma.serviceRequest.findFirst({ where: ownerFilter, orderBy: { createdAt: "desc" }, select: { id: true, displayId: true } })) ??
  (await prisma.serviceRequest.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, displayId: true } }));
const input = { message: "Test notification from RIZO Service", code: "overdue", params: { displayId: request?.displayId ?? "051026010063" }, serviceRequestId: request?.id };
if (scope === "customer") {
  const customer = await prisma.customer.findUnique({ where: { phone }, select: { id: true, _count: { select: { deviceTokens: true } } } });
  if (!customer) throw new Error("No customer with that phone");
  console.log(`Devices: ${customer._count.deviceTokens}`);
  await pushToCustomer(customer.id, input);
} else {
  const staff = await prisma.staffUser.findUnique({ where: { phone }, select: { id: true, _count: { select: { deviceTokens: true } } } });
  if (!staff) throw new Error("No staff member with that phone");
  console.log(`Devices: ${staff._count.deviceTokens}`);
  await pushToStaff(staff.id, input);
}
await prisma.$disconnect();
console.log("Done.");
