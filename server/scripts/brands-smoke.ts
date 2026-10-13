/**
 * Checks for brands, models of other makers, the "I repair" list, approval and the queue rule
 * (RIZO / warranty jobs first). Needs the API running (SMOKE_API) on a scratch database.
 *   npm run smoke:brands -w server
 */
import { prisma } from "../src/lib/prisma.js";

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
const put = (path: string, token: string, data: unknown) => api(path, { method: "PUT", token, body: JSON.stringify(data) });
const patch = (path: string, token: string, data: unknown) => api(path, { method: "PATCH", token, body: JSON.stringify(data) });
async function login(phone: string, password: string, scope: "staff" | "customer" = "staff") {
  const res = await api(`/api/${scope}/auth/login`, { method: "POST", body: JSON.stringify({ phone, password }) });
  assert(res.status === 200 && res.body.token, `sign in ${phone}`);
  return res.body.token as string;
}

async function main() {
  const admin = await login("998900000001", "admin123");
  const tech = await login("998900000002", "tech123");
  const desk = await login("998900000005", "desk123");
  const customerToken = await login("998900000003", "customer123", "customer");
  const techRow = await prisma.staffUser.findFirstOrThrow({ where: { phone: "998900000002" } });
  const customer = await prisma.customer.findFirstOrThrow({ where: { phone: "998900000003" } });
  const category = (await prisma.productCategory.findFirstOrThrow({ orderBy: { name: "asc" } })).name;

  // Requests are never deleted, so every run uses brand names of its own (letters only: the directory ignores everything else).
  const tag = Array.from({ length: 8 }, () => "abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 26)]).join("");
  const BRAND = `Zx${tag}`;
  const NEAR = `${BRAND.slice(0, -1)}${BRAND.endsWith("q") ? "z" : "q"}`;
  await prisma.staffSkill.deleteMany({});
  await prisma.notification.deleteMany({ where: { code: { in: ["catalogPendingBrand", "catalogPendingModel"] } } });

  console.log("the company's own brand");
  const first = await api("/api/staff/directory/brands", { token: desk });
  const own = (first.body.brands as any[]).find((brand) => brand.isOwn);
  assert(first.status === 200 && own?.name === "RIZO" && own.modelCount > 0, "RIZO is the own brand and owns the existing products");
  assert((await patch(`/api/staff/directory/brands/${own.id}`, admin, { name: "Other" })).status === 400, "the own brand cannot be renamed");
  assert((await api(`/api/staff/directory/brands/${own.id}`, { method: "DELETE", token: admin })).status === 400, "the own brand cannot be deleted");

  console.log("a technician adds a brand and a model");
  const added = await post("/api/staff/directory/brands", tech, { name: BRAND });
  assert(added.status === 201 && added.body.brand.approved === false, "the brand waits for approval");
  const brandId = added.body.brand.id as string;
  const again = await post("/api/staff/directory/brands", tech, { name: ` ${BRAND.toUpperCase()} ` });
  assert(again.status === 200 && again.body.created === false && again.body.brand.id === brandId, "the same name in other letters is the same brand");
  const near = await post("/api/staff/directory/brands", tech, { name: NEAR });
  assert(near.status === 409 && near.body.code === "similarBrand", "a near-duplicate is flagged with the similar brand");
  assert((await post("/api/staff/directory/brands", tech, { name: NEAR, force: true })).status === 201, "it can still be added on purpose");
  assert((await prisma.notification.count({ where: { code: { in: ["catalogPendingBrand", "catalogPendingModel"] } } })) >= 1, "admins are told something waits for approval");
  const model = await post("/api/staff/directory/models", tech, { brandId, category, model: "WW70" });
  assert(model.status === 201 && model.body.model.name === `${BRAND} WW70` && model.body.model.approved === false, "the model is named with its brand and waits");
  const modelId = model.body.model.id as string;
  const dup = await post("/api/staff/directory/models", tech, { brandId, category, model: "ww-70" });
  assert(dup.status === 200 && dup.body.created === false && dup.body.model.id === modelId, "the same model in other letters is not added twice");
  assert((await post("/api/staff/directory/models", tech, { brandId, category: "Nope", model: "X1" })).status === 400, "an unknown category is refused");
  assert((await post("/api/staff/directory/models", tech, { brandId: own.id, category, model: "X1" })).status === 400, "models are not added under the own brand");
  const skills = await api("/api/staff/directory/skills", { token: tech });
  assert(skills.body.brands.some((b: any) => b.id === brandId) && skills.body.models.some((m: any) => m.id === modelId), "what a technician adds lands in their own list");

  console.log("approval");
  const body = { type: "repair", customerId: customer.id, productId: modelId, issueDescription: "Does not spin", locationType: "on_site", customerLocation: { address: "Tashkent, Chilonzor 5" }, technicianTypeRequired: "mobile", autoAssign: true };
  const blocked = await post("/api/staff/requests", admin, body);
  assert(blocked.status === 409 && blocked.body.code === "modelNotApproved", "a model waiting for approval cannot be used yet");
  assert((await post(`/api/staff/directory/models/${modelId}/approve`, desk)).status === 403, "the front desk cannot approve");
  assert((await post(`/api/staff/directory/models/${modelId}/approve`, tech)).status === 403, "a technician cannot approve");
  const pending = await api("/api/staff/directory/pending", { token: admin });
  assert(pending.body.models.length >= 1 && pending.body.brands.length >= 1, "the admin sees what waits");
  assert((await post(`/api/staff/directory/models/${modelId}/approve`, admin)).status === 200, "one admin is enough to approve");
  const adminAdded = await post("/api/staff/directory/brands", admin, { name: `Ar${tag.split("").reverse().join("")}` });
  assert(adminAdded.status === 201 && adminAdded.body.brand.approved === true, "an admin's own brand is approved at once");

  console.log("the customer never sees other makers");
  const customerProducts = await api("/api/customer/products", { token: customerToken });
  assert(customerProducts.status === 200 && !(customerProducts.body.products as any[]).some((p) => p.id === modelId), "the customer app lists RIZO products only");
  const register = await post("/api/customer/sales/register", customerToken, { productId: modelId, serialNumber: "SMK-1", purchaseDate: "2026-01-01" });
  assert(register.status >= 400, "a customer cannot register another maker's device");
  assert(!(await api("/api/staff/products", { token: admin })).body.products.some((p: any) => p.id === modelId), "the RIZO catalogue hides other makers");

  console.log("assignment follows the \"I repair\" list");
  await put("/api/staff/directory/skills", tech, { brandIds: [], productIds: [] });
  const none = await post("/api/staff/requests", admin, body);
  assert(none.status === 201 && none.body.request.assignedTechnician == null, "nobody lists it, so the job stays unassigned");
  assert(none.body.request.tier === 2 && none.body.request.isPaidRepair === true, "it is second-tier and paid");
  await prisma.serviceRequest.update({ where: { id: none.body.request.id }, data: { status: "cancelled" } });
  const listed = await put("/api/staff/directory/skills", tech, { brandIds: [brandId], productIds: [] });
  assert(listed.status === 200 && listed.body.brands.length === 1, "the technician lists the brand");
  const mine = await post("/api/staff/requests", admin, { ...body, allowDuplicate: true });
  assert(mine.status === 201 && mine.body.request.assignedTechnician?.id === techRow.id, "now the job goes to that technician");
  const jobId = mine.body.request.id as string;

  console.log("RIZO and warranty jobs go first");
  await prisma.serviceRequest.updateMany({ where: { assignedTechnicianId: techRow.id, id: { not: jobId }, status: { in: ["new", "diagnosing", "in_progress"] } }, data: { assignedTechnicianId: null } });
  const rizoJob = await prisma.serviceRequest.findFirstOrThrow({ where: { product: { brand: { isOwn: true } }, status: "new", id: { not: jobId } } });
  await prisma.serviceRequest.update({ where: { id: rizoJob.id }, data: { assignedTechnicianId: techRow.id } });
  const board = await api("/api/staff/my-jobs", { token: tech });
  const waiting = (board.body.jobs as any[]).find((job) => job.id === jobId);
  assert(waiting?.waitingForFirstTier === true && waiting.tier === 2, "the job shows as waiting");
  assert((board.body.jobs as any[]).find((job) => job.id === rizoJob.id)?.waitingForFirstTier === false, "the RIZO job does not wait");
  const tryStart = await patch(`/api/staff/my-jobs/${jobId}`, tech, { status: "diagnosing" });
  assert(tryStart.status === 409 && tryStart.body.code === "waitingForWarranty", "the technician cannot start it yet");
  const detail = await api(`/api/staff/requests/${jobId}`, { token: admin });
  assert(detail.body.queue.waiting === true && detail.body.queue.backlog >= 1, "the admin sees the job is waiting and why");
  assert((await post(`/api/staff/requests/${jobId}/queue-override`, desk, { reason: "Customer is in a hurry" })).status === 403, "only an admin can move it to the front");
  assert((await post(`/api/staff/requests/${jobId}/queue-override`, admin, { reason: "x" })).status === 400, "a reason is required");
  const over = await post(`/api/staff/requests/${jobId}/queue-override`, admin, { reason: "Customer is in a hurry" });
  assert(over.status === 200 && over.body.request.queueOverride?.reason === "Customer is in a hurry", "the admin moves it to the front with a reason");
  assert((await prisma.auditLog.count({ where: { action: "request.queueOverride", entityId: jobId } })) === 1, "the override is in the audit log");
  assert((await patch(`/api/staff/my-jobs/${jobId}`, tech, { status: "diagnosing" })).status === 200, "after that the technician can start");

  console.log("a first-tier job is never held back");
  await prisma.serviceRequest.update({ where: { id: jobId }, data: { status: "paused" } });
  const second = await prisma.serviceRequest.findFirstOrThrow({ where: { product: { brand: { isOwn: true } }, type: "repair", id: { notIn: [jobId, rizoJob.id] } } });
  await prisma.serviceRequest.update({ where: { id: second.id }, data: { assignedTechnicianId: techRow.id, status: "new" } });
  assert((await patch(`/api/staff/my-jobs/${second.id}`, tech, { status: "diagnosing" })).status === 200, "RIZO jobs start whenever the technician wants");

  console.log("merging");
  const dupBrand = await post("/api/staff/directory/brands", admin, { name: `${BRAND} Electronics`, force: true });
  const mergeId = dupBrand.body.brand.id as string;
  const dupModel = await post("/api/staff/directory/models", admin, { brandId: mergeId, category, model: "WW70T" , force: true });
  assert(dupModel.status === 201, "a duplicate brand and model exist");
  assert((await post(`/api/staff/directory/brands/${mergeId}/merge`, admin, { intoId: brandId })).status === 200, "the duplicate brand is merged into the real one");
  assert((await prisma.product.findUniqueOrThrow({ where: { id: dupModel.body.model.id } })).brandId === brandId, "its models moved over");
  assert((await prisma.brand.findUnique({ where: { id: mergeId } })) == null, "the duplicate is gone");
  assert((await api(`/api/staff/directory/models/${modelId}`, { method: "DELETE", token: admin })).status === 409, "a model with requests cannot be deleted");

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nbrands smoke: all passed");
}
main().then(() => prisma.$disconnect()).catch((error) => {
  console.error(error);
  process.exit(1);
});
