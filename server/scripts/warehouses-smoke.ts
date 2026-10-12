/**
 * Checks for the warehouse network: central + regional warehouses, home warehouse of a job, fastest-source choice, requests
 * between warehouses (ship, receive, reject, cancel, partial), technician van top-up, restock suggestions, alerts and access.
 * Needs the API running (SMOKE_API) on a scratch database that was seeded.
 *   npm run smoke:warehouses -w server
 */
import { prisma } from "../src/lib/prisma.js";
import { runTransferWatch } from "../src/lib/transfers.js";

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
  const res = await fetch(`${API}${path}`, { ...rest, headers: { ...(rest.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}
const post = (path: string, token: string, data: unknown = {}) => api(path, { method: "POST", token, body: JSON.stringify(data) });
const patch = (path: string, token: string, data: unknown) => api(path, { method: "PATCH", token, body: JSON.stringify(data) });

async function login(scope: "staff" | "customer", phone: string, password: string) {
  const res = await api(`/api/${scope}/auth/login`, { method: "POST", body: JSON.stringify({ phone, password }) });
  assert(res.status === 200 && res.body.token, `sign in ${phone}`);
  return { token: res.body.token as string, id: res.body.user?.id as string };
}
const ymd = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() + offset * 86_400_000));

async function main() {
  const tag = String(Date.now()).slice(-6);
  const admin = await login("staff", "998900000001", "admin123");
  const desk = await login("staff", "998900000005", "desk123");
  const tech = await login("staff", "998900000004", "tech123");
  const accountant = await login("staff", "998900000006", "acc12345");
  const keeper = await login("staff", "998900000007", "ware1234");
  const customer = await login("customer", "998900000003", "customer123");

  console.log("warehouses");
  const list0 = await api("/api/staff/warehouses", { token: admin.token });
  const central = list0.body.warehouses.find((row: any) => row.kind === "central");
  assert(Boolean(central), "the central warehouse exists");
  assert((await api("/api/staff/warehouses", { token: tech.token })).status === 403, "a technician cannot browse warehouses");
  assert((await api("/api/staff/warehouses", { token: accountant.token })).status === 200, "an accountant can read them");
  assert((await post("/api/staff/warehouses", desk.token, { name: "x" })).status === 403, "the front desk cannot create one");
  const samarkand = await post("/api/staff/warehouses", admin.token, { name: `Smoke Samarqand ${tag}`, kind: "regional", regionCode: "30", leadDaysSameRegion: 1, leadDaysOtherRegion: 4 });
  const bukhara = await post("/api/staff/warehouses", admin.token, { name: `Smoke Buxoro ${tag}`, kind: "regional", regionCode: "80", leadDaysSameRegion: 1, leadDaysOtherRegion: 2 });
  assert(samarkand.status === 201 && bukhara.status === 201, "regional warehouses are created");
  const W1 = samarkand.body.warehouse.id as string; // the technician's home
  const W2 = bukhara.body.warehouse.id as string; // the fastest source
  assert((await api(`/api/staff/warehouses/${central.id}`, { method: "DELETE", token: admin.token })).status === 400, "the central warehouse cannot be deleted");

  console.log("stock per warehouse");
  const products = await api("/api/staff/products", { token: admin.token });
  const fridge = products.body.products.find((row: any) => row.sku === "REF-280");
  const part = await post("/api/staff/catalog/parts", admin.token, { name: `Smoke wh part ${tag}`, price: 50000, costPrice: 30000, productCategories: [fridge.category], stockQuantity: 10, lowStockThreshold: 2 });
  const partId = part.body.part.id as string;
  const centralStock = await api(`/api/staff/warehouses/${central.id}/stock?q=Smoke wh part ${tag}`, { token: admin.token });
  assert(centralStock.body.items[0]?.quantity === 10, "a new part's first stock sits in the central warehouse");
  assert((await patch(`/api/staff/warehouses/${W1}/stock/${partId}`, admin.token, { quantity: 4, minQuantity: 5 })).status === 200, "the keeper counts 4 at warehouse 1 and sets a minimum of 5");
  assert((await patch(`/api/staff/warehouses/${W2}/stock/${partId}`, admin.token, { quantity: 6 })).status === 200, "6 are counted at warehouse 2");
  const total = async () => (await prisma.sparePart.findUniqueOrThrow({ where: { id: partId } })).stockQuantity;
  const sum = async () => (await prisma.partStock.aggregate({ where: { sparePartId: partId }, _sum: { quantity: true } }))._sum.quantity ?? 0;
  assert((await total()) === 20 && (await sum()) === 20, "the part's total follows the shelves (10 + 4 + 6)");
  assert((await patch(`/api/staff/catalog/parts/${partId}`, admin.token, { stockQuantity: 18 })).status === 200 && (await total()) === 18 && (await sum()) === 18, "the catalogue edits the total through the central warehouse");
  assert((await patch(`/api/staff/catalog/parts/${partId}`, admin.token, { stockQuantity: 20 })).status === 200 && (await total()) === 20, "and back to 20");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "warehouseLow", sparePartId: partId, staffUserId: keeper.id } })), "the keeper was told warehouse 1 is below its minimum");

  console.log("staff and home warehouse");
  assert((await patch(`/api/staff/staff/${tech.id}`, admin.token, { warehouseId: W1 })).status === 200, "the technician is given warehouse 1");
  assert((await patch(`/api/staff/staff/${keeper.id}`, admin.token, { warehouseId: W2 })).status === 200, "the keeper looks after warehouse 2");
  const keeper1 = await post("/api/staff/staff", admin.token, { name: `Keeper ${tag}`, phone: `99890${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`, role: "warehouse", password: "keeper-pass-1", warehouseId: W1 });
  assert(keeper1.status === 201, "a second keeper is created for warehouse 1");
  const k1 = await login("staff", keeper1.body.staff?.phone ?? keeper1.body.user?.phone, "keeper-pass-1");
  const sources = await api(`/api/staff/my-jobs/part-sources?partId=${partId}&quantity=5`, { token: tech.token });
  assert(sources.status === 200 && sources.body.destination.id === W1 && sources.body.atDestination === 4, "the technician sees their own warehouse and what it holds");
  const best = sources.body.options.find((row: any) => row.recommended);
  assert(best?.type === "warehouse" && best.warehouse.id === W2 && best.etaDays === 2, "the fastest source is warehouse 2 (2 days), not the central one (3 days)");
  assert(sources.body.options.some((row: any) => row.type === "supplier"), "the supplier is offered as the last option");

  console.log("a job short of a part is served from the fastest warehouse");
  const customers = await api("/api/staff/customers", { token: admin.token });
  const dilnoza = customers.body.customers.find((row: any) => row.phone === "998900000003");
  const job = await post("/api/staff/requests", admin.token, { customerId: dilnoza.id, productId: fridge.id, type: "repair", issueDescription: `Warehouse smoke ${tag}`, locationType: "in_shop", technicianTypeRequired: "service_center", assignedTechnicianId: tech.id, autoAssign: false, allowDuplicate: true, defectType: "failed_during_use" });
  const jobId = job.body.request.id as string;
  await patch(`/api/staff/my-jobs/${jobId}`, tech.token, { column: "in_progress" });
  await post(`/api/staff/my-jobs/${jobId}/estimates`, tech.token, { send: true, lines: [{ kind: "labor", name: "Smoke labor", unitPrice: 10000 }, { kind: "part", sparePartId: partId, quantity: 5 }] });
  const detail = await api(`/api/staff/requests/${jobId}`, { token: admin.token });
  const approved = await post(`/api/staff/requests/${jobId}/estimates/${detail.body.estimates[0].id}/approve`, desk.token, {});
  assert(approved.status === 200 && approved.body.waitingForParts === true, "warehouse 1 holds 4 of 5: the job waits for the part");
  const transfersOpen = await api(`/api/staff/transfers?warehouseId=${W2}&direction=out&status=open`, { token: keeper.token });
  const transfer = transfersOpen.body.transfers.find((row: any) => row.request?.id === jobId);
  assert(Boolean(transfer) && transfer.from.id === W2 && transfer.to.id === W1 && transfer.status === "requested" && transfer.quantity === 5, "a request to warehouse 2 was opened for the job");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "transferRequested", staffUserId: keeper.id, serviceRequestId: jobId } })), "the keeper of warehouse 2 is told");
  const orders = await api("/api/staff/part-orders?status=open", { token: admin.token });
  assert(!orders.body.orders.some((row: any) => row.request?.id === jobId), "no supplier order was needed");
  const waiting = await api("/api/staff/part-orders/waiting", { token: admin.token });
  const wj = waiting.body.requests.find((row: any) => row.id === jobId);
  assert(wj?.noOrder === false && wj.homeWarehouse.id === W1 && wj.items[0].orders[0].kind === "transfer", "the waiting list shows the transfer as cover, with the job's warehouse");
  const portal = await api(`/api/customer/requests/${jobId}`, { token: customer.token });
  assert(portal.body.request.partWait && portal.body.request.partWait.ordered === false, "the customer is told the part is being arranged");

  console.log("access to shipping");
  assert((await post(`/api/staff/transfers/${transfer.id}/ship`, k1.token, {})).status === 403, "the keeper of warehouse 1 cannot send from warehouse 2");
  assert((await post(`/api/staff/transfers/${transfer.id}/ship`, tech.token, {})).status === 403, "a technician cannot ship");
  assert((await post(`/api/staff/transfers/${transfer.id}/ship`, keeper.token, { quantity: 9 })).status === 400, "more than requested cannot be sent");

  console.log("partial shipment, receiving and releasing the job");
  const shipped = await post(`/api/staff/transfers/${transfer.id}/ship`, keeper.token, { quantity: 3 });
  assert(shipped.status === 200 && shipped.body.transfer.status === "shipped" && shipped.body.transfer.quantity === 3 && Boolean(shipped.body.transfer.etaAt), "3 of 5 are sent with an expected date");
  assert((await total()) === 17, "the shipped units left the shelf of warehouse 2 (in transit)");
  const rest = await api(`/api/staff/transfers?warehouseId=${W2}&direction=out&status=requested`, { token: keeper.token });
  assert(rest.body.transfers.some((row: any) => row.request?.id === jobId && row.quantity === 2), "the 2 that could not be sent stay requested");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "partEta", serviceRequestId: jobId, audience: "customer" } })), "the customer gets the expected date");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "transferShipped", staffUserId: k1.id } })), "the keeper of warehouse 1 sees it coming");
  assert((await post(`/api/staff/transfers/${transfer.id}/receive`, keeper.token, {})).status === 403, "warehouse 2's keeper cannot confirm the arrival at warehouse 1");
  const received = await post(`/api/staff/transfers/${transfer.id}/receive`, k1.token, {});
  assert(received.status === 200 && received.body.released.length === 1, "warehouse 1 confirms: 4 + 3 = 7 covers the job and it is released");
  assert((await api(`/api/staff/requests/${jobId}`, { token: admin.token })).body.request.status === "in_progress", "the job continues");
  assert((await total()) === 15 && (await sum()) === 15, "the 3 arrived (17 + 3) and 5 were used on the job (20 - 5)");
  const leftover = await api(`/api/staff/transfers?warehouseId=${W2}&direction=out&status=cancelled`, { token: keeper.token });
  assert(leftover.body.transfers.some((row: any) => row.request?.id === jobId), "the unsent remainder was cancelled automatically");
  assert((await api(`/api/customer/requests/${jobId}`, { token: customer.token })).body.request.partWait === null, "the customer's wait is over");

  console.log("branch admin asks, keeper rejects");
  const asked = await post("/api/staff/transfers", desk.token, { sparePartId: partId, quantity: 2, fromWarehouseId: W2, toWarehouseId: W1 });
  assert(asked.status === 201 && asked.body.transfer.requestedBy.role === "receptionist", "the front desk (branch admin) asks warehouse 2 for 2 pieces");
  assert((await post(`/api/staff/transfers/${asked.body.transfer.id}/reject`, keeper.token, {})).status === 400, "a rejection needs a reason");
  const rejected = await post(`/api/staff/transfers/${asked.body.transfer.id}/reject`, keeper.token, { reason: "Counted wrong, nothing left" });
  assert(rejected.status === 200 && rejected.body.transfer.status === "rejected", "the keeper rejects with a reason");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "transferRejected", staffUserId: desk.id } })), "the front desk is told why");
  const cancelled = await post("/api/staff/transfers", desk.token, { sparePartId: partId, quantity: 1, fromWarehouseId: W2, toWarehouseId: W1 });
  assert((await post(`/api/staff/transfers/${cancelled.body.transfer.id}/cancel`, desk.token, {})).status === 200, "who asked can withdraw an unsent request");

  console.log("technician van top-up");
  const topup = await post("/api/staff/my-jobs/stock/requests", tech.token, { sparePartId: partId, quantity: 2, fromWarehouseId: central.id });
  assert(topup.status === 201 && topup.body.transfer.toTechnician?.id === tech.id, "the technician asks the central warehouse for 2 for the van");
  const shipVan = await post(`/api/staff/transfers/${topup.body.transfer.id}/ship`, admin.token, { etaAt: ymd(1) });
  assert(shipVan.status === 200, "the admin sends them");
  assert((await api("/api/staff/my-jobs/transfers", { token: tech.token })).body.transfers.some((row: any) => row.id === topup.body.transfer.id && row.status === "shipped"), "the technician sees the shipment");
  assert((await post(`/api/staff/my-jobs/transfers/${topup.body.transfer.id}/receive`, tech.token, {})).status === 200, "the technician confirms receipt");
  const van = await api("/api/staff/my-jobs/stock", { token: tech.token });
  assert(van.body.stock.find((row: any) => row.sparePartId === partId)?.quantity === 2, "the van now carries 2");

  console.log("restock suggestions");
  await patch(`/api/staff/warehouses/${W1}/stock/${partId}`, admin.token, { minQuantity: 12 });
  const restock = await api(`/api/staff/warehouses/${W1}/restock`, { token: k1.token });
  const suggestion = restock.body.suggestions.find((row: any) => row.part.id === partId);
  assert(Boolean(suggestion) && suggestion.recommended >= 1 && suggestion.options.length >= 2, "warehouse 1 is below its minimum and is offered sources");
  const bulk = await post(`/api/staff/warehouses/${W1}/restock`, k1.token, { items: [{ sparePartId: partId, quantity: 3, from: central.id }, { sparePartId: partId, quantity: 2, from: "supplier" }] });
  assert(bulk.status === 201 && bulk.body.transfers === 1 && bulk.body.orders === 1, "one line becomes a request to the central warehouse, one a supplier order");
  const supplierOrder = (await api(`/api/staff/part-orders?status=open&warehouseId=${W1}`, { token: k1.token })).body.orders.find((row: any) => row.part.id === partId);
  assert(supplierOrder?.warehouse?.id === W1 && supplierOrder.requestedBy?.name, "the order shows the warehouse it is for and who asked");
  assert((await post(`/api/staff/warehouses/${W2}/restock`, k1.token, { items: [{ sparePartId: partId, quantity: 1, from: central.id }] })).status === 403, "a keeper cannot restock someone else's warehouse");

  console.log("late shipment");
  const lateAsk = await post("/api/staff/transfers", admin.token, { sparePartId: partId, quantity: 1, fromWarehouseId: central.id, toWarehouseId: W1 });
  await post(`/api/staff/transfers/${lateAsk.body.transfer.id}/ship`, admin.token, { etaAt: ymd(-2) });
  const watch = await runTransferWatch(true);
  assert((watch?.late ?? 0) >= 1, "the watch notices a shipment past its date");
  assert(Boolean(await prisma.notification.findFirst({ where: { code: "transferLate", staffUserId: k1.id } })), "the receiving keeper is told");
  assert((await runTransferWatch(true))?.late === 0, "once");
  await prisma.stockTransfer.updateMany({ where: { id: asked.body.transfer.id }, data: {} });

  console.log("a supplier order lands in the warehouse it was for");
  const w1Before = (await prisma.partStock.findUnique({ where: { warehouseId_sparePartId: { warehouseId: W1, sparePartId: partId } } }))?.quantity ?? 0;
  assert((await patch(`/api/staff/part-orders/${supplierOrder.id}`, k1.token, { status: "received" })).status === 200, "warehouse 1's keeper receives the supplier order");
  const w1After = (await prisma.partStock.findUnique({ where: { warehouseId_sparePartId: { warehouseId: W1, sparePartId: partId } } }))?.quantity ?? 0;
  assert(w1After === w1Before + 2, "its stock went up on that shelf (not on the central one)");
  assert((await total()) === (await sum()), "the total always equals the sum of the shelves");

  console.log("history");
  const moves = await api(`/api/staff/warehouses/${W2}/movements`, { token: keeper.token });
  assert(moves.body.movements.some((row: any) => row.kind === "transfer_out") && moves.body.movements.some((row: any) => row.kind === "adjust"), "the shelf history lists counts and sends");

  // Tidy: close the leftovers so the scratch database stays usable.
  await prisma.partOrder.updateMany({ where: { sparePartId: partId, status: { in: ["requested", "ordered"] } }, data: { status: "cancelled" } });
  await prisma.stockTransfer.updateMany({ where: { sparePartId: partId, status: { in: ["requested", "shipped"] } }, data: { status: "cancelled" } });
  await prisma.staffUser.update({ where: { id: tech.id }, data: { warehouseId: null } });
  await prisma.staffUser.update({ where: { id: keeper.id }, data: { warehouseId: null } });

  console.log(failed === 0 ? "\nwarehouse smoke: all passed" : `\nwarehouse smoke: ${failed} FAILED`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
