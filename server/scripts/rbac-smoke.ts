/**
 * Who may call what, for the warehouse, transfer, part-order and Telegram routes: every role against every route, plus the keeper who
 * runs only one warehouse. Needs the API running (SMOKE_API) on a scratch database with the demo seed.
 *   npm run smoke:rbac -w server
 */
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const API = process.env.SMOKE_API ?? "http://localhost:4100";
let failed = 0;
function assert(condition: unknown, message: string) {
  if (condition) return console.log(`  ok  ${message}`);
  failed += 1;
  console.error(`  FAIL ${message}`);
}

async function call(method: string, path: string, token: string | null, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
async function signIn(phone: string, password: string) {
  const res = await call("POST", "/api/auth/login", null, { phone, password });
  return res.body.token as string;
}

const ok = (s: number) => s >= 200 && s < 300;
const denied = (s: number) => s === 401 || s === 403;

async function main() {
  const tokens = {
    admin: await signIn("998900000001", "admin123"),
    desk: await signIn("998900000005", "desk123"),
    accountant: await signIn("998900000006", "acc12345"),
    keeper: await signIn("998900000007", "ware1234"),
    tech: await signIn("998900000002", "tech123"),
    customer: await signIn("998900000003", "customer123"),
  };
  const part = (await call("GET", "/api/staff/catalog/parts", tokens.admin)).body.parts[0];
  const central = (await call("GET", "/api/staff/warehouses", tokens.admin)).body.warehouses.find((w: any) => w.kind === "central");

  console.log("reading the warehouses");
  for (const [role, expectOk] of [["admin", true], ["desk", true], ["accountant", true], ["keeper", true], ["tech", false], ["customer", false]] as const) {
    const res = await call("GET", "/api/staff/warehouses", tokens[role]);
    assert(expectOk ? ok(res.status) : denied(res.status), `${role}: warehouses list ${expectOk ? "allowed" : "refused"} (${res.status})`);
  }
  assert(denied((await call("GET", "/api/staff/warehouses", null)).status), "no token: warehouses refused");

  console.log("changing warehouses and shelves");
  const created = await call("POST", "/api/staff/warehouses", tokens.admin, { name: `RBAC ${Date.now()}`, kind: "regional", regionCode: "30", leadDaysSameRegion: 1, leadDaysOtherRegion: 3 });
  assert(created.status === 201, "admin creates a warehouse");
  const wid = created.body.warehouse.id as string;
  for (const role of ["desk", "accountant", "keeper", "tech", "customer"] as const) {
    const res = await call("POST", "/api/staff/warehouses", tokens[role], { name: "x", kind: "regional", regionCode: "30", leadDaysSameRegion: 1, leadDaysOtherRegion: 3 });
    assert(denied(res.status), `${role}: creating a warehouse refused (${res.status})`);
  }
  assert(denied((await call("PATCH", `/api/staff/warehouses/${wid}`, tokens.keeper, { name: "renamed" })).status), "a keeper cannot rename a warehouse");
  for (const [role, expectOk] of [["admin", true], ["keeper", true], ["desk", false], ["accountant", false], ["tech", false]] as const) {
    const res = await call("PATCH", `/api/staff/warehouses/${central.id}/stock/${part.id}`, tokens[role], { minQuantity: 2 });
    assert(expectOk ? ok(res.status) : denied(res.status), `${role}: shelf minimum ${expectOk ? "allowed" : "refused"} (${res.status})`);
  }

  console.log("requests between warehouses");
  let transferId = "";
  for (const [role, expectOk] of [["admin", true], ["desk", true], ["keeper", true], ["accountant", false], ["tech", false], ["customer", false]] as const) {
    const res = await call("POST", "/api/staff/transfers", tokens[role], { sparePartId: part.id, quantity: 1, fromWarehouseId: central.id, toWarehouseId: wid });
    assert(expectOk ? ok(res.status) : denied(res.status), `${role}: asking for a part ${expectOk ? "allowed" : "refused"} (${res.status})`);
    if (ok(res.status) && !transferId) transferId = res.body.transfer.id;
  }
  assert(denied((await call("GET", "/api/staff/transfers", tokens.tech)).status), "a technician cannot list warehouse requests");
  assert(ok((await call("GET", "/api/staff/transfers", tokens.accountant)).status), "an accountant can read them");
  assert(denied((await call("POST", `/api/staff/transfers/${transferId}/ship`, tokens.desk, {})).status), "the front desk cannot send a request");
  assert(denied((await call("POST", `/api/staff/transfers/${transferId}/reject`, tokens.accountant, { reason: "x" })).status), "an accountant cannot refuse one");

  console.log("a keeper of one warehouse only");
  const other = await call("POST", "/api/staff/warehouses", tokens.admin, { name: `RBAC other ${Date.now()}`, kind: "regional", regionCode: "40", leadDaysSameRegion: 1, leadDaysOtherRegion: 3 });
  const otherId = other.body.warehouse.id as string;
  const phone = `99890${String(Date.now()).slice(-7)}`;
  const solo = await prisma.staffUser.create({ data: { name: "RBAC keeper", phone, passwordHash: await hashPassword("rbac-pass-1"), role: "warehouse", warehouseId: otherId } });
  const soloToken = await signIn(phone, "rbac-pass-1");
  assert(denied((await call("POST", `/api/staff/transfers/${transferId}/ship`, soloToken, {})).status), "a keeper cannot send what another warehouse was asked for");
  assert(denied((await call("PATCH", `/api/staff/warehouses/${central.id}/stock/${part.id}`, soloToken, { quantity: 1 })).status), "a keeper cannot count another warehouse's shelf");
  assert(ok((await call("PATCH", `/api/staff/warehouses/${otherId}/stock/${part.id}`, soloToken, { quantity: 3 })).status), "a keeper can count their own shelf");
  const mine = await call("GET", "/api/staff/warehouses/mine", soloToken);
  assert(mine.body.warehouseId === otherId && mine.body.canManageAll === false, "a keeper's own warehouse is theirs alone");
  assert(denied((await call("POST", `/api/staff/warehouses/${central.id}/restock`, soloToken, { items: [{ sparePartId: part.id, quantity: 1, from: otherId }] })).status), "a keeper cannot restock another warehouse");

  console.log("part orders, technician side, settings");
  for (const [role, expectOk] of [["admin", true], ["desk", true], ["keeper", true], ["accountant", false], ["tech", false], ["customer", false]] as const) {
    const res = await call("GET", "/api/staff/part-orders/overview", tokens[role]);
    assert(expectOk ? ok(res.status) : denied(res.status), `${role}: part orders ${expectOk ? "allowed" : "refused"} (${res.status})`);
  }
  assert(ok((await call("GET", `/api/staff/my-jobs/part-sources?partId=${part.id}&quantity=1`, tokens.tech)).status), "a technician sees where a part can come from");
  assert(denied((await call("GET", `/api/staff/my-jobs/part-sources?partId=${part.id}&quantity=1`, tokens.customer)).status), "a customer does not");
  assert(denied((await call("PATCH", "/api/staff/settings", tokens.desk, { transferShipHours: 5 })).status), "the front desk cannot change settings");

  console.log("telegram link routes keep the two sides apart");
  assert(ok((await call("GET", "/api/staff/telegram", tokens.tech)).status), "staff read their Telegram status");
  assert(denied((await call("GET", "/api/staff/telegram", tokens.customer)).status), "a customer token does not open the staff status");
  assert(ok((await call("GET", "/api/customer/telegram", tokens.customer)).status), "customers read their Telegram status");
  assert(denied((await call("GET", "/api/customer/telegram", tokens.tech)).status), "a staff token does not open the customer status");
  assert(denied((await call("POST", "/api/telegram/webhook", null, { update_id: 1 })).status), "the webhook refuses a call without the secret");

  // clean up
  await prisma.stockTransfer.deleteMany({ where: { OR: [{ toWarehouseId: wid }, { toWarehouseId: otherId }, { fromWarehouseId: otherId }] } });
  await prisma.stockMovement.deleteMany({ where: { warehouseId: { in: [wid, otherId] } } });
  await prisma.partStock.deleteMany({ where: { warehouseId: { in: [wid, otherId] } } });
  await prisma.staffUser.delete({ where: { id: solo.id } });
  await prisma.warehouse.deleteMany({ where: { id: { in: [wid, otherId] } } });
  await prisma.sparePart.update({ where: { id: part.id }, data: { stockQuantity: (await prisma.partStock.aggregate({ where: { sparePartId: part.id }, _sum: { quantity: true } }))._sum.quantity ?? 0 } });

  console.log(failed ? `\n${failed} check(s) failed` : "\nrbac smoke: all passed");
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
