/**
 * Fills a RIZO Service database with believable demo data: ~150 customers who were served over the last ~5 months,
 * their sales, installations and repairs (all statuses), payments, debts, photos and customer ratings.
 *
 * It works through the real API (so every business rule holds) and then moves the timestamps into the past with SQL,
 * so charts and reports show a few months of history instead of one busy afternoon.
 *
 *   API=http://localhost:4100 DATABASE_URL=... npm run demo:load -w server
 *
 * Settings (environment):
 *   API                       server address (default http://localhost:4100)
 *   DATABASE_URL              the database behind that API (timestamps are moved here)
 *   DEMO_COUNT                customers to create (default 150)
 *   DEMO_ADMIN                "phone:password" of an admin  (default 998900000001:admin123)
 *   DEMO_DESK                 "phone:password" of a receptionist/admin who takes payments (default 998900000005:desk123)
 *   DEMO_TECHS                "phone:password,phone:password" of one mobile and one service-centre technician
 *   DEMO_CONFIRM=yes          required when the database is not on this computer
 *
 * Everything it creates is marked (customers carry the note DEMO-DATA, products the SKU prefix DEMO-);
 * `npm run demo:clean -w server` removes it again.
 */
import { PrismaClient } from "@prisma/client";
import { between, chance, COMMENTS, fullName, HIGH_TAGS, ISSUES, LOW_TAGS, mulberry32, OPERATORS, pick, place, rating, REJECT_REASONS, type Rng } from "./demo/data.js";
import { demoImage } from "./demo/images.js";

const API = (process.env.API ?? "http://localhost:4100").replace(/\/+$/, "");
const COUNT = Number(process.env.DEMO_COUNT ?? 150);
const [ADMIN_PHONE, ADMIN_PASSWORD] = (process.env.DEMO_ADMIN ?? "998900000001:admin123").split(":");
const [DESK_PHONE, DESK_PASSWORD] = (process.env.DEMO_DESK ?? "998900000005:desk123").split(":");
const TECH_LOGINS = (process.env.DEMO_TECHS ?? "998900000002:tech123,998900000004:tech123").split(",").map((pair) => pair.split(":"));
const CUSTOMER_PASSWORD = "Demo12345";
const MARK = "DEMO-DATA";
const DAY = 86_400_000;
const prisma = new PrismaClient();

type Json = Record<string, any>;
const stats: Record<string, number> = {};
const bump = (key: string, by = 1) => {
  stats[key] = (stats[key] ?? 0) + by;
};

async function http<T = Json>(path: string, options: RequestInit & { token?: string } = {}): Promise<{ status: number; body: T }> {
  const { token, headers, ...rest } = options;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        ...rest,
        headers: { ...(rest.body && !(rest.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      });
      const body = (await res.json().catch(() => ({}))) as T;
      // A free host may be waking up: retry a few times.
      if ([502, 503, 504].includes(res.status) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        continue;
      }
      return { status: res.status, body };
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}
const post = (path: string, token: string, body: unknown = {}) => http(path, { method: "POST", token, body: JSON.stringify(body) });
const patch = (path: string, token: string, body: unknown) => http(path, { method: "PATCH", token, body: JSON.stringify(body) });
const put = (path: string, token: string, body: unknown) => http(path, { method: "PUT", token, body: JSON.stringify(body) });
const ok = (res: { status: number }, what: string) => {
  if (res.status >= 300) throw new Error(`${what} -> HTTP ${res.status} ${JSON.stringify((res as any).body).slice(0, 200)}`);
  return res as any;
};

async function login(scope: "staff" | "customer", phone: string, password: string) {
  const res = await http<{ token: string; user: Json }>(`/api/${scope}/auth/login`, { method: "POST", body: JSON.stringify({ phone, password }) });
  if (res.status !== 200) throw new Error(`login ${phone} (${scope}) failed: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// ---------- time helpers ----------
const now = Date.now();
const tashkentDmy = (date: Date) => {
  const t = new Date(date.getTime() + 5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}${p(t.getUTCMonth() + 1)}${String(t.getUTCFullYear()).slice(2)}`;
};
const ymd = (date: Date) => new Date(date.getTime() + 5 * 3600_000).toISOString().slice(0, 10);

// ---------- scenarios ----------
type Scenario = "install" | "warrantyRepair" | "paidRepair" | "replace" | "rejected" | "cancelled" | "openNew" | "openWorking" | "openEstimate";
function pickScenario(rng: Rng): Scenario {
  const r = rng();
  const table: Array<[Scenario, number]> = [
    ["install", 0.33], ["warrantyRepair", 0.22], ["paidRepair", 0.19], ["replace", 0.04], ["rejected", 0.03], ["cancelled", 0.04], ["openNew", 0.05], ["openWorking", 0.06], ["openEstimate", 0.04],
  ];
  let acc = 0;
  for (const [name, p] of table) {
    acc += p;
    if (r < acc) return name;
  }
  return "install";
}

const PRICE: Record<string, [number, number]> = { "Air conditioners": [3_900_000, 8_900_000], Refrigerators: [4_800_000, 11_500_000], Televisions: [2_900_000, 9_800_000], "Washing machines": [3_200_000, 6_900_000] };
const ISSUE_KEY = (category: string) => (/air/i.test(category) ? "ac" : /refrig/i.test(category) ? "fridge" : /tele/i.test(category) ? "tv" : "washer");

type Ctx = {
  admin: string;
  desk: string;
  mobile: { id: string; token: string };
  shop: { id: string; token: string };
  products: Json[];
  services: Json[];
  centers: Json[];
};

async function uploadPhotos(token: string, jobId: string, category: string, rng: Rng, count: number) {
  for (let i = 0; i < count; i += 1) {
    const form = new FormData();
    form.append("photos", new Blob([new Uint8Array(demoImage(category, between(rng, 0, 7), i > 0 && chance(rng, 0.5)))], { type: "image/png" }), `photo-${i + 1}.png`);
    const res = await fetch(`${API}/api/staff/my-jobs/${jobId}/photos`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    if (res.status !== 201) throw new Error(`photo upload -> HTTP ${res.status}`);
    bump("photos");
  }
  // The demo checklists have required items; a technician ticks them before completing.
  const view = await http<Json>(`/api/staff/my-jobs/${jobId}`, { token });
  const required = (view.body.checklist?.completion?.items ?? []).filter((item: Json) => item.required).map((item: Json) => item.id);
  if (required.length > 0) await put(`/api/staff/my-jobs/${jobId}/checklist`, token, { kind: "completion", checked: required });
}

async function completeJob(token: string, jobId: string) {
  return ok(await post(`/api/staff/my-jobs/${jobId}/complete`, token), "complete");
}

type Outcome = { requestId: string; kind: "completed" | "open" | "cancelled" | "rejected"; lagMs: number; pickupLagMs: number; type: "installation" | "repair"; inShop: boolean; paid: boolean };

/** Runs one request through its scenario; returns what the timestamp shifter needs to know. */
async function runScenario(ctx: Ctx, scenario: Scenario, c: { id: string; token: string; address: string; lat: number; lng: number }, sale: Json, product: Json, rng: Rng, opts: { viaPortal: boolean; repeat?: boolean }): Promise<Outcome> {
  const category: string = product.category;
  const isInstall = scenario === "install";
  const inShop = !isInstall && chance(rng, scenario === "paidRepair" ? 1 : 0.55);
  const tech = inShop ? ctx.shop : ctx.mobile;
  const base: Json = {
    customerId: c.id,
    productId: product.id,
    saleId: sale.id,
    serialNumber: sale.serialNumber,
    autoAssign: false,
    allowDuplicate: true,
    type: isInstall ? "installation" : "repair",
    issueDescription: isInstall ? `${product.name} ni o‘rnatish` : pick(rng, ISSUES[ISSUE_KEY(category)]),
    locationType: inShop ? "in_shop" : "on_site",
    technicianTypeRequired: inShop ? "service_center" : "mobile",
    assignedTechnicianId: tech.id,
    ...(inShop ? { serviceCenterId: pick(rng, ctx.centers).id } : { customerLocation: { address: c.address, lat: c.lat, lng: c.lng } }),
    ...(isInstall ? {} : { defectType: chance(rng, 0.2) ? "dead_on_arrival" : "failed_during_use" }),
  };
  // A quarter of the requests are sent by the customer from the portal; the office then assigns a technician.
  let requestId = "";
  if (opts.viaPortal) {
    const portal = await post("/api/customer/requests", c.token, {
      type: base.type,
      saleId: sale.id,
      productId: product.id,
      serialNumber: sale.serialNumber,
      issueDescription: base.issueDescription,
      locationType: base.locationType,
      ...(inShop ? { serviceCenterId: base.serviceCenterId } : { customerLocation: base.customerLocation, address: c.address }),
      ...(isInstall ? {} : { defectType: base.defectType }),
    });
    if (portal.status === 201) {
      requestId = (portal.body as Json).request.id;
      ok(await patch(`/api/staff/requests/${requestId}`, ctx.admin, { assignedTechnicianId: tech.id }), "assign portal request");
      bump("viaPortal");
    }
  }
  if (!requestId) requestId = ok(await post("/api/staff/requests", ctx.admin, base), "create request").body.request.id;
  bump(`req:${scenario}`);

  const out = (o: Partial<Outcome>): Outcome => ({ requestId, kind: "completed", lagMs: 0, pickupLagMs: 0, type: base.type, inShop, paid: false, ...o });
  const move = (column: string, extra: Json = {}) => patch(`/api/staff/my-jobs/${requestId}`, tech.token, { column, ...extra });
  const serviceFor = () => ctx.services.find((s) => s.productCategories.includes(category)) ?? ctx.services[0];
  const addService = async () => {
    const svc = serviceFor();
    if (svc) ok(await post(`/api/staff/my-jobs/${requestId}/service-lines`, tech.token, { serviceCatalogItemId: svc.id }), "service line");
  };
  const diagnose = async () => {
    const view = await http<Json>(`/api/staff/my-jobs/${requestId}`, { token: tech.token });
    const code = view.body.defectCodes?.length ? pick(rng, view.body.defectCodes as Json[]) : null;
    if (code) await put(`/api/staff/my-jobs/${requestId}/diagnosis`, tech.token, { defectCodeId: code.id });
  };

  if (scenario === "cancelled") {
    ok(await patch(`/api/staff/requests/${requestId}`, ctx.admin, { status: "cancelled" }), "cancel");
    return out({ kind: "cancelled", lagMs: between(rng, 2, 40) * 3600_000 });
  }
  if (scenario === "rejected") {
    await move("in_progress");
    ok(await post(`/api/staff/requests/${requestId}/decision`, ctx.admin, { decision: "reject", rejectionReason: pick(rng, REJECT_REASONS) }), "reject");
    return out({ kind: "rejected", lagMs: between(rng, 20, 70) * 3600_000 });
  }
  if (scenario === "replace") {
    ok(await post(`/api/staff/requests/${requestId}/decision`, ctx.admin, { decision: "replace", replacement: { productId: product.id, serialNumber: `DEMO-NEW-${sale.serialNumber}` } }), "replace");
    return out({ lagMs: between(rng, 30, 90) * 3600_000 });
  }
  if (scenario === "openNew") return out({ kind: "open" });
  if (scenario === "openWorking") {
    await move("in_progress");
    if (!isInstall) {
      await diagnose();
      ok(await post(`/api/staff/requests/${requestId}/decision`, ctx.admin, { decision: "warranty_repair" }), "decision");
    }
    return out({ kind: "open" });
  }
  if (scenario === "openEstimate") {
    await move("in_progress");
    await diagnose();
    ok(await post(`/api/staff/my-jobs/${requestId}/estimates`, tech.token, { send: true, lines: [{ kind: "service", serviceCatalogItemId: serviceFor().id }, { kind: "labor", name: "Ish haqi", unitPrice: between(rng, 3, 9) * 10_000 }] }), "estimate");
    return out({ kind: "open" });
  }

  if (isInstall) {
    await move("in_progress");
    await addService();
    await uploadPhotos(tech.token, requestId, category, rng, between(rng, 2, 3));
    await completeJob(tech.token, requestId);
    return out({ lagMs: between(rng, 3, 30) * 3600_000 });
  }

  if (scenario === "warrantyRepair") {
    await move("in_progress");
    await diagnose();
    // A callback inside the repair warranty is recognised by the server and already decided as a free warranty repair.
    if (opts.repeat) await move("in_progress");
    else ok(await post(`/api/staff/requests/${requestId}/decision`, ctx.admin, { decision: "warranty_repair" }), "decision");
    await addService();
    await uploadPhotos(tech.token, requestId, category, rng, between(rng, 2, 3));
    await completeJob(tech.token, requestId);
    if (inShop && chance(rng, 0.88)) {
      ok(await post(`/api/customer/requests/${requestId}/pickup`, c.token, {}), "pickup");
      return out({ lagMs: between(rng, 30, 120) * 3600_000, pickupLagMs: between(rng, 2, 60) * 3600_000 });
    }
    return out({ lagMs: (inShop ? between(rng, 30, 120) : between(rng, 3, 30)) * 3600_000 });
  }

  // paid repair: estimate -> the customer approves -> repair -> payment -> pickup
  await move("in_progress");
  await diagnose();
  const svc = serviceFor();
  ok(await post(`/api/staff/my-jobs/${requestId}/estimates`, tech.token, { send: true, lines: [{ kind: "service", serviceCatalogItemId: svc.id }, { kind: "labor", name: "Ish haqi", unitPrice: between(rng, 6, 28) * 10_000 }] }), "estimate");
  const detail = await http<Json>(`/api/customer/requests/${requestId}`, { token: c.token });
  const estimate = detail.body.request?.estimate;
  ok(await post(`/api/customer/requests/${requestId}/estimates/${estimate.id}/approve`, c.token, { selectedOptionalLineIds: [] }), "approve estimate");
  await uploadPhotos(tech.token, requestId, category, rng, between(rng, 2, 3));
  const done = await completeJob(tech.token, requestId);
  const total: number = done.body.job.finalCost ?? 0;
  const roll = rng();
  let paid = false;
  if (total > 0 && roll < 0.72) {
    const method = pick(rng, ["cash", "cash", "card", "click", "payme"]);
    ok(await post(`/api/staff/requests/${requestId}/payments`, ctx.desk, { amount: total, method, ...(method === "cash" ? {} : {}) }), "payment");
    paid = true;
  } else if (total > 0 && roll < 0.88) {
    ok(await post(`/api/staff/requests/${requestId}/payments`, ctx.desk, { amount: Math.floor(total / 2 / 1000) * 1000 || 1000, method: "cash" }), "partial payment");
  }
  if (paid) {
    ok(await post(`/api/customer/requests/${requestId}/pickup`, c.token, {}), "pickup");
    return out({ lagMs: between(rng, 40, 130) * 3600_000, pickupLagMs: between(rng, 3, 50) * 3600_000, paid: true });
  }
  return out({ lagMs: between(rng, 40, 130) * 3600_000 });
}

// ---------- moving timestamps into the past ----------
const tableColumns = new Map<string, { name: string; kind: "ts" | "date" }[]>();
async function columnsOf(table: string) {
  let cols = tableColumns.get(table);
  if (!cols) {
    const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
      `select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 and (data_type like 'timestamp%' or data_type = 'date')`,
      table,
    );
    cols = rows.map((row) => ({ name: row.column_name, kind: row.data_type === "date" ? ("date" as const) : ("ts" as const) }));
    tableColumns.set(table, cols);
  }
  return cols;
}
async function shiftTable(table: string, keyColumn: string, id: string, ms: number) {
  const cols = await columnsOf(table);
  if (cols.length === 0) return;
  const sets = cols.map((c) => (c.kind === "date" ? `"${c.name}" = ("${c.name}" - ($1 * interval '1 millisecond'))::date` : `"${c.name}" = "${c.name}" - ($1 * interval '1 millisecond')`)).join(", ");
  await prisma.$executeRawUnsafe(`update "${table}" set ${sets} where "${keyColumn}" = $2`, ms, id);
}
let requestChildTables: string[] | null = null;
async function childTables() {
  if (!requestChildTables) {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `select table_name from information_schema.columns where table_schema = 'public' and column_name = 'service_request_id' and table_name not in ('notifications')`,
    );
    requestChildTables = rows.map((row) => row.table_name);
  }
  return requestChildTables;
}
const dayCounters = new Map<string, number>();

async function backdate(o: Outcome, t0: Date, saleId: string, customerId: string, saleDate: string) {
  const row = (await prisma.$queryRawUnsafe<Array<{ created_at: Date; display_id: string }>>(`select created_at, display_id from service_requests where id = $1`, o.requestId))[0];
  const shiftMs = row.created_at.getTime() - t0.getTime();
  // Noise (notifications, send log) would mention the old numbers: drop it for demo rows.
  await prisma.$executeRawUnsafe(`delete from notifications where service_request_id = $1`, o.requestId);
  await prisma.$executeRawUnsafe(`delete from outbound_messages where entity_id = $1`, o.requestId);
  await shiftTable("service_requests", "id", o.requestId, shiftMs);
  for (const table of await childTables()) await shiftTable(table, "service_request_id", o.requestId, shiftMs);
  await shiftTable("audit_logs", "entity_id", o.requestId, shiftMs);

  // The finishing phase: completion, pickup, payments, photos and the rating come after a realistic lag.
  // Nothing may end up in the future: a recent request keeps only the lag that still fits before now.
  const maxLag = Math.max(0, now - t0.getTime() - o.pickupLagMs * 1.5 - 3 * 3600_000);
  const lag = Math.min(o.lagMs, maxLag);
  if (o.kind === "completed" || o.kind === "rejected" || o.kind === "cancelled") {
    await prisma.$executeRawUnsafe(
      `update service_requests set
         completed_at = case when completed_at is not null then created_at + ($2 * interval '1 millisecond') else completed_at end,
         picked_up_at = case when picked_up_at is not null then created_at + (($2 + $3) * interval '1 millisecond') else picked_up_at end,
         status_changed_at = created_at + (($2 + $3) * interval '1 millisecond'),
         legal_due_at = created_at + interval '20 days',
         repair_warranty_until = case when repair_warranty_until is not null then (created_at + (($2 + $3) * interval '1 millisecond') + interval '30 days')::date else null end
       where id = $1`,
      o.requestId, lag, o.pickupLagMs,
    );
    await prisma.$executeRawUnsafe(`update request_photos set created_at = greatest((select created_at from service_requests where id = $1) + ($2 * interval '1 millisecond') - interval '40 minutes', (select created_at from service_requests where id = $1) + interval '5 minutes') where service_request_id = $1`, o.requestId, lag);
    await prisma.$executeRawUnsafe(`update payments set created_at = least((select created_at from service_requests where id = $1) + (($2 + $3 * 0.5) * interval '1 millisecond'), now() - interval '20 minutes') where service_request_id = $1`, o.requestId, lag, o.pickupLagMs);
    await prisma.$executeRawUnsafe(`update estimates set sent_at = (select created_at from service_requests where id = $1) + interval '3 hours', approved_at = case when approved_at is not null then (select created_at from service_requests where id = $1) + interval '6 hours' else null end, valid_until = (select created_at from service_requests where id = $1) + interval '10 days' where service_request_id = $1`, o.requestId);
    await prisma.$executeRawUnsafe(`update feedback set created_at = least((select coalesce(picked_up_at, completed_at, status_changed_at) from service_requests where id = $1) + ((6 + floor(random() * 40)) * interval '1 hour'), now() - interval '30 minutes') where service_request_id = $1`, o.requestId);
  }
  // Status changes happened seconds apart while loading; spread the request's history over its real life so the timeline and
  // the "time in each status" figures look like a working service.
  await prisma.$executeRawUnsafe(
    `with ranked as (
       select id, row_number() over (order by created_at, id) as rn, count(*) over () as n from audit_logs where entity_id = $1
     ), bounds as (
       select created_at as start, greatest(coalesce(completed_at, status_changed_at), created_at + interval '30 minutes') as stop from service_requests where id = $1
     )
     update audit_logs a set created_at = least(b.start + ((r.rn - 1)::float / greatest(r.n - 1, 1)) * (b.stop - b.start), now() - interval '10 minutes')
       from ranked r, bounds b where a.id = r.id`,
    o.requestId,
  );
  // A readable number that matches the date, e.g. 120626 + region + sequence.
  const prefix = tashkentDmy(t0);
  const seq = (dayCounters.get(prefix) ?? 5000) + 1;
  dayCounters.set(prefix, seq);
  await prisma.$executeRawUnsafe(`update service_requests set display_id = $2 where id = $1`, o.requestId, `${prefix}${row.display_id.slice(6, 8)}${String(seq).padStart(4, "0")}`);
  // The sale and the customer carry their own dates.
  await prisma.$executeRawUnsafe(`update sales set created_at = $2::date + interval '9 hours' where id = $1`, saleId, saleDate);
  if (o.type === "installation" && o.kind === "completed") {
    await prisma.$executeRawUnsafe(
      `update sales set installation_date = (select completed_at from service_requests where id = $2)::date, warranty_expiry = ((select completed_at from service_requests where id = $2)::date + (warranty_months || ' months')::interval)::date where id = $1`,
      saleId, o.requestId,
    );
  }
  await prisma.$executeRawUnsafe(`update customers set created_at = least(created_at, $2::date + interval '10 hours') where id = $1`, customerId, saleDate);
}

// ---------- the main loop ----------
async function seedProducts(admin: string) {
  const extra: Array<[string, string, string, number]> = [
    ["RIZO Cool 18 Inverter", "DEMO-AC-18", "Air conditioners", 12], ["RIZO Cool 24", "DEMO-AC-24", "Air conditioners", 12],
    ["RIZO Frost 320 NoFrost", "DEMO-REF-320", "Refrigerators", 24], ["RIZO Frost 190", "DEMO-REF-190", "Refrigerators", 12],
    ["RIZO Vision 55 4K", "DEMO-TV-55", "Televisions", 24], ["RIZO Vision 32", "DEMO-TV-32", "Televisions", 12],
    ["RIZO Wash 8 kg", "DEMO-WM-8", "Washing machines", 24], ["RIZO Wash 6 kg", "DEMO-WM-6", "Washing machines", 12],
  ];
  for (const [name, sku, category, months] of extra) {
    const res = await post("/api/staff/products", admin, { name, nameUz: name, nameRu: name, nameEn: name, sku, category, warrantyMonths: months, warrantyStartsOn: "installation" });
    if (res.status === 201) bump("products");
  }
}

async function customerFlow(index: number, ctx: Ctx) {
  const rng = mulberry32(20261008 + index * 7919);
  const name = fullName(rng);
  const phone = `998${pick(rng, OPERATORS)}${String(between(rng, 1_000_000, 9_999_999))}`;
  const where = place(rng);
  const created = await post("/api/staff/customers", ctx.admin, { name, phone, address: where.address, regionCode: where.region, notes: MARK, password: CUSTOMER_PASSWORD });
  if (created.status === 409) {
    bump("skipped (already there)");
    return;
  }
  const customer = ok(created, "create customer").body.customer;
  const session = await login("customer", phone, CUSTOMER_PASSWORD);
  const c = { id: customer.id as string, token: session.token, address: where.address, lat: where.lat, lng: where.lng };

  const scenario = pickScenario(rng);
  const isOpen = scenario.startsWith("open");
  const daysAgo = isOpen ? between(rng, 0, 5) : Math.floor(Math.pow(rng(), 1.25) * 148) + 2;
  const t0 = new Date(now - daysAgo * DAY - between(rng, 0, 20) * 3600_000);
  const product = pick(rng, ctx.products);
  const months: number = product.warrantyMonths ?? 12;
  // The server checks the warranty as of today, so a sale that must be "in warranty" is dated so that the warranty still runs now
  // (the request itself is moved into the past later). A paid repair needs a warranty that is over, then and now.
  const saleAgo =
    scenario === "install" ? between(rng, 1, 6)
    : scenario === "paidRepair" ? months * 30 + between(rng, 45, 260)
    : between(rng, 3, Math.max(3, months * 30 - 15 - daysAgo));
  const saleDate = ymd(new Date(t0.getTime() - saleAgo * DAY));
  const [low, high] = PRICE[product.category] ?? [3_000_000, 8_000_000];
  const serial = `DM-${String(index + 1).padStart(4, "0")}-${between(rng, 10000, 99999)}`;
  const saleRes = ok(await post("/api/staff/sales", ctx.admin, { customerId: c.id, productId: product.id, quantity: 1, saleDate, pricePaid: Math.round(between(rng, low, high) / 10_000) * 10_000, serialNumber: serial }), "create sale");
  const sale = { ...saleRes.body.sale, serialNumber: serial };
  bump("sales");

  const outcomes: Array<{ outcome: Outcome; t0: Date }> = [];
  let first: Outcome;
  try {
    first = await runScenario(ctx, scenario, c, sale, product, rng, { viaPortal: chance(rng, 0.25) });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : error} [scenario ${scenario}, product ${product.sku}, sold ${saleDate}, request ${daysAgo} days ago]`);
  }
  outcomes.push({ outcome: first, t0 });

  // About one customer in nine came back with the same device inside the repair warranty (a "callback").
  if (first.kind === "completed" && first.type === "repair" && chance(rng, 0.11)) {
    const t1 = new Date(t0.getTime() + first.lagMs + first.pickupLagMs + between(rng, 8, 25) * DAY);
    if (t1.getTime() < now - 2 * DAY) {
      const again = await runScenario(ctx, "warrantyRepair", c, sale, product, rng, { viaPortal: false, repeat: true });
      outcomes.push({ outcome: again, t0: t1 });
      bump("callbacks");
    }
  }

  // The customer's rating after a finished job (most customers rate; a few leave nothing).
  for (const { outcome } of outcomes) {
    const done = await http<Json>(`/api/customer/requests/${outcome.requestId}`, { token: c.token });
    if (done.body.request?.canFeedback && chance(rng, 0.88)) {
      const stars = rating(rng);
      const tags = [...new Set(Array.from({ length: stars >= 4 ? between(rng, 0, 2) : between(rng, 1, 2) }, () => pick(rng, stars >= 4 ? HIGH_TAGS : LOW_TAGS)))];
      const comment = pick(rng, COMMENTS[stars]);
      const res = await post(`/api/customer/requests/${outcome.requestId}/feedback`, c.token, { rating: stars, comment: comment || undefined, tags });
      if (res.status === 201) bump(`rating:${stars}`);
    }
  }
  for (const { outcome, t0: when } of outcomes) await backdate(outcome, when, sale.id, c.id, saleDate);
  bump("customers");
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(dbUrl.replace(/^postgres(ql)?:/, "http:")).hostname;
    } catch {
      return "";
    }
  })();
  const local = ["localhost", "127.0.0.1", "::1", ""].includes(host) && /localhost|127\.0\.0\.1/.test(API);
  console.log(`API ${API}\nDatabase host: ${host || "(none)"}\nCustomers to create: ${COUNT}`);
  if (!dbUrl) throw new Error("DATABASE_URL is required (the timestamps are moved with SQL)");
  if (!local && process.env.DEMO_CONFIRM !== "yes") {
    throw new Error("This is not a local database: it would receive ~" + COUNT + " demo customers. Run again with DEMO_CONFIRM=yes if that is what you want.");
  }
  const started = Date.now();
  const admin = (await login("staff", ADMIN_PHONE, ADMIN_PASSWORD)).token;
  const desk = (await login("staff", DESK_PHONE, DESK_PASSWORD)).token;
  const techSessions = await Promise.all(TECH_LOGINS.map(([phone, password]) => login("staff", phone, password)));
  const techs = (await http<{ technicians: Json[] }>("/api/staff/technicians", { token: admin })).body.technicians;
  const byId = new Map(techSessions.map((s) => [s.user.id as string, s.token as string]));
  const mobile = techs.find((t) => t.technicianType === "mobile" && byId.has(t.id));
  const shop = techs.find((t) => t.technicianType === "service_center" && byId.has(t.id));
  if (!mobile || !shop) throw new Error("Need one mobile and one service-centre technician login (DEMO_TECHS)");

  await seedProducts(admin);
  const products = (await http<{ products: Json[] }>("/api/staff/products", { token: admin })).body.products;
  const services = (await http<{ services: Json[] }>("/api/staff/catalog/services", { token: admin })).body.services;
  const centers = (await http<{ centers: Json[] }>("/api/staff/service-centers", { token: admin })).body.centers;
  const ctx: Ctx = { admin, desk, mobile: { id: mobile.id, token: byId.get(mobile.id)! }, shop: { id: shop.id, token: byId.get(shop.id)! }, products, services, centers };

  let next = 0;
  let failures = 0;
  const worker = async () => {
    while (next < COUNT) {
      const i = next++;
      try {
        await customerFlow(i, ctx);
      } catch (error) {
        failures += 1;
        console.error(`customer #${i + 1}: ${error instanceof Error ? error.message : error}`);
      }
      if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${COUNT} done (${Math.round((Date.now() - started) / 1000)} s)`);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));

  console.log("\nDone in " + Math.round((Date.now() - started) / 1000) + " s. Created:");
  for (const key of Object.keys(stats).sort()) console.log(`  ${key.padEnd(24)} ${stats[key]}`);
  if (failures) console.log(`  (${failures} customer(s) failed; run again to fill the gaps: finished ones are skipped)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
