/**
 * End-to-end checks for the newer features: roles, visit booking, ETA, checklists, technician stock, help centre,
 * warranty plans, fiscal receipts, privacy, two-step sign-in, the market API, the Telegram bot and the KPIs.
 * Needs the API running (SMOKE_API) on a scratch database, with MARKET_API_KEY=smoke-key.
 *   npm run smoke:growth -w server
 */
import { prisma } from "../src/lib/prisma.js";
import { syncOverdueRequests } from "../src/lib/sla.js";
import { handleUpdate, setTelegramCaller } from "../src/lib/telegramBot.js";
import { totpCode } from "../src/lib/totp.js";

const API = process.env.SMOKE_API ?? "http://localhost:4100";
const MARKET_KEY = process.env.MARKET_API_KEY ?? "smoke-key";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let failed = 0;
function assert(condition: unknown, message: string) {
  if (condition) return console.log(`  ok  ${message}`);
  failed += 1;
  console.error(`  FAIL ${message}`);
}

type Res<T = any> = { status: number; body: T };
async function api<T = any>(path: string, options: RequestInit & { token?: string; key?: string } = {}): Promise<Res<T>> {
  const { token, key, headers, ...rest } = options;
  const res = await fetch(`${API}${path}`, {
    ...rest,
    headers: {
      ...(rest.body && !(rest.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "X-Api-Key": key } : {}),
      ...headers,
    },
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}
const post = (path: string, token: string | undefined, data: unknown = {}) => api(path, { method: "POST", token, body: JSON.stringify(data) });
const patch = (path: string, token: string, data: unknown) => api(path, { method: "PATCH", token, body: JSON.stringify(data) });
const put = (path: string, token: string, data: unknown) => api(path, { method: "PUT", token, body: JSON.stringify(data) });

async function login(scope: "staff" | "customer", phone: string, password: string, code?: string) {
  const res = await api(`/api/${scope}/auth/login`, { method: "POST", body: JSON.stringify({ phone, password, code }) });
  return res;
}
async function token(scope: "staff" | "customer", phone: string, password: string) {
  const res = await login(scope, phone, password);
  assert(res.status === 200 && res.body.token, `sign in ${phone}`);
  return res.body.token as string;
}

function ymd(offsetDays: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(Date.now() + offsetDays * 86_400_000));
}

async function main() {
  const suffix = String(Date.now()).slice(-6);
  const admin = await token("staff", "998900000001", "admin123");
  const desk = await token("staff", "998900000005", "desk123");
  const tech = await token("staff", "998900000002", "tech123");
  const acct = await token("staff", "998900000006", "acc12345");
  const ware = await token("staff", "998900000007", "ware1234");

  console.log("roles");
  assert((await api("/api/staff/reports/dashboard?preset=all", { token: acct })).status === 200, "accountant reads the dashboard");
  assert((await post("/api/staff/requests/bulk", acct, { ids: ["x"], action: "priority", priority: "low" })).status === 403, "accountant cannot change requests");
  assert((await api("/api/staff/tech-stock", { token: ware })).status === 200, "warehouse reads technician stock");
  assert((await api("/api/staff/tech-stock", { token: desk })).status === 403, "front desk cannot read technician stock");
  assert((await api("/api/staff/requests", { token: ware })).status === 403, "warehouse has no access to requests");
  assert((await api("/api/staff/staff", { token: acct })).status === 403, "accountant cannot manage staff");

  console.log("settings");
  const settings = await api("/api/staff/settings", { token: admin });
  assert(typeof settings.body.settings?.visitSlots === "string" && settings.body.settings.visitsPerTechnicianPerDay >= 1, "settings expose the visit rules");
  assert((await patch("/api/staff/settings", admin, { visitSlots: "9-11" })).status === 400, "a bad time window is rejected");

  // A clean customer with a purchase of a refrigerator (so no earlier open request gets in the way).
  const phone = `99890${suffix}1`;
  const customer = await post("/api/staff/customers", admin, { name: "Smoke Customer", phone, password: "smoke1234", address: "1 Test Street, Tashkent" });
  assert(customer.status === 201, "create a test customer");
  const customerId = customer.body.customer?.id ?? customer.body.id;
  const products = await api("/api/staff/products", { token: admin });
  const fridge = (products.body.products as any[]).find((row) => row.sku === "REF-280");
  const saleRes = await post("/api/staff/sales", admin, { customerId, productId: fridge.id, quantity: 1, saleDate: ymd(-10), pricePaid: 5000000, serialNumber: `SMK-${suffix}` });
  assert(saleRes.status === 201, "record a sale");
  const saleId = saleRes.body.sale.id as string;
  const cust = await token("customer", phone, "smoke1234");

  console.log("visit slots");
  const date = ymd(2);
  const slots = await api(`/api/customer/visit-slots?date=${date}&locationType=on_site`, { token: cust });
  assert(slots.status === 200 && slots.body.slots.some((slot: any) => slot.free), "free booking windows are offered");
  const first = slots.body.slots.find((slot: any) => slot.free);
  const created = await post("/api/customer/requests", cust, {
    type: "repair",
    saleId,
    issueDescription: "Does not cool",
    locationType: "on_site",
    customerLocation: { address: "1 Test Street, Tashkent", lat: 41.31, lng: 69.28 },
    visitDate: date,
    visitSlot: first.slot,
  });
  assert(created.status === 201 && created.body.visitError == null, "request created with a booked window");
  const requestId = created.body.request.id as string;
  assert(created.body.request.visit.slot === first.slot && created.body.request.visit.confirmed, "the customer's own booking is confirmed");
  const after = await api(`/api/customer/visit-slots?date=${date}&requestId=${requestId}`, { token: cust });
  assert(after.status === 200, "slots for the booked request");
  const second = after.body.slots.find((slot: any) => slot.free && slot.slot !== first.slot);
  if (second) {
    const moved = await post(`/api/customer/requests/${requestId}/visit`, cust, { date, slot: second.slot });
    assert(moved.status === 200 && moved.body.request.visit.slot === second.slot, "the visit can be moved");
  }
  assert((await post(`/api/customer/requests/${requestId}/visit`, cust, { date: ymd(-1), slot: first.slot })).status === 400, "a past date is refused");
  assert((await post(`/api/customer/requests/${requestId}/visit`, cust, { date, slot: "03:00-04:00" })).status === 400, "an unknown window is refused");

  console.log("ETA, checklist and technician stock");
  // The new request is assigned automatically (a mobile technician); make it the seeded one for the technician token.
  const me = await api("/api/staff/auth/me", { token: tech });
  await patch(`/api/staff/requests/${requestId}`, admin, { assignedTechnicianId: me.body.user.id });
  const trip = await post(`/api/staff/my-jobs/${requestId}/en-route`, tech, { etaMinutes: 25 });
  assert(trip.status === 200, "technician sets out with an ETA");
  const seen = await api(`/api/customer/requests/${requestId}`, { token: cust });
  assert(seen.body.request.eta?.minutes === 25, "the customer sees the arrival estimate");
  const job = await api(`/api/staff/my-jobs/${requestId}`, { token: tech });
  assert(job.body.checklist?.completion.items.some((item: any) => item.required), "the refrigerator checklist has required items");
  assert(job.body.canComplete === false && job.body.missing.includes("checklist"), "not complete yet (no service or photo, checklist open)");

  const warehouseParts = await api("/api/staff/catalog/parts", { token: ware });
  const part = (warehouseParts.body.parts as any[]).find((row) => row.productCategories.includes("Refrigerators") && row.stockQuantity >= 5);
  assert(Boolean(part), "a refrigerator part with stock exists");
  const techId = me.body.user.id as string;
  const carriedAtStart = ((await api("/api/staff/my-jobs/stock", { token: tech })).body.stock.find((row: any) => row.sparePartId === part.id)?.quantity ?? 0) as number;
  assert((await post("/api/staff/tech-stock/issue", ware, { technicianId: techId, sparePartId: part.id, quantity: 2 })).status === 201, "warehouse issues 2 parts to the technician");
  const carried = await api("/api/staff/my-jobs/stock", { token: tech });
  assert(carried.body.stock.some((row: any) => row.sparePartId === part.id && row.quantity === carriedAtStart + 2), "the technician carries 2 more");
  const centralBefore2 = ((await api("/api/staff/catalog/parts", { token: ware })).body.parts as any[]).find((row) => row.id === part.id).stockQuantity as number;
  await post(`/api/staff/my-jobs/${requestId}/part-lines`, tech, { sparePartId: part.id, quantity: 3 });
  const afterUse = await api("/api/staff/my-jobs/stock", { token: tech });
  const stillCarried = afterUse.body.stock.find((row: any) => row.sparePartId === part.id)?.quantity ?? 0;
  const centralAfter = ((await api("/api/staff/catalog/parts", { token: ware })).body.parts as any[]).find((row) => row.id === part.id).stockQuantity as number;
  // The technician already carried some parts before this test, so work with the difference.
  const fromVan = Math.min(carriedAtStart + 2, 3);
  assert(stillCarried === carriedAtStart + 2 - fromVan && centralAfter === centralBefore2 - (3 - fromVan), `3 parts used: ${fromVan} from the van, ${3 - fromVan} from the warehouse (${stillCarried}, ${centralAfter})`);
  const lineId = (await api(`/api/staff/my-jobs/${requestId}`, { token: tech })).body.partLines[0].id as string;
  await patch(`/api/staff/my-jobs/${requestId}/part-lines/${lineId}`, tech, { quantity: 1 });
  const back = await api("/api/staff/my-jobs/stock", { token: tech });
  assert((back.body.stock.find((row: any) => row.sparePartId === part.id)?.quantity ?? 0) === carriedAtStart + 2 - fromVan + Math.min(2, fromVan), "reducing the line returns the van's share to the technician");

  const catalogServices = await api(`/api/staff/my-jobs/${requestId}`, { token: tech });
  const service = catalogServices.body.catalog.services[0];
  await post(`/api/staff/my-jobs/${requestId}/service-lines`, tech, { serviceCatalogItemId: service.id });
  const form = new FormData();
  form.append("photos", new Blob([PNG], { type: "image/png" }), "a.png");
  const upload = await fetch(`${API}/api/staff/my-jobs/${requestId}/photos`, { method: "POST", headers: { Authorization: `Bearer ${tech}` }, body: form });
  assert(upload.status === 201, "photo uploaded");
  const diag = await patch(`/api/staff/my-jobs/${requestId}`, tech, { column: "in_progress" });
  const work = await patch(`/api/staff/my-jobs/${requestId}`, tech, { column: "in_progress" });
  assert(diag.status === 200 && work.status === 200, `the job is moved into work (${diag.status}/${work.status})`);
  const blocked = await patch(`/api/staff/my-jobs/${requestId}`, tech, { column: "completed" });
  assert(blocked.status === 400 && blocked.body.code === "checklistIncomplete", `completion is blocked by the required checklist (${blocked.status} ${JSON.stringify(blocked.body)})`);
  const ready = await api(`/api/staff/my-jobs/${requestId}`, { token: tech });
  assert(ready.body.missing.includes("checklist") && ready.body.canComplete === false, "the payload lists the checklist as missing");
  const required = ready.body.checklist.completion.items.filter((item: any) => item.required).map((item: any) => item.id);
  const ticked = await put(`/api/staff/my-jobs/${requestId}/checklist`, tech, { kind: "completion", checked: required });
  assert(ticked.status === 200 && ticked.body.canComplete === true, "ticking the required items allows completion");
  const done = await patch(`/api/staff/my-jobs/${requestId}`, tech, { column: "completed" });
  assert(done.status === 200, `job completed (${done.status} ${JSON.stringify(done.body).slice(0, 200)})`);

  console.log("feedback, alerts, bot");
  // Link the customer's Telegram chat through the bot (network call stubbed) and rate through a button.
  const sent: Array<{ method: string; body: any }> = [];
  setTelegramCaller(async (method, body) => {
    sent.push({ method, body });
    return { ok: true, result: {} };
  });
  await handleUpdate({ update_id: 1, message: { chat: { id: 4242 }, contact: { phone_number: phone } } });
  assert((await prisma.customer.findUnique({ where: { id: customerId } }))?.telegramChatId === "4242", "the bot links the chat by phone number");
  await handleUpdate({ update_id: 2, callback_query: { id: "cb1", data: `rate:${requestId}:1`, message: { chat: { id: 4242 } } } });
  const feedback = await prisma.feedback.findUnique({ where: { serviceRequestId: requestId } });
  assert(feedback?.rating === 1, "a rating button records the feedback");
  const alerts = await api("/api/staff/alerts", { token: admin });
  assert((alerts.body.notifications as any[]).some((row) => row.code === "lowRating" && row.serviceRequestId === requestId), "a low rating alerts the admins");
  await handleUpdate({ update_id: 3, message: { chat: { id: 4242 }, text: "Thank you, the fridge works" } });
  assert(sent.some((row) => row.method === "sendMessage" && /sent to the service|yuborildi|отправлено|no open|ochiq|открытых/i.test(String(row.body.text))), "the bot answers a plain message");
  setTelegramCaller(null);

  console.log("escalation and KPIs");
  const stale = await post("/api/staff/requests", admin, { type: "repair", customerId, productId: ((products.body.products as any[]).find((row) => row.sku === "TV-43")).id, issueDescription: "Escalation test", locationType: "on_site", technicianTypeRequired: "mobile", customerLocation: { address: "2 Test Street" }, autoAssign: false });
  assert(stale.status === 201, "create a request to age");
  const staleId = stale.body.request.id as string;
  await prisma.serviceRequest.update({ where: { id: staleId }, data: { statusChangedAt: new Date(Date.now() - 36 * 3_600_000), createdAt: new Date(Date.now() - 36 * 3_600_000) } });
  await syncOverdueRequests();
  const aged = await prisma.serviceRequest.findUnique({ where: { id: staleId } });
  assert((aged?.escalationLevel ?? 0) >= 1, `an overdue job is escalated (level ${aged?.escalationLevel})`);
  const dash = await api("/api/staff/reports/dashboard?preset=all", { token: admin });
  assert(dash.body.service && "firstTimeFixRate" in dash.body.service && Array.isArray(dash.body.service.statusHours), "the dashboard carries the service KPIs");

  console.log("bulk actions");
  const bulk = await post("/api/staff/requests/bulk", desk, { ids: [staleId, "missing"], action: "priority", priority: "urgent" });
  assert(bulk.status === 200 && bulk.body.ok.includes(staleId) && bulk.body.failed.length === 1, "bulk priority changes one and reports the other");

  console.log("help centre");
  const article = await post("/api/staff/help-articles", admin, { productCategory: "Refrigerators", titleEn: `Smoke guide ${suffix}`, bodyEn: "Steps", videoUrl: "https://example.com/v" });
  assert(article.status === 201, "admin writes a guide");
  assert((await post("/api/staff/help-articles", desk, { titleEn: "x" })).status === 403, "the front desk cannot write guides");
  const mine = await api("/api/customer/help", { token: cust });
  assert((mine.body.articles as any[]).some((row) => row.title.en === `Smoke guide ${suffix}`), "the customer sees the guide for their product");
  const open = await api("/api/public/help?category=Refrigerators");
  assert((open.body.articles as any[]).some((row) => row.title.en === `Smoke guide ${suffix}`), "the guide is public too");

  console.log("warranty plans");
  const plans = await api(`/api/customer/warranty-plans?saleId=${saleId}`, { token: cust });
  assert(plans.status === 200 && plans.body.plans.length > 0, "plans are offered for the product");
  const planId = plans.body.plans[0].id as string;
  const wanted = await post(`/api/customer/sales/${saleId}/warranty-plan`, cust, { planId });
  assert(wanted.status === 201, "the customer asks for a plan");
  assert((await post(`/api/customer/sales/${saleId}/warranty-plan`, cust, { planId })).status === 409, "asking twice is refused");
  const before = (await api("/api/customer/sales", { token: cust })).body.sales.find((row: any) => row.id === saleId).warrantyExpiry as string;
  const pending = await api("/api/staff/warranty-plans/purchases?status=requested", { token: desk });
  const purchase = (pending.body.purchases as any[]).find((row) => row.sale.id === saleId);
  assert(Boolean(purchase), "the request reaches the office");
  const paid = await post(`/api/staff/warranty-plans/purchases/${purchase.id}/pay`, desk, { method: "cash", fiscalReceiptNumber: "F-1" });
  assert(paid.status === 200 && paid.body.purchase.status === "paid", "the office takes the payment");
  const extended = (await api("/api/customer/sales", { token: cust })).body.sales.find((row: any) => row.id === saleId).warrantyExpiry as string;
  assert(extended > before, `the warranty is extended (${before} -> ${extended})`);

  console.log("fiscal receipts and pay links");
  await patch("/api/staff/settings", admin, { requireFiscalReceipt: true });
  const noReceipt = await post(`/api/staff/requests/${staleId}/payments`, desk, { amount: 1000, method: "cash" });
  assert(noReceipt.status === 400 && noReceipt.body.code === "fiscalReceiptRequired", "a payment needs a receipt number when the rule is on");
  const withReceipt = await post(`/api/staff/requests/${staleId}/payments`, desk, { amount: 1000, method: "cash", fiscalReceiptNumber: "F-77" });
  assert(withReceipt.status === 201, "a payment with a receipt number is accepted");
  await patch("/api/staff/settings", admin, { requireFiscalReceipt: false });
  const noCheck = await post(`/api/staff/requests/${staleId}/payments`, desk, { amount: 500, method: "cash" });
  assert(noCheck.status === 201, "without the rule a payment needs no number");
  const fiscal = await api("/api/staff/reports/fiscal?preset=all", { token: acct });
  assert(fiscal.status === 200 && fiscal.body.rows.some((row: any) => row.requestId === staleId), "the fiscal report lists the payment without a number");
  const links = await api(`/api/customer/requests/${requestId}/pay-links`, { token: cust });
  assert(links.status === 200 && "enabled" in links.body, "pay links answer");
  const partners = await api("/api/staff/reports/partners?preset=all", { token: acct });
  assert(partners.status === 200 && partners.body.rows.length >= 1, "the partner settlement report lists the partner centre");

  console.log("privacy");
  const exported = await api("/api/customer/auth/me/export", { token: cust });
  assert(exported.status === 200 && exported.body.customer.phone === phone && exported.body.requests.length >= 1, "the customer can export their data");
  assert((await post("/api/customer/auth/me/delete-request", cust)).status === 200, "the customer asks for deletion");
  const alerts2 = await api("/api/staff/alerts", { token: admin });
  assert((alerts2.body.notifications as any[]).some((row) => row.code === "deletionRequest"), "the admins are told");
  const open409 = await post(`/api/staff/customers/${customerId}/anonymize`, admin);
  assert(open409.status === 409, "anonymizing is refused while a request is open");
  await prisma.serviceRequest.updateMany({ where: { customerId, status: { notIn: ["completed", "picked_up", "cancelled", "replaced", "rejected", "refunded"] } }, data: { status: "cancelled" } });
  assert((await post(`/api/staff/customers/${customerId}/anonymize`, admin)).status === 200, "the account is anonymized once nothing is open");
  assert((await login("customer", phone, "smoke1234")).status === 401, "the old sign-in no longer works");

  console.log("two-step sign-in");
  const staffPhone = `99891${suffix}2`;
  const created2 = await post("/api/staff/staff", admin, { name: "Two Step", phone: staffPhone, role: "receptionist", password: "twostep123" });
  assert(created2.status === 201, "create a staff member");
  const tsToken = await token("staff", staffPhone, "twostep123");
  const setup = await post("/api/staff/auth/2fa/setup", tsToken);
  assert(setup.status === 200 && setup.body.secret && String(setup.body.qr).startsWith("data:image"), "setup returns a secret and a QR code");
  assert((await post("/api/staff/auth/2fa/enable", tsToken, { code: "000000" })).status === 401, "a wrong code is refused");
  assert((await post("/api/staff/auth/2fa/enable", tsToken, { code: totpCode(setup.body.secret) })).status === 200, "the right code switches it on");
  const needCode = await login("staff", staffPhone, "twostep123");
  assert(needCode.status === 401 && needCode.body.code === "totpRequired", "sign-in now asks for a code");
  assert((await login("staff", staffPhone, "twostep123", totpCode(setup.body.secret))).status === 200, "sign-in works with the code");
  const staffList = await api("/api/staff/staff", { token: admin });
  const twoStepId = (staffList.body.staff as any[]).find((row) => row.phone === staffPhone).id as string;
  assert((await post(`/api/staff/staff/${twoStepId}/2fa/reset`, admin)).status === 200, "an admin can reset it");
  assert((await login("staff", staffPhone, "twostep123")).status === 200, "sign-in works without a code after the reset");

  console.log("RIZO market API");
  const sale = {
    externalId: `MKT-${suffix}`,
    invoiceNumber: `MK-${suffix}`,
    saleDate: ymd(0),
    customer: { name: "Market Buyer", phone: `99893${suffix}3`, address: "7 Market Street, Tashkent" },
    items: [{ sku: "REF-280", quantity: 1, price: 4900000, serialNumber: `MKT-SN-${suffix}` }],
    installation: { address: "7 Market Street, Tashkent", lat: 41.3, lng: 69.27 },
  };
  assert((await post("/api/integrations/market/sales", undefined, sale)).status === 401, "no key, no entry");
  const imported = await api("/api/integrations/market/sales", { method: "POST", key: MARKET_KEY, body: JSON.stringify(sale) });
  assert(imported.status === 201 && imported.body.sales[0].created && imported.body.installationRequests.length === 1, "a sale creates the customer, the warranty and an installation request");
  const again = await api("/api/integrations/market/sales", { method: "POST", key: MARKET_KEY, body: JSON.stringify(sale) });
  assert(again.status === 201 && again.body.sales[0].created === false, "sending it again does not duplicate it");
  const unknown = await api("/api/integrations/market/sales", { method: "POST", key: MARKET_KEY, body: JSON.stringify({ ...sale, externalId: `X-${suffix}`, invoiceNumber: `X-${suffix}`, items: [{ sku: "NOPE", price: 1 }] }) });
  assert(unknown.status === 422 && unknown.body.code === "unknownSku", "an unknown product is reported");

  console.log("digest");
  const digest = await post("/api/staff/settings/digest-now", admin);
  assert(digest.status === 200 && typeof digest.body.digest.created === "number", "the weekly digest can be sent");

  await prisma.$disconnect();
  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall growth checks passed");
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
