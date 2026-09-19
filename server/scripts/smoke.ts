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

  const gaps = completionGaps({ serviceLines: [], partLines: [], photos: [] });
  assert(gaps.includes("photo") && gaps.includes("service") && !gaps.includes("part"), "photo+service required, parts optional");
  assert(completionGaps({ serviceLines: services, partLines: [], photos: [] }, { requireService: false }).includes("photo"), "photo still required");

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
  const catalog = await json<{ services: Array<{ id: string; productCategory: string; price: number }> }>("/api/staff/catalog/services", {
    token: admin.token,
  });
  const service = catalog.body.services.find((row) => row.productCategory === product!.category) ?? catalog.body.services[0];
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
  assert(["closed", "completed", "replaced"].includes(done.body.job.status), `done status ${done.body.job.status}`);
  assert(done.body.job.finalCost === done.body.cost.chargedTotal, "finalCost matches chargedTotal");
  assert(done.body.cost.extrasTotal === 12000, "extra expense is in the total");

  const receipt = await json(`/api/staff/requests/${jobId}`, { token: admin.token });
  assert(receipt.status === 200, "admin can open completed request / receipt source");

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
