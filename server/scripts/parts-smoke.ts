/**
 * Checks for spare-part control: suppliers, waiting jobs, order recommendations, partial and cross-job receiving,
 * customer and staff notices, late deliveries and the access rules.
 * Needs the API running (SMOKE_API) on a scratch database that was seeded.
 *   npm run smoke:parts -w server
 */
import { prisma } from "../src/lib/prisma.js";
import { runPartsWatch } from "../src/lib/partsControl.js";

const API = process.env.SMOKE_API ?? "http://localhost:4100";
let failed = 0;
function assert(condition: unknown, message: string) {
  if (condition) return console.log(`  ok  ${message}`);
  failed += 1;
  console.error(`  FAIL ${message}`);
}

type Res<T = any> = { status: number; body: T };
async function api<T = any>(path: string, options: RequestInit & { token?: string } = {}): Promise<Res<T>> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: { ...(rest.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}
const post = (path: string, token: string, data: unknown = {}) => api(path, { method: "POST", token, body: JSON.stringify(data) });
const patch = (path: string, token: string, data: unknown) => api(path, { method: "PATCH", token, body: JSON.stringify(data) });

async function login(scope: "staff" | "customer", phone: string, password: string) {
  const res = await api(`/api/${scope}/auth/login`, { method: "POST", body: JSON.stringify({ phone, password }) });
  assert(res.status === 200 && res.body.token, `sign in ${phone}`);
  return { token: res.body.token as string, id: res.body.user?.id as string };
}

function ymd(offsetDays: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

async function main() {
  const tag = String(Date.now()).slice(-6);
  const admin = await login("staff", "998900000001", "admin123");
  const desk = await login("staff", "998900000005", "desk123");
  // Aziz has no centre or shelf of his own, so his jobs take parts from the central warehouse (the shelf this suite stocks).
  const tech = await login("staff", "998900000002", "tech123");
  const accountant = await login("staff", "998900000006", "acc12345");
  const warehouse = await login("staff", "998900000007", "ware1234");
  const customer = await login("customer", "998900000003", "customer123");

  console.log("access");
  assert((await api("/api/staff/part-orders/overview", { token: tech.token })).status === 403, "a technician cannot open the parts control");
  assert((await api("/api/staff/part-orders/overview", { token: accountant.token })).status === 403, "an accountant cannot open the parts control");
  assert((await api("/api/staff/part-orders/overview", { token: warehouse.token })).status === 200, "the warehouse can");
  assert((await api("/api/staff/part-orders/overview", { token: desk.token })).status === 200, "the front desk can");
  assert((await api("/api/staff/alerts", { token: warehouse.token })).status === 200, "the warehouse reads its own alerts");
  assert((await post("/api/staff/suppliers", desk.token, { name: "x" })).status === 403, "the front desk cannot edit suppliers");
  assert((await api("/api/staff/suppliers", { token: desk.token })).status === 200, "the front desk can read suppliers");

  console.log("suppliers and part settings");
  const supplier = await post("/api/staff/suppliers", warehouse.token, { name: `Smoke Supplier ${tag}`, phone: "998901112233", leadTimeDays: 2 });
  assert(supplier.status === 201 && supplier.body.supplier.leadTimeDays === 2, "the warehouse creates a supplier");
  const products = await api("/api/staff/products", { token: admin.token });
  const fridge = products.body.products.find((row: any) => row.sku === "REF-280");
  const part = await post("/api/staff/catalog/parts", admin.token, {
    name: `Smoke part ${tag}`, price: 50000, costPrice: 30000, productCategories: [fridge.category], stockQuantity: 2, lowStockThreshold: 3, supplierId: supplier.body.supplier.id, targetStock: 10,
  });
  assert(part.status === 201 && part.body.part.supplierId === supplier.body.supplier.id && part.body.part.targetStock === 10, "a part keeps its supplier and target stock");
  const partId = part.body.part.id as string;
  const customers = await api("/api/staff/customers", { token: admin.token });
  const dilnoza = customers.body.customers.find((row: any) => row.phone === "998900000003");

  const makeJob = async () => {
    const job = await post("/api/staff/requests", admin.token, { customerId: dilnoza.id, productId: fridge.id, type: "repair", issueDescription: `Parts smoke ${tag}`, locationType: "on_site", customerLocation: { address: "Tashkent, Chilonzor 5" }, technicianTypeRequired: "mobile", assignedTechnicianId: tech.id, autoAssign: false, allowDuplicate: true, defectType: "failed_during_use" });
    assert(job.status === 201, "a repair job is created");
    const id = job.body.request.id as string;
    await patch(`/api/staff/my-jobs/${id}`, tech.token, { column: "in_progress" });
    const est = await post(`/api/staff/my-jobs/${id}/estimates`, tech.token, { send: true, lines: [{ kind: "labor", name: "Smoke labor", unitPrice: 10000 }, { kind: "part", sparePartId: partId, quantity: 5 }] });
    assert(est.status === 201, "the technician sends an estimate with the part");
    const detail = await api(`/api/staff/requests/${id}`, { token: admin.token });
    const approve = await post(`/api/staff/requests/${id}/estimates/${detail.body.estimates[0].id}/approve`, desk.token, {});
    assert(approve.status === 200 && approve.body.waitingForParts === true, "approval with a stock shortage means waiting for the part");
    return id;
  };
  const jobA = await makeJob();
  const jobB = await makeJob();

  console.log("waiting jobs");
  const waiting = await api("/api/staff/part-orders/waiting", { token: warehouse.token });
  const a = waiting.body.requests.find((row: any) => row.id === jobA);
  const b = waiting.body.requests.find((row: any) => row.id === jobB);
  assert(a && b && a.status === "awaiting_parts", "both jobs are listed as waiting for a part");
  assert(a.items[0].needed === 5 && a.items[0].ordered === 5 && a.noOrder === false, "job A: needs 5, 5 are on order");
  assert(a.expectedAt === ymd(2), "the expected date comes from the supplier's delivery time");
  const orderA = a.items[0].orders[0].id as string;
  const orderB = b.items[0].orders[0].id as string;

  console.log("what the customer sees");
  const portal = await api(`/api/customer/requests/${jobA}`, { token: customer.token });
  assert(portal.body.request.partWait && portal.body.request.partWait.ordered === false && portal.body.request.partWait.expectedAt === ymd(2), "the portal shows a part wait with the expected date");
  const track = await api(`/api/public/track/${portal.body.request.trackingToken}`);
  assert(track.body.request.partWait?.expectedAt === ymd(2), "the public tracking page shows it too");

  console.log("jobs with nothing ordered");
  assert((await patch(`/api/staff/part-orders/${orderB}`, admin.token, { status: "cancelled" })).status === 200, "the order of job B is cancelled");
  const waiting2 = await api("/api/staff/part-orders/waiting", { token: admin.token });
  assert(waiting2.body.requests.find((row: any) => row.id === jobB)?.noOrder === true, "job B now shows that nothing is ordered");
  assert(waiting2.body.requests[0].noOrder === true, "jobs with nothing ordered come first");
  await prisma.serviceRequest.update({ where: { id: jobB }, data: { statusChangedAt: new Date(Date.now() - 5 * 86_400_000) } });
  await prisma.notification.updateMany({ where: { serviceRequestId: jobB }, data: { createdAt: new Date(Date.now() - 5 * 86_400_000) } });

  console.log("recommendations");
  const rec = await api("/api/staff/part-orders/recommendations", { token: warehouse.token });
  const group = rec.body.groups.find((row: any) => row.supplier?.id === supplier.body.supplier.id);
  const item = group?.items.find((row: any) => row.part.id === partId);
  assert(Boolean(item), "the part is recommended under its supplier");
  assert(item.reasons.includes("waiting"), "reason: a job is waiting for more than is in stock and on order");
  assert(item.uncovered === 3 && item.recommended === 10 + 3 - 2 - 5, `quantity covers the target and the missing 3 (${item?.recommended})`);
  const dash = await api("/api/staff/reports/dashboard?preset=month", { token: admin.token });
  assert(dash.body.parts && dash.body.parts.waitingRequests >= 2, "the admin dashboard carries the parts numbers");
  const overview = await api("/api/staff/part-orders/overview", { token: admin.token });
  assert(overview.body.overview.waitingRequests >= 2 && overview.body.overview.noOrder >= 1 && overview.body.overview.toOrder >= 1, "the overview counts waiting jobs, jobs without an order and parts to order");

  console.log("watch: nothing ordered, customer news");
  const watch = await runPartsWatch(true);
  assert((watch?.noOrder ?? 0) >= 1, "the office is warned about the job without an order");
  const warned = await prisma.notification.findFirst({ where: { code: "partNoOrder", serviceRequestId: jobB, staffUserId: warehouse.id } });
  assert(Boolean(warned), "the warehouse got that warning too");
  assert((await runPartsWatch(true))?.noOrder === 0, "the same warning is not repeated within a day");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "partWaiting", serviceRequestId: jobB, audience: "customer" } })), "the customer hears that the part is still awaited");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(new Date()));
  if (hour >= 9) assert(Boolean(await prisma.notification.findFirst({ where: { code: "reorderSuggestion", staffUserId: warehouse.id } })), "a morning order suggestion reaches the warehouse");
  else console.log("  skip morning suggestion (before 09:00 in Tashkent)");

  console.log("ordering");
  const bulk = await post("/api/staff/part-orders/bulk", warehouse.token, { items: [{ sparePartId: partId, quantity: item.recommended }], supplierId: supplier.body.supplier.id, markOrdered: true });
  assert(bulk.status === 201 && bulk.body.created === 1, "the recommendation becomes an order in one step");
  const open = await api("/api/staff/part-orders?status=open", { token: admin.token });
  const bulkOrder = open.body.orders.find((row: any) => !row.request && row.part.id === partId);
  assert(bulkOrder?.status === "ordered" && bulkOrder.supplier === `Smoke Supplier ${tag}` && bulkOrder.expectedAt === ymd(2), "the order is placed with the supplier and a delivery date");
  const rec2 = await api("/api/staff/part-orders/recommendations", { token: warehouse.token });
  assert(!rec2.body.groups.some((row: any) => row.items.some((entry: any) => entry.part.id === partId)), "once the gap is ordered the part is no longer recommended");
  const covered = await api("/api/staff/part-orders/waiting", { token: admin.token });
  assert(covered.body.requests.find((row: any) => row.id === jobB)?.noOrder === false, "a general stock order covers the waiting job");
  assert((await patch(`/api/staff/part-orders/${orderA}`, warehouse.token, { status: "ordered", expectedAt: ymd(3) })).status === 200, "job A's order is placed with a date");
  const portalOrdered = await api(`/api/customer/requests/${jobA}`, { token: customer.token });
  assert(portalOrdered.body.request.partWait?.ordered === true && portalOrdered.body.request.partWait?.expectedAt === ymd(3), "the portal now says the part is ordered, with the new date");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "partEta", serviceRequestId: jobA, audience: "customer" } })), "the customer is told when the part is expected");

  console.log("receiving");
  assert((await patch(`/api/staff/part-orders/${orderA}`, warehouse.token, { status: "received", receivedQuantity: 9 })).status === 400, "more than ordered cannot be received");
  const partial = await patch(`/api/staff/part-orders/${orderA}`, warehouse.token, { status: "received", receivedQuantity: 3 });
  assert(partial.status === 200 && partial.body.order.status === "ordered" && partial.body.order.quantity === 2, "a partial delivery keeps the rest on order");
  const afterPartial = await api(`/api/staff/requests/${jobA}`, { token: admin.token });
  assert(afterPartial.body.request.status === "in_progress", "job A continues: the stock now covers it");
  assert((await api(`/api/customer/requests/${jobA}`, { token: customer.token })).body.request.partWait === null, "the part wait disappears once the job continues");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "partArrived", serviceRequestId: jobA, audience: "customer" } })), "the customer hears the part arrived");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "jobPartReady", serviceRequestId: jobA, staffUserId: tech.id } })), "the technician hears it too");
  const stillB = await api(`/api/staff/requests/${jobB}`, { token: admin.token });
  assert(stillB.body.request.status === "awaiting_parts", "job B keeps waiting: no stock left for it");
  const bulkReceived = await patch(`/api/staff/part-orders/${bulkOrder.id}`, warehouse.token, { status: "received" });
  assert(bulkReceived.status === 200, "the large order arrives");
  const releasedB = await api(`/api/staff/requests/${jobB}`, { token: admin.token });
  assert(releasedB.body.request.status === "in_progress", "job B is released by an order that was not made for it");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "partArrived", serviceRequestId: jobB, audience: "customer" } })), "job B's customer hears it too");
  const stock = await prisma.sparePart.findUniqueOrThrow({ where: { id: partId } });
  assert(stock.stockQuantity === 1, `stock adds up: 2 + 3 + 6 - 5 - 5 = 1 (${stock.stockQuantity})`);

  console.log("late deliveries");
  const late = await post("/api/staff/part-orders", warehouse.token, { sparePartId: partId, quantity: 1, serviceRequestId: jobA, supplierId: supplier.body.supplier.id, expectedAt: ymd(-1) });
  assert(late.status === 201 && late.body.order.late === true, "an order past its date is flagged late");
  const lateWatch = await runPartsWatch(true);
  assert((lateWatch?.late ?? 0) >= 1, "the watch notices the late delivery");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "partOrderLate", staffUserId: warehouse.id } })), "the warehouse is told");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "partLate", serviceRequestId: jobA, audience: "customer" } })), "the customer gets an apology");
  assert((await runPartsWatch(true))?.late === 0, "a late order is announced once");
  assert((await patch(`/api/staff/part-orders/${late.body.order.id}`, warehouse.token, { expectedAt: ymd(2) })).status === 200, "a new date can be set");

  console.log("suppliers in use");
  assert((await api(`/api/staff/suppliers/${supplier.body.supplier.id}`, { method: "DELETE", token: warehouse.token })).status === 409, "a supplier with orders cannot be deleted");
  assert((await patch(`/api/staff/suppliers/${supplier.body.supplier.id}`, warehouse.token, { isActive: false })).status === 200, "it can be switched off");

  // Leave the scratch data tidy: close the jobs.
  for (const id of [jobA, jobB]) await patch(`/api/staff/requests/${id}`, admin.token, { status: "cancelled" });
  await prisma.partOrder.updateMany({ where: { sparePartId: partId, status: { in: ["requested", "ordered"] } }, data: { status: "cancelled" } });

  console.log(failed === 0 ? "\nparts smoke: all passed" : `\nparts smoke: ${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
