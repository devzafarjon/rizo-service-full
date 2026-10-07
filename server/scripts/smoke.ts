import { computeJobCost, completionGaps } from "../src/lib/jobWork.js";
import { buildDisplayId } from "../src/lib/displayId.js";
import { computeWarrantyExpiry, computeWarrantyStatus, parseDateOnly } from "../src/lib/warranty.js";
import { allowedNext, canTransition, finishedStatusFor } from "../src/lib/status.js";

const API = process.env.SMOKE_API ?? "http://localhost:4000";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let failed = 0;

function assert(condition: unknown, message: string) {
  if (condition) {
    console.log(`  ok  ${message}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${message}`);
}

async function json<T>(path: string, options: RequestInit & { token?: string } = {}): Promise<{ status: number; body: T }> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      ...(rest.body && !(rest.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

async function login(path: string, phone: string, password: string) {
  const { status, body } = await json<{ token?: string; user?: { id: string; role?: string }; error?: string }>(path, {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
  assert(status === 200 && body.token, `login ${phone} -> ${status}`);
  return body;
}

function unitChecks() {
  console.log("unit: warranty / cost / display id / completion / status rules");
  const expiry = computeWarrantyExpiry(parseDateOnly("2026-01-31"), 1);
  assert(expiry.toISOString().startsWith("2026-02-28"), "warranty month-end clamps to Feb 28");
  assert(computeWarrantyStatus(12, parseDateOnly("2099-01-01")) === "in_warranty", "future expiry is in warranty");
  assert(computeWarrantyStatus(12, parseDateOnly("2020-01-01")) === "expired", "past expiry is expired");
  assert(computeWarrantyStatus(0, parseDateOnly("2099-01-01")) === "not_applicable", "zero months is not applicable");

  const extras = [{ id: "e", description: "Taxi", price: 10000 }];
  const services = [{ id: "s", serviceCatalogItemId: "s", priceAtTime: 50000, serviceCatalogItem: { name: "Install", nameUz: "", nameRu: "", nameEn: "" } }];
  const parts = [{ id: "p", sparePartId: "p", quantity: 2, priceAtTime: 5000, sparePart: { name: "Filter", nameUz: "", nameRu: "", nameEn: "" } }];
  const paid = computeJobCost({ warrantyStatus: "expired", serviceLines: services, partLines: parts, extraExpenses: extras });
  assert(paid.chargedTotal === 70000, `paid job charges services+parts+extras (${paid.chargedTotal})`);
  const free = computeJobCost({ warrantyStatus: "in_warranty", serviceLines: services, partLines: parts, extraExpenses: extras });
  assert(free.chargedTotal === 10000, `warranty job still charges extras (${free.chargedTotal})`);
  const laborOnly = computeJobCost({ warrantyStatus: "in_warranty", serviceLines: services, partLines: parts, extraExpenses: extras }, { labor: true, parts: false });
  assert(laborOnly.chargedTotal === 20000, `warranty that covers labor only charges parts + extras (${laborOnly.chargedTotal})`);

  const none = { serviceLines: [] as typeof services, partLines: [] as typeof parts, photos: [] as Array<{ id: string; photoUrl: string; uploadedBy: string; createdAt: Date }>, resolutionType: null as "replace" | null, replacement: null };
  const gaps = completionGaps({ ...none });
  assert(gaps.includes("photo") && gaps.includes("service") && !gaps.includes("part"), "photo+service required, parts optional");
  assert(completionGaps({ ...none, serviceLines: services }, { requireService: false }).includes("photo"), "photo still required");
  const replaceGaps = completionGaps({ ...none, photos: [{ id: "x", photoUrl: "/x", uploadedBy: "t", createdAt: new Date() }], resolutionType: "replace" as const });
  assert(replaceGaps.length === 1 && replaceGaps[0] === "replacement", "replacement needs product + serial, no service line");

  assert(buildDisplayId(new Date("2026-09-18T10:00:00+05:00"), "01", 8) === "180926010008", "display id DDMMYY+region+seq");

  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-09-19T10:00:00+05:00");
  assert(new Date("2026-09-18T18:32:00+05:00").getTime() + 3 * day - now > 0, "in-progress 3-day timer still green after ~15h");
  assert(new Date("2026-09-18T08:00:00+05:00").getTime() + day - now < 0, "1-day new timer is overdue after 26h");

  assert(allowedNext("technician", "repair", "new").includes("diagnosing"), "repair starts with diagnosing");
  assert(!allowedNext("technician", "repair", "awaiting_decision").includes("in_progress"), "technicians cannot skip the customer's decision");
  assert(canTransition("admin", "repair", "awaiting_decision", "rejected"), "office can reject after diagnosis");
  assert(!canTransition("admin", "installation", "new", "diagnosing"), "installations have no diagnosis step");
  assert(finishedStatusFor("repair", "in_shop", "repair") === "ready", "an in-shop repair waits for pickup");
  assert(finishedStatusFor("repair", "on_site", "repair") === "completed", "an on-site repair is completed");
  assert(finishedStatusFor("repair", "in_shop", "replace") === "replaced", "a replacement closes as replaced");
}

const rand = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const dataPng = `data:image/png;base64,${PNG.toString("base64")}`;

async function main() {
  unitChecks();
  const tag = rand();

  console.log("http: health");
  assert((await json("/api/health")).status === 200, "health 200");

  console.log("http: auth scopes and roles");
  const admin = await login("/api/staff/auth/login", "998900000001", "admin123");
  const tech = await login("/api/staff/auth/login", "998900000002", "tech123");
  const shopTech = await login("/api/staff/auth/login", "998900000004", "tech123");
  const desk = await login("/api/staff/auth/login", "998900000005", "desk123");
  const customer = await login("/api/customer/auth/login", "998900000003", "customer123");
  const bad = await json("/api/staff/auth/login", { method: "POST", body: JSON.stringify({ phone: "998900000001", password: "nope" }) });
  assert(bad.status === 401, "bad staff password 401");
  let limited = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const tried = await json("/api/staff/auth/login", { method: "POST", body: JSON.stringify({ phone: "998900009999", password: "nope" }) });
    if (tried.status === 429) limited += 1;
  }
  assert(limited >= 1, "login is rate limited after repeated failures");

  const throwawayPhone = `99893${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const registered = await json("/api/customer/auth/register", { method: "POST", body: JSON.stringify({ name: "Smoke Reset", phone: throwawayPhone, password: "smoke-pass-1" }) });
  assert(registered.status === 201 || registered.status === 200, `throwaway customer registered (${registered.status})`);
  const forgot = await json<Record<string, unknown>>("/api/customer/auth/forgot", { method: "POST", body: JSON.stringify({ phone: throwawayPhone }) });
  assert(forgot.status === 200 && !("temporaryPassword" in forgot.body), "password reset never returns the new password");

  assert((await json("/api/customer/requests", { token: admin.token })).status === 403, "staff token cannot call customer routes");
  assert((await json("/api/staff/requests", { token: customer.token })).status === 403, "customer token cannot call staff routes");
  assert((await json("/api/staff/reports/dashboard?preset=month", { token: tech.token })).status === 403, "technician cannot open reports API");
  assert((await json("/api/staff/reports/dashboard?preset=month", { token: customer.token })).status === 403, "customer cannot open reports API");
  assert((await json("/api/staff/reports/dashboard?preset=month", { token: desk.token })).status === 403, "receptionist cannot open reports API");
  assert((await json("/api/staff/payroll", { token: desk.token })).status === 403, "receptionist cannot open payroll");
  assert((await json("/api/staff/settings", { method: "PATCH", token: desk.token, body: JSON.stringify({ repairLegalDays: 5 }) })).status === 403, "receptionist cannot change settings");
  assert((await json("/api/staff/requests", { token: desk.token })).status === 200, "receptionist can work with requests");
  assert((await json("/api/staff/products", { token: desk.token })).status === 200, "receptionist can read products");
  assert((await json("/api/staff/products", { method: "POST", token: desk.token, body: JSON.stringify({ name: "x", sku: "x", category: "x" }) })).status === 403, "receptionist cannot edit products");
  assert((await json("/api/staff/my-jobs", { token: desk.token })).status === 403, "receptionist has no technician board");
  assert((await json("/api/staff/my-jobs/does-not-exist", { token: tech.token })).status === 404, "technician cannot read an unknown/foreign job");

  console.log("http: catalog lookups");
  const customers = await json<{ customers: Array<{ id: string; phone: string }> }>("/api/staff/customers", { token: admin.token });
  const dilnoza = customers.body.customers.find((row) => row.phone === "998900000003")!;
  const products = await json<{ products: Array<{ id: string; sku: string; category: string; warrantyMonths: number }> }>("/api/staff/products", { token: admin.token });
  const fridge = products.body.products.find((row) => row.sku === "REF-280")!;
  const tv = products.body.products.find((row) => row.sku === "TV-43")!;
  const ac = products.body.products.find((row) => row.sku === "AC-12")!;
  assert(dilnoza && fridge && tv && ac, "seed customer and products exist");
  const catalog = await json<{ services: Array<{ id: string; productCategories: string[]; price: number }> }>("/api/staff/catalog/services", { token: admin.token });
  const parts = await json<{ parts: Array<{ id: string; productCategories: string[]; price: number; stockQuantity: number }> }>("/api/staff/catalog/parts", { token: admin.token });
  const fridgeService = catalog.body.services.find((row) => row.productCategories.includes(fridge.category))!;
  const fridgePart = parts.body.parts.find((row) => row.productCategories.includes(fridge.category))!;
  const sales = await json<{ sales: Array<{ id: string; invoiceNumber: string }> }>("/api/staff/sales", { token: admin.token });
  const fridgeSale = sales.body.sales.find((row) => row.invoiceNumber === "RZ-1001")!;
  assert(fridgeService && fridgePart && fridgeSale, "seed services, parts and sales exist");

  const createJob = async (body: Record<string, unknown>) =>
    json<{ request: { id: string; displayId: string; status: string; trackingToken: string; isRepeat: boolean; decision: string | null; isPaidRepair: boolean }; repeat: { free: boolean } | null }>("/api/staff/requests", {
      method: "POST",
      token: admin.token,
      body: JSON.stringify({ customerId: dilnoza.id, productId: fridge.id, autoAssign: false, allowDuplicate: true, ...body }),
    });
  const uploadPhoto = async (token: string, id: string) => {
    const f = new FormData();
    f.append("photos", new Blob([PNG], { type: "image/png" }), "smoke.png");
    const response = await fetch(`${API}/api/staff/my-jobs/${id}/photos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
    // The demo data has completion checklists with required items; a technician ticks them before completing.
    const view = await json<{ checklist?: { completion: { items: Array<{ id: string; required: boolean }> } } }>(`/api/staff/my-jobs/${id}`, { token });
    const required = view.body.checklist?.completion.items.filter((item) => item.required).map((item) => item.id) ?? [];
    if (required.length > 0) await json(`/api/staff/my-jobs/${id}/checklist`, { method: "PUT", token, body: JSON.stringify({ kind: "completion", checked: required }) });
    return response;
  };
  const shopRepair = (extra: Record<string, unknown> = {}) =>
    createJob({ type: "repair", issueDescription: `Smoke ${tag}`, locationType: "in_shop", technicianTypeRequired: "service_center", assignedTechnicianId: shopTech.user?.id, defectType: "failed_during_use", ...extra });
  const move = (token: string, id: string, body: Record<string, unknown>) => json<{ job?: { status: string } }>(`/api/staff/my-jobs/${id}`, { method: "PATCH", token, body: JSON.stringify(body) });

  console.log("http: concurrent display ids + duplicate protection");
  const created = await Promise.all(Array.from({ length: 6 }, (_, index) => createJob({ type: "repair", issueDescription: `Smoke concurrent ${index + 1}`, locationType: "in_shop", technicianTypeRequired: "service_center" })));
  assert(created.every((row) => row.status === 201), "six concurrent creates return 201");
  const ids = created.map((row) => row.body.request.displayId);
  assert(new Set(ids).size === ids.length, `concurrent display ids unique: ${ids.join(", ")}`);
  const noInstallShop = await createJob({ type: "installation", issueDescription: "x", locationType: "in_shop", technicianTypeRequired: "service_center" });
  assert(noInstallShop.status === 400, "installation cannot be created as in-shop");
  const portalInstallShop = await json("/api/customer/requests", { method: "POST", token: customer.token, body: JSON.stringify({ type: "installation", productId: fridge.id, issueDescription: "x", locationType: "in_shop" }) });
  assert(portalInstallShop.status === 400, "customers cannot request an in-shop installation");
  const dupFirst = await createJob({ type: "repair", saleId: fridgeSale.id, issueDescription: "dup first", locationType: "in_shop", technicianTypeRequired: "service_center", allowDuplicate: false });
  if (dupFirst.status === 201) {
    const dupSecond = await createJob({ type: "repair", saleId: fridgeSale.id, issueDescription: "dup second", locationType: "in_shop", technicianTypeRequired: "service_center", allowDuplicate: false });
    assert(dupSecond.status === 409, "a second open request for the same purchase is flagged as a duplicate");
    await json(`/api/staff/requests/${dupFirst.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "cancelled" }) });
  } else assert(dupFirst.status === 409, "an existing open request for the purchase blocks a duplicate");

  console.log("http: paid repair - diagnosis, estimate, customer approval, parts, payment, pickup");
  const paidJob = await shopRepair({ serialNumber: `SN-${tag}` });
  assert(paidJob.status === 201 && paidJob.body.request.status === "new" && paidJob.body.request.isPaidRepair, "a repair without warranty starts New and paid");
  const paidId = paidJob.body.request.id;
  const diag = await move(shopTech.token!, paidId, { column: "in_progress" });
  assert(diag.status === 200 && diag.body.job?.status === "diagnosing", "starting a repair moves it to Diagnosing");
  const noEstimate = await move(shopTech.token!, paidId, { status: "in_progress" });
  assert(noEstimate.status === 400, "a paid repair cannot start without an approved estimate");
  const setDefect = await json<{ defectCodes: Array<{ id: string }> }>(`/api/staff/my-jobs/${paidId}`, { token: shopTech.token });
  assert(setDefect.body.defectCodes.length > 0, "technician sees defect codes for the category");
  assert((await json(`/api/staff/my-jobs/${paidId}/diagnosis`, { method: "PUT", token: shopTech.token, body: JSON.stringify({ defectCodeId: setDefect.body.defectCodes[0].id }) })).status === 200, "technician records the diagnosis code");
  const est = await json<{ job: unknown; estimates: Array<{ id: string; status: string; total: number; lines: Array<{ id: string; isOptional: boolean }> }> }>(`/api/staff/my-jobs/${paidId}/estimates`, {
    method: "POST",
    token: shopTech.token,
    body: JSON.stringify({
      send: true,
      lines: [
        { kind: "service", serviceCatalogItemId: fridgeService.id },
        { kind: "labor", name: "Smoke labor", unitPrice: 40000 },
        { kind: "part", sparePartId: fridgePart.id, quantity: 1, isOptional: true },
      ],
    }),
  });
  assert(est.status === 201 && est.body.estimates[0]?.status === "sent", "technician sends an estimate");
  const afterSend = await json<{ request: { status: string; estimate: { status: string } | null } }>(`/api/staff/requests/${paidId}`, { token: admin.token });
  assert(afterSend.body.request.status === "awaiting_decision" && afterSend.body.request.estimate?.status === "sent", "sending the estimate puts the job in Awaiting decision");
  const portalDetail = await json<{ request: { estimate: { id: string; canRespond: boolean; lines: Array<{ id: string; isOptional: boolean }> } | null; status: string } }>(`/api/customer/requests/${paidId}`, { token: customer.token });
  assert(portalDetail.body.request.estimate?.canRespond === true, "the customer sees the estimate and can respond");
  const stockBefore = (await json<{ parts: Array<{ id: string; stockQuantity: number }> }>("/api/staff/catalog/parts", { token: admin.token })).body.parts.find((row) => row.id === fridgePart.id)!.stockQuantity;
  const optionalLine = portalDetail.body.request.estimate!.lines.find((line) => line.isOptional)!;
  const approve = await json(`/api/customer/requests/${paidId}/estimates/${portalDetail.body.request.estimate!.id}/approve`, { method: "POST", token: customer.token, body: JSON.stringify({ selectedOptionalLineIds: [optionalLine.id] }) });
  assert(approve.status === 200, `customer approves the estimate (${approve.status})`);
  const afterApprove = await json<{ request: { status: string; decision: string | null }; serviceLines: unknown[]; partLines: unknown[]; extraExpenses: unknown[] }>(`/api/staff/requests/${paidId}`, { token: admin.token });
  assert(afterApprove.body.request.status === "in_progress" && afterApprove.body.request.decision === "paid_repair", "approval starts the repair");
  assert(afterApprove.body.serviceLines.length === 1 && afterApprove.body.partLines.length === 1 && afterApprove.body.extraExpenses.length === 1, "approved lines become work lines");
  const stockAfter = (await json<{ parts: Array<{ id: string; stockQuantity: number }> }>("/api/staff/catalog/parts", { token: admin.token })).body.parts.find((row) => row.id === fridgePart.id)!.stockQuantity;
  assert(stockAfter === stockBefore - 1, "approved parts are taken from stock");
  const early = await json(`/api/staff/my-jobs/${paidId}/complete`, { method: "POST", token: shopTech.token });
  assert(early.status === 400, "complete without a photo is rejected");
  assert((await uploadPhoto(shopTech.token!, paidId)).status === 201, "photo uploaded");
  const finished = await json<{ job: { status: string; finalCost: number | null; workedMinutes?: number } }>(`/api/staff/my-jobs/${paidId}/complete`, { method: "POST", token: shopTech.token });
  assert(finished.status === 200 && finished.body.job.status === "ready", `an in-shop repair is Ready for pickup (${finished.body.job.status})`);
  const total = finished.body.job.finalCost ?? 0;
  assert(total > 0, "the customer owes money for the paid repair");
  const unpaidPickup = await json(`/api/staff/requests/${paidId}/pickup`, { method: "POST", token: admin.token, body: JSON.stringify({}) });
  assert(unpaidPickup.status === 400, "pickup is blocked while a balance is unpaid");
  const half = await json<{ paymentSummary: { balance: number } }>(`/api/staff/requests/${paidId}/payments`, { method: "POST", token: desk.token, body: JSON.stringify({ amount: Math.floor(total / 2), method: "cash" }) });
  assert(half.status === 201 && half.body.paymentSummary.balance > 0, "the front desk records a partial payment");
  const partial = await json<{ request: { paymentStatus: string } }>(`/api/staff/requests/${paidId}`, { token: admin.token });
  assert(partial.body.request.paymentStatus === "partial", "payment status shows partial");
  const tooMuch = await json(`/api/staff/requests/${paidId}/payments`, { method: "POST", token: admin.token, body: JSON.stringify({ amount: 1, kind: "refund", method: "cash" }) });
  assert(tooMuch.status === 201, "a small refund within what was paid is accepted");
  const rest = await json<{ paymentSummary: { balance: number } }>(`/api/staff/requests/${paidId}/payments`, { method: "POST", token: desk.token, body: JSON.stringify({ amount: total - Math.floor(total / 2) + 1, method: "card", fiscalReceiptNumber: "FISCAL-1" }) });
  assert(rest.body.paymentSummary.balance === 0, "the balance is settled");
  const debts = await json<{ rows: Array<{ id: string }> }>("/api/staff/reports/debts", { token: admin.token });
  assert(!debts.body.rows.some((row) => row.id === paidId), "settled jobs are not in the debts report");
  const portalReady = await json<{ request: { canConfirmPickup: boolean } }>(`/api/customer/requests/${paidId}`, { token: customer.token });
  assert(portalReady.body.request.canConfirmPickup === true, "the customer is offered pickup confirmation");
  const pickedUp = await json<{ request: { status: string } }>(`/api/customer/requests/${paidId}/pickup`, { method: "POST", token: customer.token, body: JSON.stringify({}) });
  assert(pickedUp.status === 200, "customer confirms pickup (tap)");
  const afterPickup = await json<{ request: { status: string; pickupConfirmationType: string | null; fiscalReceiptNumber: string | null; repairWarrantyUntil: string | null } }>(`/api/staff/requests/${paidId}`, { token: admin.token });
  assert(afterPickup.body.request.status === "picked_up" && afterPickup.body.request.pickupConfirmationType === "tap", "status is picked_up with type tap");
  assert(afterPickup.body.request.fiscalReceiptNumber === "FISCAL-1" && Boolean(afterPickup.body.request.repairWarrantyUntil), "fiscal receipt number and repair warranty are stored");
  assert((await json(`/api/customer/requests/${paidId}/feedback`, { method: "POST", token: customer.token, body: JSON.stringify({ rating: 5, tags: ["fast"] }) })).status === 201, "customer rates the finished repair");

  console.log("http: estimate shortage creates a part order that resumes the job");
  const shortJob = await shopRepair();
  await move(shopTech.token!, shortJob.body.request.id, { column: "in_progress" });
  await json(`/api/staff/my-jobs/${shortJob.body.request.id}/estimates`, {
    method: "POST",
    token: shopTech.token,
    body: JSON.stringify({ send: true, lines: [{ kind: "labor", name: "Smoke labor", unitPrice: 10000 }, { kind: "part", sparePartId: fridgePart.id, quantity: 99 }] }),
  });
  const staffApprove = await json<{ waitingForParts: boolean }>(`/api/staff/requests/${shortJob.body.request.id}/estimates/${(await json<{ estimates: Array<{ id: string }> }>(`/api/staff/requests/${shortJob.body.request.id}`, { token: admin.token })).body.estimates[0].id}/approve`, { method: "POST", token: desk.token, body: JSON.stringify({}) });
  assert(staffApprove.status === 200 && staffApprove.body.waitingForParts === true, "the front desk records an approval; missing stock means waiting for parts");
  const waiting = await json<{ request: { status: string } }>(`/api/staff/requests/${shortJob.body.request.id}`, { token: admin.token });
  assert(waiting.body.request.status === "awaiting_parts", "the job is Awaiting parts");
  const orders = await json<{ orders: Array<{ id: string; status: string; request: { id: string } | null }>; suggestions: unknown[] }>("/api/staff/part-orders?status=open", { token: admin.token });
  const order = orders.body.orders.find((row) => row.request?.id === shortJob.body.request.id);
  assert(Boolean(order) && Array.isArray(orders.body.suggestions), "a part order was created for the shortage");
  const received = await json(`/api/staff/part-orders/${order!.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "received" }) });
  assert(received.status === 200, "the order is received into stock");
  const resumed = await json<{ request: { status: string } }>(`/api/staff/requests/${shortJob.body.request.id}`, { token: admin.token });
  assert(resumed.body.request.status === "in_progress", "receiving the part resumes the job");
  await json(`/api/staff/requests/${shortJob.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "cancelled" }) });

  console.log("http: warranty repair covers labor and parts; extras are still charged; repeat failure is free");
  const warrantyJob = await shopRepair({ saleId: fridgeSale.id, allowDuplicate: true });
  const warrantyId = warrantyJob.body.request.id;
  await move(shopTech.token!, warrantyId, { column: "in_progress" });
  const decided = await json<{ request: { status: string; decision: string | null; isPaidRepair: boolean } }>(`/api/staff/requests/${warrantyId}/decision`, { method: "POST", token: admin.token, body: JSON.stringify({ decision: "warranty_repair" }) });
  assert(decided.status === 200 && decided.body.request.decision === "warranty_repair" && !decided.body.request.isPaidRepair, "warranty decision recorded");
  assert((await json(`/api/staff/my-jobs/${warrantyId}/service-lines`, { method: "POST", token: shopTech.token, body: JSON.stringify({ serviceCatalogItemId: fridgeService.id }) })).status === 201, "service added");
  assert((await json(`/api/staff/my-jobs/${warrantyId}/extra-expenses`, { method: "POST", token: shopTech.token, body: JSON.stringify({ description: "Courier", price: 5000 }) })).status === 201, "extra expense added");
  await uploadPhoto(shopTech.token!, warrantyId);
  const warrantyDone = await json<{ job: { status: string; finalCost: number | null }; cost: { waivedTotal: number } }>(`/api/staff/my-jobs/${warrantyId}/complete`, { method: "POST", token: shopTech.token });
  assert(warrantyDone.body.job.status === "ready" && warrantyDone.body.job.finalCost === 5000 && warrantyDone.body.cost.waivedTotal > 0, "warranty waives labor but charges the courier extra");
  const repeat = await createJob({ type: "repair", saleId: fridgeSale.id, issueDescription: "Came back", locationType: "in_shop", technicianTypeRequired: "service_center", allowDuplicate: false });
  assert(repeat.status === 201 && repeat.body.request.isRepeat && repeat.body.repeat?.free === true, "a repeat failure inside the repair warranty is flagged and free");
  assert(repeat.body.request.decision === "warranty_repair" && !repeat.body.request.isPaidRepair, "the repeat repair needs no estimate");
  await json(`/api/staff/requests/${repeat.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "cancelled" }) });

  console.log("http: decisions - replace, reject, refund");
  const replaceJob = await shopRepair({ saleId: fridgeSale.id });
  const replaced = await json<{ request: { status: string; resolutionType: string | null } }>(`/api/staff/requests/${replaceJob.body.request.id}/decision`, {
    method: "POST",
    token: admin.token,
    body: JSON.stringify({ decision: "replace", replacement: { productId: fridge.id, serialNumber: `NEW-${tag}` } }),
  });
  assert(replaced.status === 200 && replaced.body.request.status === "replaced" && replaced.body.request.resolutionType === "replace", "a replacement at the counter closes the request as Replaced");
  const rejectJob = await shopRepair();
  assert((await json(`/api/staff/requests/${rejectJob.body.request.id}/decision`, { method: "POST", token: admin.token, body: JSON.stringify({ decision: "reject" }) })).status === 400, "a rejection needs a reason");
  assert((await json(`/api/staff/requests/${rejectJob.body.request.id}/decision`, { method: "POST", token: admin.token, body: JSON.stringify({ decision: "reject", rejectionReason: "Physical damage" }) })).status === 200, "rejection with a reason");
  const rejectedView = await json<{ request: { status: string; rejectionReason: string | null } }>(`/api/customer/requests/${rejectJob.body.request.id}`, { token: customer.token });
  assert(rejectedView.body.request.status === "rejected" && rejectedView.body.request.rejectionReason === "Physical damage", "the customer reads the reason");
  const refundJob = await shopRepair();
  const reasons = await json<{ codes: Array<{ id: string; kind: string }> }>("/api/staff/defect-codes?kind=return_reason", { token: desk.token });
  const refunded = await json<{ request: { status: string; payment: { refunded: number } } }>(`/api/staff/requests/${refundJob.body.request.id}/decision`, {
    method: "POST",
    token: admin.token,
    body: JSON.stringify({ decision: "refund", refundAmount: 50000, returnReasonId: reasons.body.codes[0]?.id }),
  });
  assert(refunded.status === 200 && refunded.body.request.status === "refunded" && refunded.body.request.payment.refunded === 50000, "a refund decision records the money back");

  console.log("http: on-site field work - en route, arrival, pause, replacement flow, cancel");
  const fieldJob = await createJob({ type: "repair", issueDescription: "Smoke field", locationType: "on_site", customerLocation: { address: "12 Amir Temur Avenue", lat: 41.31, lng: 69.24 }, technicianTypeRequired: "mobile", assignedTechnicianId: tech.user?.id, defectType: "dead_on_arrival", saleId: fridgeSale.id });
  const fieldId = fieldJob.body.request.id;
  await json(`/api/staff/requests/${fieldId}/decision`, { method: "POST", token: admin.token, body: JSON.stringify({ decision: "replace" }) });
  const enRoute = await json<{ job: { enRouteAt: string | null } }>(`/api/staff/my-jobs/${fieldId}/en-route`, { method: "POST", token: tech.token });
  assert(enRoute.status === 200 && enRoute.body.job.enRouteAt, "technician marks the trip");
  const portalTrip = await json<{ request: { enRouteAt: string | null } }>(`/api/customer/requests/${fieldId}`, { token: customer.token });
  assert(Boolean(portalTrip.body.request.enRouteAt), "the customer sees that the technician is on the way");
  assert((await json(`/api/staff/my-jobs/${fieldId}/arrived`, { method: "POST", token: tech.token })).status === 200, "technician records arrival");
  assert((await move(tech.token!, fieldId, { column: "paused" })).status === 400, "pausing without a reason is rejected");
  const paused = await json<{ job: { status: string; timer: { durationMs: number } | null } }>(`/api/staff/my-jobs/${fieldId}`, { method: "PATCH", token: tech.token, body: JSON.stringify({ column: "paused", pauseReason: "Waiting for a part", pauseHours: 6 }) });
  assert(paused.body.job.status === "paused" && paused.body.job.timer?.durationMs === 6 * 3600_000, "pause uses the technician's duration");
  assert((await move(tech.token!, fieldId, { column: "in_progress" })).body.job?.status === "in_progress", "resume returns to In progress");
  assert((await json(`/api/staff/my-jobs/${fieldId}/resolution`, { method: "PUT", token: tech.token, body: JSON.stringify({ resolutionType: "replace", productId: fridge.id }) })).status === 400, "replacement needs a serial number");
  assert((await json(`/api/staff/my-jobs/${fieldId}/resolution`, { method: "PUT", token: tech.token, body: JSON.stringify({ resolutionType: "replace", productId: fridge.id, serialNumber: "SN-SMOKE-1" }) })).status === 200, "replacement item recorded");
  assert((await json(`/api/staff/my-jobs/${fieldId}/complete`, { method: "POST", token: tech.token })).status === 400, "replacement still needs a photo");
  await uploadPhoto(tech.token!, fieldId);
  const fieldDone = await json<{ job: { status: string; resolutionType: string | null } }>(`/api/staff/my-jobs/${fieldId}/complete`, { method: "POST", token: tech.token });
  assert(fieldDone.body.job.status === "replaced" && fieldDone.body.job.resolutionType === "replace", "a technician-made replacement closes as Replaced");
  assert((await json(`/api/staff/requests/${fieldId}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "picked_up" }) })).status === 400, "on-site jobs have no counter pickup");
  const cancelJob = await createJob({ type: "installation", issueDescription: "Smoke cancel", locationType: "on_site", customerLocation: { address: "12 Amir Temur Avenue" }, technicianTypeRequired: "mobile", assignedTechnicianId: tech.user?.id });
  const cancelled = await json<{ request: { status: string } }>(`/api/staff/requests/${cancelJob.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "cancelled" }) });
  assert(cancelled.body.request.status === "cancelled", "admin can cancel a request");
  const techJobs = await json<{ jobs: Array<{ id: string }> }>("/api/staff/my-jobs", { token: tech.token });
  assert(!techJobs.body.jobs.some((job) => job.id === cancelJob.body.request.id), "cancelled jobs leave the technician board");
  assert((await json(`/api/staff/requests/${cancelJob.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "completed" }) })).status === 400, "cancelled requests cannot jump to completed");

  console.log("http: installation sets the warranty start");
  const acSale = await json<{ sale: { id: string; installationDate: string | null; serialNumber: string | null } }>("/api/staff/sales", { method: "POST", token: admin.token, body: JSON.stringify({ customerId: dilnoza.id, productId: ac.id, quantity: 1, saleDate: "2026-09-01", pricePaid: 1000000, serialNumber: `AC-${tag}` }) });
  assert(acSale.status === 201 && acSale.body.sale.serialNumber === `AC-${tag}`, "a sale with a serial number is created (warranty months default from the product)");
  assert((await json("/api/staff/sales", { method: "POST", token: admin.token, body: JSON.stringify({ customerId: dilnoza.id, productId: ac.id, quantity: 1, saleDate: "2026-09-01", pricePaid: 1, serialNumber: `AC-${tag}` }) })).status === 409, "a serial number cannot be registered twice");
  const install = await createJob({ type: "installation", saleId: acSale.body.sale.id, productId: ac.id, issueDescription: "Smoke install", locationType: "on_site", customerLocation: { address: "12 Amir Temur Avenue" }, technicianTypeRequired: "mobile", assignedTechnicianId: tech.user?.id });
  await move(tech.token!, install.body.request.id, { column: "in_progress" });
  const acService = catalog.body.services.find((row) => row.productCategories.includes(ac.category))!;
  await json(`/api/staff/my-jobs/${install.body.request.id}/service-lines`, { method: "POST", token: tech.token, body: JSON.stringify({ serviceCatalogItemId: acService.id }) });
  await uploadPhoto(tech.token!, install.body.request.id);
  const installDone = await json<{ job: { status: string } }>(`/api/staff/my-jobs/${install.body.request.id}/complete`, { method: "POST", token: tech.token });
  assert(installDone.body.job.status === "completed", "an installation completes");
  const afterInstall = await json<{ sale: { installationDate: string | null } }>(`/api/staff/sales/${acSale.body.sale.id}`, { token: admin.token });
  assert(Boolean(afterInstall.body.sale.installationDate), "the warranty now starts from the installation date");

  console.log("http: serial card, warranty extension, void, verification");
  const serial = await json<{ sales: unknown[]; requests: unknown[] }>(`/api/staff/serials/AC-${tag}`, { token: desk.token });
  assert(serial.status === 200 && serial.body.sales.length === 1 && serial.body.requests.length >= 1, "the serial card shows the unit and its visits");
  assert((await json("/api/staff/serials/NO-SUCH-SERIAL", { token: desk.token })).status === 404, "unknown serial numbers return 404");
  const extended = await json<{ sale: { warrantyMonths: number; extensionMonths: number } }>(`/api/staff/sales/${acSale.body.sale.id}/extend`, { method: "POST", token: admin.token, body: JSON.stringify({ months: 3, reason: "Goodwill" }) });
  assert(extended.body.sale.extensionMonths === 3, "warranty can be extended with a reason");
  const voided = await json<{ sale: { warrantyStatus: string; voided: boolean } }>(`/api/staff/sales/${acSale.body.sale.id}/void`, { method: "POST", token: admin.token, body: JSON.stringify({ reason: "Water damage" }) });
  assert(voided.body.sale.voided && voided.body.sale.warrantyStatus === "expired", "a voided warranty counts as expired");
  const restored = await json<{ sale: { warrantyStatus: string; voided: boolean } }>(`/api/staff/sales/${acSale.body.sale.id}/restore`, { method: "POST", token: admin.token });
  assert(!restored.body.sale.voided && restored.body.sale.warrantyStatus === "in_warranty", "a voided warranty can be restored");
  const card = await json<{ card: { serialNumber: string; coversLabor: boolean } }>(`/api/staff/sales/${acSale.body.sale.id}/warranty-card`, { token: desk.token });
  assert(card.body.card.serialNumber === `AC-${tag}`, "the warranty card data is available");
  const reg = await json<{ sale: { id: string; isVerified: boolean } }>("/api/customer/sales/register", { method: "POST", token: customer.token, body: JSON.stringify({ productId: tv.id, serialNumber: `REG-${tag}`, purchaseDate: "2026-01-15" }) });
  assert(reg.status === 201 && reg.body.sale.isVerified === false, "a customer can register a product bought elsewhere (unverified)");
  assert((await json("/api/customer/sales/register", { method: "POST", token: customer.token, body: JSON.stringify({ productId: tv.id, serialNumber: `REG-${tag}`, purchaseDate: "2026-01-15" }) })).status === 409, "a registered serial number is unique");
  assert((await json(`/api/staff/sales/${reg.body.sale.id}/verify`, { method: "POST", token: admin.token })).status === 200, "the office verifies a registered product");

  console.log("http: tracking link, intake, notes, messages");
  const track = await json<{ token: string }>("/api/public/track", { method: "POST", body: JSON.stringify({ displayId: afterPickup.body.request.status ? paidJob.body.request.displayId : "", phone: "998900000003" }) });
  assert(track.status === 200 && Boolean(track.body.token), "the request number plus phone gives the tracking link");
  assert((await json("/api/public/track", { method: "POST", body: JSON.stringify({ displayId: paidJob.body.request.displayId, phone: "998901234567" }) })).status === 404, "a wrong phone does not reveal the link");
  const publicView = await json<{ request: { displayId: string; status: string; technicianFirstName: string | null; timeline: unknown[] } }>(`/api/public/track/${paidJob.body.request.trackingToken}`);
  assert(publicView.status === 200 && publicView.body.request.status === "picked_up" && publicView.body.request.timeline.length > 0, "the public page shows status and timeline without signing in");
  assert((await json("/api/public/track/not-a-token")).status === 404, "an unknown tracking link returns 404");
  const intake = await createJob({
    type: "repair", issueDescription: "Smoke intake", locationType: "in_shop", technicianTypeRequired: "service_center",
    intake: { checklist: ["powers_on", "accessories_included"], notes: "Scratch on the left side", signatureDataUrl: dataPng },
  });
  const intakeView = await json<{ request: { intakeChecklist: string[]; intakeSignatureUrl: string | null; intakeNotes: string | null } }>(`/api/staff/requests/${intake.body.request.id}`, { token: admin.token });
  assert(intakeView.body.request.intakeChecklist.length === 2 && Boolean(intakeView.body.request.intakeSignatureUrl), "the intake checklist and customer signature are stored");
  const note = await json(`/api/staff/requests/${intake.body.request.id}/notes`, { method: "POST", token: desk.token, body: JSON.stringify({ text: "We need the charger too", visibleToCustomer: true }) });
  assert(note.status === 201, "the front desk writes a message for the customer");
  const comment = await json<{ request: { messages: Array<{ text: string; fromCustomer: boolean }> } }>(`/api/customer/requests/${intake.body.request.id}/comments`, { method: "POST", token: customer.token, body: JSON.stringify({ text: "I will bring it tomorrow" }) });
  assert(comment.body.request.messages.length === 2 && comment.body.request.messages[1].fromCustomer, "the customer replies in the same thread");
  const internal = await json(`/api/staff/requests/${intake.body.request.id}/notes`, { method: "POST", token: desk.token, body: JSON.stringify({ text: "Internal only" }) });
  const portalMsgs = await json<{ request: { messages: Array<{ text: string }> } }>(`/api/customer/requests/${intake.body.request.id}`, { token: customer.token });
  assert(internal.status === 201 && !portalMsgs.body.request.messages.some((m) => m.text === "Internal only"), "internal notes stay hidden from the customer");
  await json(`/api/staff/requests/${intake.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "cancelled" }) });
  const sched = new Date(Date.now() + 26 * 3_600_000).toISOString();
  const visit = await createJob({ type: "repair", issueDescription: "Smoke visit", locationType: "on_site", customerLocation: { address: "12 Amir Temur Avenue" }, technicianTypeRequired: "mobile", scheduledAt: sched });
  const day = sched.slice(0, 10);
  const visits = await json<{ requests: Array<{ id: string }> }>(`/api/staff/requests?from=${day}&to=${day}`, { token: desk.token });
  assert(visits.body.requests.some((row) => row.id === visit.body.request.id), "scheduled visits appear on the calendar range");
  await json(`/api/staff/requests/${visit.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "cancelled" }) });

  console.log("http: reference data, reports, payroll");
  const center = await json<{ center: { id: string } }>("/api/staff/service-centers", { method: "POST", token: admin.token, body: JSON.stringify({ name: `Smoke center ${tag}`, regionCode: "40", address: "Test street 1" }) });
  assert(center.status === 201, "admin adds a service center");
  assert((await json("/api/staff/service-centers", { method: "POST", token: desk.token, body: JSON.stringify({ name: "x", address: "y" }) })).status === 403, "the front desk cannot edit service centers");
  const publicCenters = await json<{ centers: Array<{ name: string }> }>("/api/public/centers");
  assert(publicCenters.body.centers.some((row) => row.name === `Smoke center ${tag}`), "service centers are public");
  const code = await json("/api/staff/defect-codes", { method: "POST", token: admin.token, body: JSON.stringify({ kind: "defect", code: `S${tag.slice(0, 3)}`, name: "Smoke defect" }) });
  assert(code.status === 201, "admin adds a defect code");
  for (const path of ["defects", "outcomes", "debts", "legal", "dashboard?preset=month", "products", "parts", "expenses", "profit", "technicians", "warranty", "sources"]) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await json(`/api/staff/reports/${path}${sep}preset=month`, { token: admin.token });
    assert(res.status === 200, `report ${path.split("?")[0]} loads (${res.status})`);
  }
  const dash = await json<{ totals: { legalOverdue: number; debt: number }; previous: unknown }>("/api/staff/reports/dashboard?preset=month", { token: admin.token });
  assert(typeof dash.body.totals.legalOverdue === "number" && typeof dash.body.totals.debt === "number" && dash.body.previous !== undefined, "the dashboard has legal-deadline, debt and previous-period figures");
  const earnings = await json<{ total: number; jobs: unknown[] }>("/api/staff/my-jobs/earnings?preset=month", { token: shopTech.token });
  assert(earnings.status === 200 && earnings.body.jobs.length > 0 && earnings.body.total > 0, "a technician sees their own earnings");
  const payroll = await json<{ rows: Array<{ id: string; total: number }> }>("/api/staff/payroll?preset=month", { token: admin.token });
  assert(payroll.status === 200 && payroll.body.rows.length >= 2, "payroll lists every technician");
  assert((await json("/api/staff/payroll/adjustments", { method: "POST", token: admin.token, body: JSON.stringify({ staffUserId: shopTech.user?.id, amount: -5000, reason: "Smoke penalty" }) })).status === 201, "a penalty is recorded");
  const lowSuggest = await json<{ suggestions: unknown[] }>("/api/staff/part-orders", { token: desk.token });
  assert(Array.isArray(lowSuggest.body.suggestions), "low-stock suggestions come with the part orders");
  const settings = await json<{ settings: { repairLegalDays: number } }>("/api/staff/settings", { token: tech.token });
  assert(settings.body.settings.repairLegalDays === 20, "the legal repair limit defaults to 20 days");

  console.log("http: customer isolation + notifications");
  const portalList = await json<{ requests: Array<{ id: string; notes?: unknown }> }>("/api/customer/requests", { token: customer.token });
  assert(portalList.status === 200 && portalList.body.requests.every((row) => !("notes" in row) && !("estimatedCost" in row)), "portal list omits staff-only fields");
  assert((await json("/api/customer/requests/not-a-real-id", { token: customer.token })).status === 404, "customer cannot open another request");
  const notes = await json<{ notifications: unknown[]; unreadCount: number }>("/api/customer/notifications", { token: customer.token });
  assert(notes.status === 200 && typeof notes.body.unreadCount === "number", "customer notifications load");
  const portalNew = await json("/api/customer/requests", { method: "POST", token: customer.token, body: JSON.stringify({ type: "repair", productId: tv.id, issueDescription: "Portal smoke request", locationType: "in_shop", serialNumber: `PT-${tag}` }) });
  assert(portalNew.status === 201, "customer can submit a request");
  assert((await json("/api/customer/requests", { method: "POST", token: customer.token, body: JSON.stringify({ type: "repair", productId: tv.id, issueDescription: "Portal duplicate", locationType: "in_shop", serialNumber: `PT-${tag}` }) })).status === 409, "customers cannot file the same repair twice");

  console.log("http: deactivating a technician cuts access");
  const deactivated = await json<{ technician: { isActive: boolean } }>(`/api/staff/technicians/${shopTech.user?.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ isActive: false }) });
  assert(deactivated.status === 200 && deactivated.body.technician.isActive === false, "admin can deactivate a technician");
  assert((await json("/api/staff/my-jobs", { token: shopTech.token })).status === 401, "deactivated technician loses API access");
  assert((await json("/api/staff/auth/login", { method: "POST", body: JSON.stringify({ phone: "998900000004", password: "tech123" }) })).status === 403, "deactivated technician cannot sign in");
  await json(`/api/staff/technicians/${shopTech.user?.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ isActive: true }) });

  if (failed > 0) {
    console.error(`\n${failed} smoke check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll smoke checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
