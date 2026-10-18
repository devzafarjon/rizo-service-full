/**
 * The one website sign-in (POST /api/auth/login) and the hints the apps get when an account belongs to the other side.
 * Needs the API running (SMOKE_API) on a scratch database with the demo seed.
 *   npm run smoke:auth -w server
 */
import jwt from "jsonwebtoken";
import { env } from "../src/config.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { generateTotpSecret, totpCode } from "../src/lib/totp.js";

const API = process.env.SMOKE_API ?? "http://localhost:4100";
let failed = 0;
function assert(condition: unknown, message: string) {
  if (condition) return console.log(`  ok  ${message}`);
  failed += 1;
  console.error(`  FAIL ${message}`);
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const unified = (phone: string, password: string, extra: Record<string, unknown> = {}) => post("/api/auth/login", { phone, password, ...extra });

async function main() {
  console.log("who is who");
  const admin = await unified("998900000001", "admin123");
  assert(admin.status === 200 && admin.body.scope === "staff" && admin.body.user.role === "admin" && admin.body.token, "staff sign in and are told they are staff");
  const me = await fetch(`${API}/api/staff/auth/me`, { headers: { Authorization: `Bearer ${admin.body.token}` } });
  assert(me.status === 200, "the staff token works on the staff API");
  const customer = await unified("+998 90 000 00 03", "customer123");
  assert(customer.status === 200 && customer.body.scope === "customer" && customer.body.user.name, "customers sign in with a formatted phone and are told they are customers");
  const portal = await fetch(`${API}/api/customer/auth/me`, { headers: { Authorization: `Bearer ${customer.body.token}` } });
  assert(portal.status === 200, "the customer token works on the portal API");
  const crossed = await fetch(`${API}/api/staff/auth/me`, { headers: { Authorization: `Bearer ${customer.body.token}` } });
  assert(crossed.status === 401 || crossed.status === 403, "a customer token does not open the staff API");

  console.log("the session renews itself while the person keeps using the app");
  const meFresh = await (await fetch(`${API}/api/staff/auth/me`, { headers: { Authorization: `Bearer ${admin.body.token}` } })).json().catch(() => ({}));
  assert(!("token" in meFresh), "a token that was just issued is not swapped");
  const adminClaims = jwt.decode(admin.body.token) as Record<string, any>;
  const aged = (claims: Record<string, any>, hours: number) => jwt.sign({ sub: claims.sub, scope: claims.scope, ...(claims.role ? { role: claims.role } : {}), name: claims.name, phone: claims.phone, iat: Math.floor(Date.now() / 1000) - hours * 3600 }, env.jwtSecret, { expiresIn: "30d" });
  const old = aged(adminClaims, 13);
  const oldMe = await (await fetch(`${API}/api/staff/auth/me`, { headers: { Authorization: `Bearer ${old}` } })).json().catch(() => ({}));
  assert(typeof oldMe.token === "string" && oldMe.token !== old, "a staff token older than half a day comes back with a fresh one");
  const renewed = jwt.decode(oldMe.token) as Record<string, any>;
  assert(Math.floor(Date.now() / 1000) - renewed.iat < 60 && renewed.exp - renewed.iat === adminClaims.exp - adminClaims.iat, "the fresh token starts now and lasts as long as a sign-in token");
  assert((await fetch(`${API}/api/staff/auth/me`, { headers: { Authorization: `Bearer ${oldMe.token}` } })).status === 200, "the fresh token works");
  const customerClaims = jwt.decode(customer.body.token) as Record<string, any>;
  const oldCustomerMe = await (await fetch(`${API}/api/customer/auth/me`, { headers: { Authorization: `Bearer ${aged(customerClaims, 13)}` } })).json().catch(() => ({}));
  assert(typeof oldCustomerMe.token === "string", "the same for a customer");
  const expired = jwt.sign({ sub: adminClaims.sub, scope: "staff", role: "admin", name: "x", phone: "1", iat: Math.floor(Date.now() / 1000) - 40 * 86400 }, env.jwtSecret, { expiresIn: "30d" });
  assert((await fetch(`${API}/api/staff/auth/me`, { headers: { Authorization: `Bearer ${expired}` } })).status === 401, "a session unused for longer than its lifetime is over");

  console.log("wrong answers say the same thing");
  const wrongPassword = await unified("998900000001", "nope-nope");
  const unknownPhone = await unified("998900007777", "nope-nope");
  assert(wrongPassword.status === 401 && unknownPhone.status === 401 && wrongPassword.body.code === "badCredentials" && wrongPassword.body.error === unknownPhone.body.error, "a wrong password and an unknown phone look the same");
  const empty = await post("/api/auth/login", { phone: "", password: "" });
  assert(empty.status === 400, "an empty form is refused");

  console.log("one phone, two accounts");
  const tech = await prisma.staffUser.findUniqueOrThrow({ where: { phone: "998900000002" } });
  const twin = await prisma.customer.create({ data: { name: "Tech Twin", phone: "998900000002", passwordHash: await hashPassword("tech123"), regionCode: "01" } });
  const both = await unified("998900000002", "tech123");
  assert(both.status === 200 && Array.isArray(both.body.choose) && !both.body.token, "the same phone and password ask which side, without a token");
  const asStaff = await unified("998900000002", "tech123", { as: "staff" });
  const asCustomer = await unified("998900000002", "tech123", { as: "customer" });
  assert(asStaff.body.scope === "staff" && asStaff.body.user.id === tech.id, "choosing staff signs in the staff account");
  assert(asCustomer.body.scope === "customer" && asCustomer.body.user.id === twin.id, "choosing customer signs in the customer account");
  await prisma.customer.update({ where: { id: twin.id }, data: { passwordHash: await hashPassword("other-pass-1") } });
  const staffOnly = await unified("998900000002", "tech123");
  const customerOnly = await unified("998900000002", "other-pass-1");
  assert(staffOnly.body.scope === "staff" && customerOnly.body.scope === "customer", "different passwords need no choice: each opens its own account");
  const bogusSide = await unified("998900000002", "tech123", { as: "customer" });
  assert(bogusSide.status === 401, "asking for the side the password does not open is refused");
  await prisma.customer.delete({ where: { id: twin.id } });

  console.log("two-step sign-in and deactivated staff");
  const secret = generateTotpSecret();
  await prisma.staffUser.update({ where: { id: tech.id }, data: { totpEnabled: true, totpSecret: secret } });
  const needCode = await unified("998900000002", "tech123");
  assert(needCode.status === 401 && needCode.body.code === "totpRequired", "a staff account with two-step asks for the code after the password");
  const badCode = await unified("998900000002", "tech123", { code: "000000" });
  assert(badCode.status === 401 && badCode.body.code === "totpInvalid", "a wrong code is refused");
  const goodCode = await unified("998900000002", "tech123", { code: totpCode(secret) });
  assert(goodCode.status === 200 && goodCode.body.scope === "staff", "the right code signs in");
  await prisma.staffUser.update({ where: { id: tech.id }, data: { totpEnabled: false, totpSecret: null, isActive: false } });
  const inactive = await unified("998900000002", "tech123");
  assert(inactive.status === 403 && inactive.body.code === "accountInactive", "a deactivated staff account cannot sign in");
  await prisma.staffUser.update({ where: { id: tech.id }, data: { isActive: true } });

  console.log("the apps are pointed to the other app");
  const staffAppWithCustomer = await post("/api/staff/auth/login", { phone: "998900000003", password: "customer123" });
  assert(staffAppWithCustomer.status === 403 && staffAppWithCustomer.body.code === "useCustomerApp", "the staff app tells a customer to use RIZO Mijoz");
  const customerAppWithStaff = await post("/api/customer/auth/login", { phone: "998900000001", password: "admin123" });
  assert(customerAppWithStaff.status === 403 && customerAppWithStaff.body.code === "useStaffApp", "the customer app tells staff to use RIZO Texnik");
  const plainWrong = await post("/api/staff/auth/login", { phone: "998900000003", password: "wrong-wrong" });
  assert(plainWrong.status === 401 && plainWrong.body.code === "badCredentials", "a wrong password in the apps is still just wrong");
  const stillWorks = await post("/api/staff/auth/login", { phone: "998900000002", password: "tech123" });
  assert(stillWorks.status === 200, "the old staff sign-in still works for the app");
  const localStaff = await post("/api/staff/auth/login", { phone: "90 000 00 02", password: "tech123" });
  assert(localStaff.status === 200, "a 9-digit local number signs staff in to the app");
  const localUnified = await unified("900000003", "customer123");
  assert(localUnified.status === 200 && localUnified.body.scope === "customer", "a 9-digit local number signs in on the web too");

  console.log("too many attempts");
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await unified("998900008888", `wrong-${i}`)).status;
  assert(last === 429, "ten failed attempts on one phone lock it for a while");

  console.log(failed ? `\n${failed} check(s) failed` : "\nauth smoke: all passed");
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
