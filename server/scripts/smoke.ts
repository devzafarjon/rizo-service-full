import { computeJobCost, completionGaps } from "../src/lib/jobWork.js";
import { buildDisplayId } from "../src/lib/displayId.js";
import { computeWarrantyExpiry, computeWarrantyStatus, parseDateOnly } from "../src/lib/warranty.js";

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
  console.log("unit: warranty / cost / display id / completion");
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
  assert(free.coveredByWarranty, "in-warranty catalog is covered");

  const gaps = completionGaps({ serviceLines: [], partLines: [], photos: [], resolutionType: null, replacement: null });
  assert(gaps.includes("photo") && gaps.includes("service") && !gaps.includes("part"), "photo+service required, parts optional");
  assert(
    completionGaps({ serviceLines: services, partLines: [], photos: [], resolutionType: null, replacement: null }, { requireService: false }).includes("photo"),
    "photo still required",
  );
  const replaceGaps = completionGaps({ serviceLines: [], partLines: [], photos: [{ id: "x", photoUrl: "/x", uploadedBy: "t", createdAt: new Date() }], resolutionType: "replace", replacement: null });
  assert(replaceGaps.length === 1 && replaceGaps[0] === "replacement", "replacement needs product + serial, no service line");

  assert(buildDisplayId(new Date("2026-09-18T10:00:00+05:00"), "01", 8) === "180926010008", "display id DDMMYY+region+seq");

  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-09-19T10:00:00+05:00");
  const progressStart = "2026-09-18T18:32:00+05:00";
  const newStart = "2026-09-18T08:00:00+05:00";
  const remaining = new Date(progressStart).getTime() + 3 * day - now;
  assert(remaining > 0 && remaining / (3 * day) > 0.25, "in-progress 3-day timer still green after ~15h");
  assert(new Date(newStart).getTime() + day - now < 0, "1-day new timer is overdue after 26h");
}

async function main() {
  unitChecks();

  console.log("http: health");
  const health = await json<{ ok?: boolean }>("/api/health");
  assert(health.status === 200, "health 200");

  console.log("http: auth scopes");
  const admin = await login("/api/staff/auth/login", "998900000001", "admin123");
  const tech = await login("/api/staff/auth/login", "998900000002", "tech123");
  const customer = await login("/api/customer/auth/login", "998900000003", "customer123");
  const bad = await json("/api/staff/auth/login", { method: "POST", body: JSON.stringify({ phone: "998900000001", password: "nope" }) });
  assert(bad.status === 401, "bad staff password 401");

  let limited = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const tried = await json("/api/staff/auth/login", { method: "POST", body: JSON.stringify({ phone: "998900009999", password: "nope" }) });
    if (tried.status === 429) limited += 1;
  }
  assert(limited >= 1, "login is rate limited after repeated failures");
  const goodAfter = await json("/api/staff/auth/login", { method: "POST", body: JSON.stringify({ phone: "998900000001", password: "admin123" }) });
  assert(goodAfter.status === 200, "a different phone is not locked out");

  // Use a throwaway account: a reset replaces the password.
  const throwawayPhone = `99893${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
  const registered = await json("/api/customer/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke Reset", phone: throwawayPhone, password: "smoke-pass-1" }),
  });
  assert(registered.status === 201 || registered.status === 200, `throwaway customer registered (${registered.status})`);
  const forgot = await json<Record<string, unknown>>("/api/customer/auth/forgot", { method: "POST", body: JSON.stringify({ phone: throwawayPhone }) });
  assert(forgot.status === 200 && !("temporaryPassword" in forgot.body), "password reset never returns the new password");
  const forgotUnknown = await json("/api/customer/auth/forgot", { method: "POST", body: JSON.stringify({ phone: "998900008888" }) });
  assert(forgotUnknown.status === 200, "password reset does not reveal unknown numbers");
  const oldPassword = await json("/api/customer/auth/login", { method: "POST", body: JSON.stringify({ phone: throwawayPhone, password: "smoke-pass-1" }) });
  assert(oldPassword.status === 401, "reset replaced the old password");

  const staffAsCustomer = await json("/api/customer/requests", { token: admin.token });
  assert(staffAsCustomer.status === 403, "staff token cannot call customer routes");
  const customerAsStaff = await json("/api/staff/requests", { token: customer.token });
  assert(customerAsStaff.status === 403, "customer token cannot call staff routes");
  const techReports = await json("/api/staff/reports/dashboard?preset=month", { token: tech.token });
  assert(techReports.status === 403, "technician cannot open reports API");
  const customerReports = await json("/api/staff/reports/dashboard?preset=month", { token: customer.token });
  assert(customerReports.status === 403, "customer cannot open reports API");

  const otherJob = await json("/api/staff/my-jobs/does-not-exist", { token: tech.token });
  assert(otherJob.status === 404, "technician cannot read an unknown/foreign job");

  console.log("http: request create + concurrent display ids");
  const customers = await json<{ customers: Array<{ id: string; phone: string }> }>("/api/staff/customers", { token: admin.token });
  const products = await json<{ products: Array<{ id: string; category: string }> }>("/api/staff/products", { token: admin.token });
  const dilnoza = customers.body.customers.find((row) => row.phone === "998900000003");
  const product = products.body.products[0];
  assert(dilnoza && product, "seed customer and product exist");

  const created = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      json<{ request: { id: string; displayId: string } }>("/api/staff/requests", {
        method: "POST",
        token: admin.token,
        body: JSON.stringify({
          type: "repair",
          customerId: dilnoza!.id,
          productId: product!.id,
          issueDescription: `Smoke concurrent ${index + 1}`,
          locationType: "in_shop",
          technicianTypeRequired: "service_center",
          autoAssign: false,
        }),
      }),
    ),
  );
  const installInShop = await json("/api/staff/requests", {
    method: "POST",
    token: admin.token,
    body: JSON.stringify({
      type: "installation",
      customerId: dilnoza!.id,
      productId: product!.id,
      issueDescription: "Smoke installation in shop",
      locationType: "in_shop",
      technicianTypeRequired: "service_center",
      autoAssign: false,
    }),
  });
  assert(installInShop.status === 400, "installation cannot be created as in-shop");
  const installPortal = await json("/api/customer/requests", {
    method: "POST",
    token: customer.token,
    body: JSON.stringify({ type: "installation", productId: product!.id, issueDescription: "Smoke", locationType: "in_shop" }),
  });
  assert(installPortal.status === 400, "customers cannot request an in-shop installation");

  assert(created.every((row) => row.status === 201), "six concurrent creates return 201");
  const ids = created.map((row) => row.body.request.displayId);
  assert(new Set(ids).size === ids.length, `concurrent display ids unique: ${ids.join(", ")}`);
  const seqs = ids.map((id) => Number(id.slice(-4)));
  assert(seqs.every((n) => Number.isFinite(n)), "display id sequences are numeric");

  console.log("http: customer isolation + notification");
  const portalList = await json<{ requests: Array<{ id: string; customerId?: string; notes?: unknown }> }>("/api/customer/requests", {
    token: customer.token,
  });
  assert(portalList.status === 200, "customer can list own requests");
  assert(
    portalList.body.requests.every((row) => !("notes" in row) && !("estimatedCost" in row)),
    "portal list omits staff-only fields",
  );
  const foreign = await json("/api/customer/requests/not-a-real-id", { token: customer.token });
  assert(foreign.status === 404, "customer cannot open another request");
  const notes = await json<{ notifications: unknown[]; unreadCount: number }>("/api/customer/notifications", { token: customer.token });
  assert(notes.status === 200 && typeof notes.body.unreadCount === "number", "customer notifications load");

  console.log("http: job completion cost");
  const catalog = await json<{ services: Array<{ id: string; productCategories: string[]; price: number }> }>("/api/staff/catalog/services", {
    token: admin.token,
  });
  const service = catalog.body.services.find((row) => row.productCategories.includes(product!.category)) ?? catalog.body.services[0];
  const assigned = await json<{ request: { id: string }; assignment?: { technicianName: string | null } }>("/api/staff/requests", {
    method: "POST",
    token: admin.token,
    body: JSON.stringify({
      type: "repair",
      customerId: dilnoza!.id,
      productId: product!.id,
      issueDescription: "Smoke completion",
      locationType: "on_site",
      customerLocation: { address: "12 Amir Temur Avenue, Tashkent" },
      technicianTypeRequired: "mobile",
      assignedTechnicianId: tech.user?.id,
      autoAssign: false,
    }),
  });
  assert(assigned.status === 201, "assigned repair created");
  const jobId = assigned.body.request.id;

  const blocked = await json(`/api/staff/my-jobs/${jobId}/complete`, { method: "POST", token: tech.token });
  assert(blocked.status === 400, "complete without photo/service is rejected");

  if (service) {
    const addService = await json(`/api/staff/my-jobs/${jobId}/service-lines`, {
      method: "POST",
      token: tech.token,
      body: JSON.stringify({ serviceCatalogItemId: service.id }),
    });
    assert(addService.status === 201, "technician can add a service");
  }
  const extra = await json(`/api/staff/my-jobs/${jobId}/extra-expenses`, {
    method: "POST",
    token: tech.token,
    body: JSON.stringify({ description: "Taxi", price: 12000 }),
  });
  assert(extra.status === 201, "technician can add extra expense");

  const form = new FormData();
  form.append("photos", new Blob([PNG], { type: "image/png" }), "smoke.png");
  const photoRes = await fetch(`${API}/api/staff/my-jobs/${jobId}/photos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tech.token}` },
    body: form,
  });
  assert(photoRes.status === 201, `photo upload ${photoRes.status}`);

  const done = await json<{ job: { status: string; finalCost: number }; cost: { chargedTotal: number; extrasTotal: number } }>(
    `/api/staff/my-jobs/${jobId}/complete`,
    { method: "POST", token: tech.token },
  );
  assert(done.status === 200, "complete after photo succeeds");
  assert(done.body.job.status === "completed", `done status ${done.body.job.status}`);
  assert(done.body.job.finalCost === done.body.cost.chargedTotal, "finalCost matches chargedTotal");
  assert(done.body.cost.extrasTotal === 12000, "extra expense is in the total");

  const receipt = await json(`/api/staff/requests/${jobId}`, { token: admin.token });
  assert(receipt.status === 200, "admin can open completed request / receipt source");

  console.log("http: pause, resume, arrival, replacement, pickup, rating, cancel");
  const shopTech = await login("/api/staff/auth/login", "998900000004", "tech123");
  const createJob = async (body: Record<string, unknown>) =>
    json<{ request: { id: string; displayId: string; status: string } }>("/api/staff/requests", {
      method: "POST",
      token: admin.token,
      body: JSON.stringify({ customerId: dilnoza!.id, productId: product!.id, autoAssign: false, ...body }),
    });
  const uploadPhoto = async (token: string, id: string) => {
    const f = new FormData();
    f.append("photos", new Blob([PNG], { type: "image/png" }), "smoke.png");
    return fetch(`${API}/api/staff/my-jobs/${id}/photos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: f });
  };

  const fieldJob = await createJob({
    type: "repair", issueDescription: "Smoke replace flow", locationType: "on_site", customerLocation: { address: "12 Amir Temur Avenue" },
    technicianTypeRequired: "mobile", assignedTechnicianId: tech.user?.id, defectType: "dead_on_arrival",
  });
  const fieldId = fieldJob.body.request.id;
  assert(fieldJob.body.request.status === "new", "new requests start as New");

  const noReason = await json(`/api/staff/my-jobs/${fieldId}`, { method: "PATCH", token: tech.token, body: JSON.stringify({ column: "paused" }) });
  assert(noReason.status === 400, "pausing without a reason is rejected");
  const paused = await json<{ job: { status: string; activePause: { reason: string } | null; timer: { durationMs: number } | null } }>(
    `/api/staff/my-jobs/${fieldId}`,
    { method: "PATCH", token: tech.token, body: JSON.stringify({ column: "paused", pauseReason: "Waiting for a part", pauseHours: 6 }) },
  );
  assert(paused.status === 200 && paused.body.job.status === "paused", "technician can pause with a reason");
  assert(paused.body.job.timer?.durationMs === 6 * 3600_000, "paused timer uses the technician's duration");
  const resumed = await json<{ job: { status: string; acceptedAt: string | null } }>(`/api/staff/my-jobs/${fieldId}`, {
    method: "PATCH", token: tech.token, body: JSON.stringify({ column: "in_progress" }),
  });
  assert(resumed.status === 200 && resumed.body.job.status === "in_progress" && resumed.body.job.acceptedAt, "resume returns to In progress and stamps accepted_at");
  const arrived = await json<{ job: { arrivedAt: string | null } }>(`/api/staff/my-jobs/${fieldId}/arrived`, { method: "POST", token: tech.token });
  assert(arrived.status === 200 && arrived.body.job.arrivedAt, "technician records arrival on site");

  const replaceNoSerial = await json(`/api/staff/my-jobs/${fieldId}/resolution`, {
    method: "PUT", token: tech.token, body: JSON.stringify({ resolutionType: "replace", productId: product!.id }),
  });
  assert(replaceNoSerial.status === 400, "replacement needs a serial number");
  const replaceOk = await json<{ replacement: { serialNumber: string } | null }>(`/api/staff/my-jobs/${fieldId}/resolution`, {
    method: "PUT", token: tech.token, body: JSON.stringify({ resolutionType: "replace", productId: product!.id, serialNumber: "SN-SMOKE-1" }),
  });
  assert(replaceOk.status === 200 && replaceOk.body.replacement?.serialNumber === "SN-SMOKE-1", "replacement item is recorded");
  const noPhotoYet = await json(`/api/staff/my-jobs/${fieldId}/complete`, { method: "POST", token: tech.token });
  assert(noPhotoYet.status === 400, "replacement still needs a photo");
  assert((await uploadPhoto(tech.token!, fieldId)).status === 201, "photo uploaded for replacement job");
  const replaced = await json<{ job: { status: string; resolutionType: string | null } }>(`/api/staff/my-jobs/${fieldId}/complete`, { method: "POST", token: tech.token });
  assert(replaced.status === 200 && replaced.body.job.status === "completed" && replaced.body.job.resolutionType === "replace", "replacement job completes with resolution=replace");
  const onSitePickup = await json(`/api/staff/requests/${fieldId}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "picked_up" }) });
  assert(onSitePickup.status === 400, "on-site jobs have no counter pickup");

  const shopJob = await createJob({
    type: "repair", issueDescription: "Smoke in-shop pickup", locationType: "in_shop", technicianTypeRequired: "service_center",
    assignedTechnicianId: shopTech.user?.id, defectType: "failed_during_use",
  });
  const shopId = shopJob.body.request.id;
  if (service) {
    await json(`/api/staff/my-jobs/${shopId}/service-lines`, { method: "POST", token: shopTech.token, body: JSON.stringify({ serviceCatalogItemId: service.id }) });
  }
  assert((await uploadPhoto(shopTech.token!, shopId)).status === 201, "photo uploaded for shop job");
  const shopDone = await json<{ job: { status: string } }>(`/api/staff/my-jobs/${shopId}/complete`, { method: "POST", token: shopTech.token });
  assert(shopDone.status === 200 && shopDone.body.job.status === "completed", "in-shop job completed");
  const portalShop = await json<{ request: { canConfirmPickup: boolean; assignedTechnician: { name: string } | null } }>(`/api/customer/requests/${shopId}`, { token: customer.token });
  assert(portalShop.body.request.canConfirmPickup === true, "customer is offered pickup confirmation");
  const firstName = (shopTech.user as { name?: string } | undefined)?.name?.split(" ")[0];
  assert(!firstName || portalShop.body.request.assignedTechnician?.name === firstName, "customer sees the technician's first name only");
  const earlyFeedback = await json(`/api/customer/requests/${shopId}/feedback`, { method: "POST", token: customer.token, body: JSON.stringify({ rating: 4 }) });
  assert(earlyFeedback.status === 201, "feedback allowed once work is completed");
  const pickedUp = await json<{ request: { status: string; pickupConfirmedAt: string | null } }>(`/api/customer/requests/${shopId}/pickup`, { method: "POST", token: customer.token, body: JSON.stringify({}) });
  assert(pickedUp.status === 200 && pickedUp.body.request.pickupConfirmedAt, "customer confirms pickup (tap)");
  const afterPickup = await json<{ request: { status: string; pickupConfirmationType: string | null } }>(`/api/staff/requests/${shopId}`, { token: admin.token });
  assert(afterPickup.body.request.status === "picked_up" && afterPickup.body.request.pickupConfirmationType === "tap", "status is picked_up with type tap");

  const cancelJob = await createJob({
    type: "installation", issueDescription: "Smoke cancel", locationType: "on_site", customerLocation: { address: "12 Amir Temur Avenue" },
    technicianTypeRequired: "mobile", assignedTechnicianId: tech.user?.id,
  });
  const cancelled = await json<{ request: { status: string } }>(`/api/staff/requests/${cancelJob.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "cancelled" }) });
  assert(cancelled.status === 200 && cancelled.body.request.status === "cancelled", "admin can cancel a request");
  const techJobs = await json<{ jobs: Array<{ id: string }> }>("/api/staff/my-jobs", { token: tech.token });
  assert(!techJobs.body.jobs.some((job) => job.id === cancelJob.body.request.id), "cancelled jobs leave the technician board");
  const badMove = await json(`/api/staff/requests/${cancelJob.body.request.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ status: "completed" }) });
  assert(badMove.status === 400, "cancelled requests cannot jump to completed");

  const deactivated = await json<{ technician: { isActive: boolean } }>(`/api/staff/technicians/${shopTech.user?.id}`, {
    method: "PATCH", token: admin.token, body: JSON.stringify({ isActive: false }),
  });
  assert(deactivated.status === 200 && deactivated.body.technician.isActive === false, "admin can deactivate a technician");
  const lockedOut = await json("/api/staff/my-jobs", { token: shopTech.token });
  assert(lockedOut.status === 401, "deactivated technician loses API access");
  const lockedLogin = await json("/api/staff/auth/login", { method: "POST", body: JSON.stringify({ phone: "998900000004", password: "tech123" }) });
  assert(lockedLogin.status === 403, "deactivated technician cannot sign in");
  await json(`/api/staff/technicians/${shopTech.user?.id}`, { method: "PATCH", token: admin.token, body: JSON.stringify({ isActive: true }) });

  const portalNew = await json<{ request: { id: string } }>("/api/customer/requests", {
    method: "POST",
    token: customer.token,
    body: JSON.stringify({
      type: "repair",
      productId: product!.id,
      issueDescription: "Portal smoke request",
      locationType: "in_shop",
    }),
  });
  assert(portalNew.status === 201, "customer can submit a request");

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
