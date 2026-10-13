/**
 * Stock stays right when several people press the same button at once: a request sent twice, received twice, and more requests
 * than the shelf holds sent together. Afterwards the part's total must still equal the sum of its shelves.
 * Needs the API running (SMOKE_API) on a scratch database with the demo seed.
 *   npm run smoke:concurrency -w server
 */
import { prisma } from "../src/lib/prisma.js";

const API = process.env.SMOKE_API ?? "http://localhost:4100";
let failed = 0;
function assert(condition: unknown, message: string) {
  if (condition) return console.log(`  ok  ${message}`);
  failed += 1;
  console.error(`  FAIL ${message}`);
}
async function call(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any };
}
const consistent = async (partId: string) => {
  const part = await prisma.sparePart.findUniqueOrThrow({ where: { id: partId } });
  const sum = (await prisma.partStock.aggregate({ where: { sparePartId: partId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  const negative = await prisma.partStock.count({ where: { sparePartId: partId, quantity: { lt: 0 } } });
  return part.stockQuantity === sum && negative === 0;
};

async function main() {
  const login = await (await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "998900000001", password: "admin123" }) })).json();
  const admin = login.token as string;
  const part = (await call("GET", "/api/staff/catalog/parts", admin)).body.parts[0];
  const warehouses = (await call("GET", "/api/staff/warehouses", admin)).body.warehouses;
  const central = warehouses.find((w: any) => w.kind === "central");
  const made = await Promise.all(
    ["A", "B"].map((tag) => call("POST", "/api/staff/warehouses", admin, { name: `Race ${tag} ${Date.now()}`, kind: "regional", regionCode: "30", leadDaysSameRegion: 1, leadDaysOtherRegion: 3 })),
  );
  const [a, b] = made.map((res) => res.body.warehouse.id as string);
  await call("PATCH", `/api/staff/warehouses/${a}/stock/${part.id}`, admin, { quantity: 3 });
  assert(await consistent(part.id), "start: the total equals the shelves");

  console.log("one request sent five times at once");
  const one = await call("POST", "/api/staff/transfers", admin, { sparePartId: part.id, quantity: 2, fromWarehouseId: a, toWarehouseId: b });
  const sends = await Promise.all(Array.from({ length: 5 }, () => call("POST", `/api/staff/transfers/${one.body.transfer.id}/ship`, admin, {})));
  assert(sends.filter((r) => r.status === 200).length === 1, `exactly one send succeeds (${sends.map((r) => r.status).join(",")})`);
  assert((await prisma.partStock.findUniqueOrThrow({ where: { warehouseId_sparePartId: { warehouseId: a, sparePartId: part.id } } })).quantity === 1, "the shelf lost 2 once, not 10");
  const gets = await Promise.all(Array.from({ length: 5 }, () => call("POST", `/api/staff/transfers/${one.body.transfer.id}/receive`, admin, {})));
  assert(gets.filter((r) => r.status === 200).length === 1, `exactly one receipt succeeds (${gets.map((r) => r.status).join(",")})`);
  assert((await prisma.partStock.findUniqueOrThrow({ where: { warehouseId_sparePartId: { warehouseId: b, sparePartId: part.id } } })).quantity === 2, "the receiver got 2 once");
  assert(await consistent(part.id), "the total still equals the shelves");

  console.log("more requests than the shelf holds, sent together");
  const many = await Promise.all(Array.from({ length: 6 }, () => call("POST", "/api/staff/transfers", admin, { sparePartId: part.id, quantity: 1, fromWarehouseId: b, toWarehouseId: a })));
  const ids = many.filter((r) => r.status === 201).map((r) => r.body.transfer.id as string);
  const shipped = await Promise.all(ids.map((id) => call("POST", `/api/staff/transfers/${id}/ship`, admin, {})));
  const okCount = shipped.filter((r) => r.status === 200).length;
  assert(okCount === 2, `only what is on the shelf can leave (2 of ${ids.length}: ${shipped.map((r) => r.status).join(",")})`);
  assert((await prisma.partStock.findUniqueOrThrow({ where: { warehouseId_sparePartId: { warehouseId: b, sparePartId: part.id } } })).quantity === 0, "the shelf is empty, never below zero");
  assert(await consistent(part.id), "the total still equals the shelves");

  console.log("an order received five times at once");
  const before = (await prisma.partStock.findUnique({ where: { warehouseId_sparePartId: { warehouseId: a, sparePartId: part.id } } }))?.quantity ?? 0;
  const order = await call("POST", "/api/staff/part-orders", admin, { sparePartId: part.id, quantity: 3, warehouseId: a });
  const receipts = await Promise.all(Array.from({ length: 5 }, () => call("PATCH", `/api/staff/part-orders/${order.body.order.id}`, admin, { status: "received" })));
  assert(receipts.filter((r) => r.status === 200).length === 1, `exactly one receipt succeeds (${receipts.map((r) => r.status).join(",")})`);
  assert((await prisma.partStock.findUniqueOrThrow({ where: { warehouseId_sparePartId: { warehouseId: a, sparePartId: part.id } } })).quantity === before + 3, "the stock went up by 3 once");
  assert(await consistent(part.id), "the total still equals the shelves");

  // clean up: parts in transit go back, then the two warehouses go
  await prisma.stockTransfer.deleteMany({ where: { OR: [{ fromWarehouseId: { in: [a, b] } }, { toWarehouseId: { in: [a, b] } }] } });
  await prisma.stockMovement.deleteMany({ where: { warehouseId: { in: [a, b] } } });
  await prisma.partStock.deleteMany({ where: { warehouseId: { in: [a, b] } } });
  await prisma.partOrder.deleteMany({ where: { warehouseId: { in: [a, b] } } });
  await prisma.warehouse.deleteMany({ where: { id: { in: [a, b] } } });
  await prisma.sparePart.update({ where: { id: part.id }, data: { stockQuantity: (await prisma.partStock.aggregate({ where: { sparePartId: part.id }, _sum: { quantity: true } }))._sum.quantity ?? 0 } });
  void central;
  console.log(failed ? `\n${failed} check(s) failed` : "\nconcurrency smoke: all passed");
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
