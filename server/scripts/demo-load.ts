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
 *   DEMO_QUIET_PUSH           yes/no. While loading, the registered phones' push tokens are set aside (and restored afterwards) so
 *                             they are not flooded with hundreds of notifications. Default: yes for a remote database.
 *   DEMO_QUIET_WAIT           seconds to wait after the load before the tokens come back (the overdue check runs every minute
 *                             and alerts about the open demo requests); default 200
 *
 * Everything it creates is marked (customers carry the note DEMO-DATA, products the SKU prefix DEMO-);
 * `npm run demo:clean -w server` removes it again.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { between, chance, COMMENTS, fullName, HIGH_TAGS, ISSUES, LOW_TAGS, mulberry32, OPERATORS, pick, place, rating, REJECT_REASONS, type Rng, DEMO_CENTERS } from "./demo/data.js";
import { demoImage } from "./demo/images.js";

const API = (process.env.API ?? "http://localhost:4100").replace(/\/+$/, "");
const COUNT = Number(process.env.DEMO_COUNT ?? 150);
const [ADMIN_PHONE, ADMIN_PASSWORD] = (process.env.DEMO_ADMIN ?? "998900000001:admin123").split(":");
const [DESK_PHONE, DESK_PASSWORD] = (process.env.DEMO_DESK ?? "998900000005:desk123").split(":");
const TECH_LOGINS = (process.env.DEMO_TECHS ?? "998900000002:tech123,998900000004:tech123").split(",").map((pair) => pair.split(":"));
const CUSTOMER_PASSWORD = "Demo12345";
const MARK = "DEMO-DATA";
const DAY = 86_400_000;
// Neon's pooled address (…-pooler…) needs Prisma told so; the direct address needs nothing.
const dbUrl = (() => {
  const url = process.env.DATABASE_URL ?? "";
  return /-pooler/.test(url) && !/pgbouncer=/.test(url) ? `${url}${url.includes("?") ? "&" : "?"}pgbouncer=true` : url;
})();
const prisma = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined);

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
      if ([429, 502, 503, 504].includes(res.status) && attempt < 3) {
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
type Scenario = "install" | "warrantyRepair" | "warrantyExtras" | "paidRepair" | "replace" | "refund" | "rejected" | "cancelled" | "openNew" | "openDiagnosing" | "openWorking" | "openEstimate" | "openParts" | "openPaused";
function pickScenario(rng: Rng): Scenario {
  const r = rng();
  // Every status of the filter list gets several examples out of 150 customers.
  const table: Array<[Scenario, number]> = [
    ["install", 0.26], ["warrantyRepair", 0.17], ["warrantyExtras", 0.07], ["paidRepair", 0.15], ["replace", 0.05], ["refund", 0.04], ["rejected", 0.04], ["cancelled", 0.04],
    ["openNew", 0.03], ["openDiagnosing", 0.03], ["openEstimate", 0.03], ["openParts", 0.03], ["openPaused", 0.03], ["openWorking", 0.03],
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
  parts: Json[];
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
    ...(inShop ? { serviceCenterId: pick(rng, ctx.centers)?.id } : { customerLocation: { address: c.address, lat: c.lat, lng: c.lng } }),
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
    // Half of the customers collect the new unit (picked up), the rest still have it waiting (replaced).
    if (inShop && chance(rng, 0.5)) {
      const pickup = await post(`/api/customer/requests/${requestId}/pickup`, c.token, {});
      if (pickup.status < 300) return out({ lagMs: between(rng, 30, 90) * 3600_000, pickupLagMs: between(rng, 2, 40) * 3600_000 });
    }
    return out({ lagMs: between(rng, 30, 90) * 3600_000 });
  }
  if (scenario === "refund") {
    await move("in_progress");
    await diagnose();
    const amount = Math.round(Number(sale.pricePaid ?? 0));
    ok(await post(`/api/staff/requests/${requestId}/decision`, ctx.admin, { decision: "refund", refundMethod: pick(rng, ["cash", "card", "transfer"]), ...(amount > 0 ? { refundAmount: amount } : {}), note: pick(rng, ["Mijoz pulni qaytarishni so‘radi", "Ta’mirlab bo‘lmadi, to‘liq qaytarildi", "Qurilma tanlovi mos kelmadi"]) }), "refund");
    return out({ lagMs: between(rng, 30, 100) * 3600_000 });
  }
  if (scenario === "openNew") return out({ kind: "open" });
  if (scenario === "openDiagnosing") {
    await move("in_progress");
    ok(await patch(`/api/staff/my-jobs/${requestId}`, tech.token, { status: "diagnosing" }), "diagnosing");
    return out({ kind: "open" });
  }
  if (scenario === "openParts") {
    await move("in_progress");
    await diagnose();
    // The technician asks for a part (the job moves to Awaiting parts); the office then orders it, late, or not at all.
    const fitting = ctx.parts.filter((part) => (part.productCategories ?? []).includes(product.category));
    if (fitting.length === 0) {
      ok(await patch(`/api/staff/my-jobs/${requestId}`, tech.token, { status: "awaiting_parts" }), "awaiting parts");
      return out({ kind: "open" });
    }
    const part = pick(rng, fitting);
    ok(await post(`/api/staff/my-jobs/${requestId}/part-orders`, tech.token, { sparePartId: part.id, quantity: between(rng, 1, 2), note: MARK }), "part order");
    bump("part orders (for jobs)");
    const order = await prisma.partOrder.findFirst({ where: { serviceRequestId: requestId }, orderBy: { createdAt: "desc" } });
    const roll = rng();
    if (order && roll < 0.55) {
      const offset = between(rng, -4, 6);
      const date = ymd(new Date(now + offset * DAY));
      ok(await patch(`/api/staff/part-orders/${order.id}`, ctx.admin, { status: "ordered", expectedAt: date }), "part ordered");
    } else if (order && roll < 0.8) {
      // stays "requested": asked for, not yet placed with a supplier
    } else if (order && roll < 0.92) {
      ok(await patch(`/api/staff/part-orders/${order.id}`, ctx.admin, { status: "cancelled" }), "part order cancelled");
    }
    return out({ kind: "open" });
  }
  if (scenario === "openPaused") {
    await move("in_progress");
    ok(await patch(`/api/staff/my-jobs/${requestId}`, tech.token, { status: "paused", pauseReason: pick(rng, ["Mijoz uyda yo‘q", "Ehtiyot qism kutilmoqda", "Mijoz boshqa kunga so‘radi"]), pauseHours: 336 }), "pause");
    return out({ kind: "open" });
  }
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

  if (scenario === "warrantyRepair" || scenario === "warrantyExtras") {
    await move("in_progress");
    await diagnose();
    // A callback inside the repair warranty is recognised by the server and already decided as a free warranty repair.
    if (opts.repeat) await move("in_progress");
    else ok(await post(`/api/staff/requests/${requestId}/decision`, ctx.admin, { decision: "warranty_repair" }), "decision");
    await addService();
    // Under warranty the repair is free, but extras (a second service, delivery, a cable…) are still charged.
    let extrasTotal = 0;
    if (scenario === "warrantyExtras") {
      const second = ctx.services.filter((svc) => svc.productCategories.includes(category))[1] ?? ctx.services[1];
      if (second) await post(`/api/staff/my-jobs/${requestId}/service-lines`, tech.token, { serviceCatalogItemId: second.id });
      const price = between(rng, 3, 15) * 10_000;
      ok(await post(`/api/staff/my-jobs/${requestId}/extra-expenses`, tech.token, { description: pick(rng, ["Kabel almashtirish", "Qo‘shimcha mahkamlash to‘plami", "Yetkazib berish", "Drenaj shlangi", "Tozalash xizmati"]), price }), "extra expense");
      extrasTotal = price;
    }
    await uploadPhotos(tech.token, requestId, category, rng, between(rng, 2, 3));
    const done = await completeJob(tech.token, requestId);
    const due: number = done.body.job.finalCost ?? extrasTotal;
    let paidExtras = false;
    if (scenario === "warrantyExtras" && due > 0 && chance(rng, 0.7)) {
      ok(await post(`/api/staff/requests/${requestId}/payments`, ctx.desk, { amount: due, method: pick(rng, ["cash", "card", "click"]) }), "extras payment");
      paidExtras = true;
    }
    const mayPickUp = scenario === "warrantyRepair" || paidExtras || due === 0;
    if (inShop && mayPickUp && chance(rng, 0.88)) {
      ok(await post(`/api/customer/requests/${requestId}/pickup`, c.token, {}), "pickup");
      return out({ lagMs: between(rng, 30, 120) * 3600_000, pickupLagMs: between(rng, 2, 60) * 3600_000, paid: paidExtras });
    }
    return out({ lagMs: (inShop ? between(rng, 30, 120) : between(rng, 3, 30)) * 3600_000, paid: paidExtras });
  }

  // paid repair: estimate -> the customer approves -> repair -> payment -> pickup
  await move("in_progress");
  await diagnose();
  const svc = serviceFor();
  ok(await post(`/api/staff/my-jobs/${requestId}/estimates`, tech.token, { send: true, lines: [{ kind: "service", serviceCatalogItemId: svc.id }, { kind: "labor", name: "Ish haqi", unitPrice: between(rng, 6, 28) * 10_000 }] }), "estimate");
  const detail = await http<Json>(`/api/customer/requests/${requestId}`, { token: c.token });
  const estimate = detail.body.request?.estimate;
  ok(await post(`/api/customer/requests/${requestId}/estimates/${estimate.id}/approve`, c.token, { selectedOptionalLineIds: [] }), "approve estimate");
  if (chance(rng, 0.35)) {
    const another = ctx.services.filter((item) => item.id !== svc.id && item.productCategories.includes(category))[0];
    if (another) await post(`/api/staff/my-jobs/${requestId}/service-lines`, tech.token, { serviceCatalogItemId: another.id });
    await post(`/api/staff/my-jobs/${requestId}/extra-expenses`, tech.token, { description: pick(rng, ["Yetkazib berish", "Kabel almashtirish", "Qo‘shimcha materiallar"]), price: between(rng, 2, 12) * 10_000 });
  }
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

// ---------- suppliers and spare parts ----------
const DEMO_SUPPLIERS = [
  { name: "Texno Ehtiyot Qism", phone: "998712000101", telegram: "@texnoqism", leadTimeDays: 3 },
  { name: "Muzlatkich Servis Snab", phone: "998712000102", telegram: null, leadTimeDays: 7, note: "Kompressorlar va sovutish qismlari" },
  { name: "Maishiy Texnika Ltd", phone: "998712000103", telegram: "@maishiytexnika", leadTimeDays: 5 },
];
const DEMO_PARTS: Array<[string, string, string, number, number, number, number]> = [
  // name, name (uz), category, price, cost, stock, minimum
  ["DEMO Compressor 1/4 HP", "DEMO Kompressor 1/4 HP", "Refrigerators", 650_000, 430_000, 1, 2],
  ["DEMO TV mainboard", "DEMO TV boshqaruv platasi", "Televisions", 380_000, 250_000, 0, 2],
  ["DEMO Washer bearing set", "DEMO Podshipnik to‘plami", "Washing machines", 120_000, 75_000, 2, 4],
  ["DEMO AC fan motor", "DEMO Konditsioner motori", "Air conditioners", 290_000, 190_000, 3, 3],
];

/** Three suppliers (noted DEMO-DATA), the seed parts get one each, and a few low-stock demo parts show the recommendations. */
async function seedSuppliersAndParts(admin: string) {
  const have = (await http<{ suppliers: Json[] }>("/api/staff/suppliers", { token: admin })).body.suppliers ?? [];
  const suppliers: Json[] = [];
  for (const wanted of DEMO_SUPPLIERS) {
    let row = have.find((item) => item.name === wanted.name);
    if (!row) {
      const created = await post("/api/staff/suppliers", admin, { ...wanted, note: wanted.note ?? MARK });
      if (created.status === 201) {
        row = created.body.supplier;
        bump("suppliers");
      }
    }
    if (row) suppliers.push(row);
  }
  if (suppliers.length === 0) return;
  // Mark the suppliers for the cleaner: their note starts with the marker.
  await prisma.$executeRawUnsafe(`update suppliers set note = $1 || coalesce(' ' || nullif(note, $1), '') where name = any($2::text[]) and (note is null or note not like $1 || '%')`, MARK, DEMO_SUPPLIERS.map((item) => item.name));
  const existing = (await http<{ parts: Json[] }>("/api/staff/catalog/parts", { token: admin })).body.parts ?? [];
  const bySeed = (name: string) => existing.find((part) => part.name === name);
  const link: Array<[string, number]> = [["Door gasket", 0], ["Thermostat", 1], ["Drain pump", 2], ["Inlet valve", 2], ["Capacitor", 0], ["Remote control", 0]];
  for (const [name, index] of link) {
    const part = bySeed(name);
    if (part && !part.supplierId) await patch(`/api/staff/catalog/parts/${part.id}`, admin, { supplierId: suppliers[index % suppliers.length].id });
  }
  for (const [index, [name, nameUz, category, price, costPrice, stockQuantity, lowStockThreshold]] of DEMO_PARTS.entries()) {
    if (existing.some((part) => part.name === name)) continue;
    const created = await post("/api/staff/catalog/parts", admin, {
      name, nameUz, nameRu: name, nameEn: name, price, costPrice, productCategories: [category], stockQuantity, lowStockThreshold, supplierId: suppliers[index % suppliers.length].id,
    });
    if (created.status === 201) bump("spare parts");
  }
}

/** A few orders that are not for a job: one arrives late, one is on its way. */
async function seedStockOrders(admin: string) {
  if ((await prisma.partOrder.count({ where: { note: MARK, serviceRequestId: null } })) > 0) return;
  const parts = (await http<{ parts: Json[] }>("/api/staff/catalog/parts", { token: admin })).body.parts ?? [];
  const demo = parts.filter((part) => String(part.name).startsWith("DEMO "));
  const planned: Array<[Json | undefined, number, number]> = [[demo[2], 6, -2], [demo[3], 4, 3]];
  for (const [part, quantity, offset] of planned) {
    if (!part) continue;
    const created = await post("/api/staff/part-orders", admin, { sparePartId: part.id, quantity, expectedAt: ymd(new Date(now + offset * DAY)), note: MARK });
    if (created.status === 201) {
      await patch(`/api/staff/part-orders/${created.body.order.id}`, admin, { status: "ordered" });
      bump("part orders (stock)");
    }
  }
}


// ---------- warehouses ----------
// Regional warehouses and the stock rooms of two branches (all noted DEMO-DATA), a keeper for three of them, and shelves filled
// from the parts catalogue. Idempotent: what exists is kept.
const DEMO_WAREHOUSES: Array<{ name: string; kind: "regional" | "branch"; regionCode: string; address: string; leadDaysSameRegion: number; leadDaysOtherRegion: number; centre?: string; keeper?: [string, string]; min: number }> = [
  { name: "Toshkent viloyati ombori", kind: "regional", regionCode: "10", address: "Toshkent viloyati, Chirchiq shahri, Sanoat ko‘chasi 3", leadDaysSameRegion: 1, leadDaysOtherRegion: 2, min: 2 },
  { name: "Samarqand hududiy ombori", kind: "regional", regionCode: "30", address: "Samarqand shahri, Mirzo Ulug‘bek ko‘chasi 88", leadDaysSameRegion: 1, leadDaysOtherRegion: 3, keeper: ["DEMO Samarqand omborchisi", "998900100001"], min: 2 },
  { name: "Farg‘ona vodiysi ombori", kind: "regional", regionCode: "40", address: "Farg‘ona shahri, Sanoat zonasi 5", leadDaysSameRegion: 1, leadDaysOtherRegion: 3, min: 2 },
  { name: "Buxoro hududiy ombori", kind: "regional", regionCode: "80", address: "Buxoro shahri, Navoiy ko‘chasi 61", leadDaysSameRegion: 1, leadDaysOtherRegion: 3, min: 1 },
  { name: "Qashqadaryo hududiy ombori", kind: "regional", regionCode: "70", address: "Qarshi shahri, Mustaqillik ko‘chasi 120", leadDaysSameRegion: 1, leadDaysOtherRegion: 3, min: 1 },
  { name: "Xorazm hududiy ombori", kind: "regional", regionCode: "90", address: "Urganch shahri, Al-Xorazmiy ko‘chasi 90", leadDaysSameRegion: 2, leadDaysOtherRegion: 4, keeper: ["DEMO Xorazm omborchisi", "998900100002"], min: 1 },
  { name: "Chilonzor filial ombori", kind: "branch", regionCode: "01", address: "Toshkent, Chilonzor, Bunyodkor ko‘chasi 9", leadDaysSameRegion: 0, leadDaysOtherRegion: 2, centre: "RIZO Service — Chilonzor", keeper: ["DEMO Chilonzor omborchisi", "998900100003"], min: 1 },
  { name: "Yunusobod filial ombori", kind: "branch", regionCode: "01", address: "Toshkent, Yunusobod, Amir Temur shoh ko‘chasi 108", leadDaysSameRegion: 0, leadDaysOtherRegion: 2, centre: "RIZO Service — Yunusobod", min: 1 },
];

async function seedWarehouses(admin: string, centers: Json[], parts: Json[]) {
  const have = (await http<{ warehouses: Json[] }>("/api/staff/warehouses", { token: admin })).body.warehouses ?? [];
  let index = 0;
  for (const wanted of DEMO_WAREHOUSES) {
    let row = have.find((item) => item.name === wanted.name);
    if (!row) {
      const created = await post("/api/staff/warehouses", admin, {
        name: wanted.name, kind: wanted.kind, regionCode: wanted.regionCode, address: wanted.address, phone: null, serviceCenterId: centers.find((center) => center.name === wanted.centre)?.id ?? null,
        leadDaysSameRegion: wanted.leadDaysSameRegion, leadDaysOtherRegion: wanted.leadDaysOtherRegion, note: MARK,
      });
      if (created.status !== 201) continue;
      row = created.body.warehouse;
      bump("warehouses");
    }
    if (wanted.keeper && !(row.keepers ?? []).length) {
      const created = await post("/api/staff/staff", admin, { name: wanted.keeper[0], phone: wanted.keeper[1], password: CUSTOMER_PASSWORD, role: "warehouse", warehouseId: row.id, serviceCenterId: null, payPercent: 0, payFixedPerJob: 0 });
      if (created.status === 201) bump("warehouse keepers");
    }
    // Shelves: a deterministic spread (some parts missing here on purpose, so the "fastest source" picker has something to choose).
    for (const [partIndex, part] of parts.entries()) {
      const spread = (index * 7 + partIndex * 3) % 9;
      const quantity = wanted.kind === "branch" ? Math.max(0, spread - 4) : spread === 0 ? 0 : spread + 1;
      const current = await prisma.partStock.findUnique({ where: { warehouseId_sparePartId: { warehouseId: row.id, sparePartId: part.id } } });
      if (current) continue;
      const set = await patch(`/api/staff/warehouses/${row.id}/stock/${part.id}`, admin, { quantity, minQuantity: wanted.min, note: MARK });
      if (set.status === 200 && quantity > 0) bump("shelf entries");
    }
    index += 1;
  }
}

// ---------- other makers ----------
// Brands and models of other makers (noted DEMO-DATA through `added_by_name`), one entry waiting for approval, the mobile technician's
// "I repair" list and a few second-tier (paid, other maker) requests for demo customers. Idempotent: skipped once the marked brands exist.
const OTHER_MAKERS: Array<{ brand: string; models: Array<{ category: string; model: string }> }> = [
  { brand: "Samsung", models: [{ category: "Kir yuvish mashinalari", model: "WW70T4020" }, { category: "Muzlatkichlar", model: "RB37A5200" }] },
  { brand: "LG", models: [{ category: "Kir yuvish mashinalari", model: "F2V3HS6" }, { category: "Muzlatkichlar", model: "GC-B459" }] },
  { brand: "Artel", models: [{ category: "Konditsionerlar", model: "ART-12HE" }] },
  { brand: "Bosch", models: [{ category: "Kir yuvish mashinalari", model: "WAN2427" }] },
];

async function seedOtherMakers(admin: string, mobileToken: string, mobileId: string) {
  if (await prisma.brand.findFirst({ where: { addedByName: MARK } })) return;
  const categories: string[] = (await http<{ categories: string[] }>("/api/staff/directory/categories", { token: admin })).body.categories ?? [];
  const models: Json[] = [];
  for (const maker of OTHER_MAKERS) {
    const brand = await post("/api/staff/directory/brands", admin, { name: maker.brand });
    if (brand.status !== 201 && brand.status !== 200) continue;
    for (const item of maker.models) {
      const category = categories.find((name) => name === item.category) ?? categories[0];
      if (!category) continue;
      const made = await post("/api/staff/directory/models", admin, { brandId: brand.body.brand.id, category, model: item.model });
      if (made.status === 201) {
        models.push(made.body.model);
        bump("other-maker models");
      }
    }
  }
  // One entry typed in by the technician, still waiting for an admin.
  const midea = await post("/api/staff/directory/brands", mobileToken, { name: "Midea" });
  if (midea.status === 201 && categories[0]) await post("/api/staff/directory/models", mobileToken, { brandId: midea.body.brand.id, category: categories.find((name) => name === "Muzlatkichlar") ?? categories[0], model: "MDRB424" });
  await prisma.$executeRawUnsafe(`update products set added_by_name = $1 where brand_id in (select id from brands where is_own = false)`, MARK);
  await prisma.$executeRawUnsafe(`update brands set added_by_name = $1 where is_own = false`, MARK);
  // The mobile technician repairs Samsung (every model) and one LG model.
  const brands = (await http<{ brands: Json[] }>("/api/staff/directory/brands", { token: admin })).body.brands ?? [];
  const samsung = brands.find((brand) => brand.name === "Samsung");
  const lgModel = models.find((model) => String(model.name).includes("GC-B459"));
  const mine = (await http<{ brands: Json[]; models: Json[] }>("/api/staff/directory/skills", { token: mobileToken })).body;
  const brandIds = [...new Set([...(mine.brands ?? []).map((brand) => brand.id), ...(samsung ? [samsung.id] : [])])];
  const productIds = [...new Set([...(mine.models ?? []).map((model) => model.id), ...(lgModel ? [lgModel.id] : [])])];
  await http("/api/staff/directory/skills", { method: "PUT", token: mobileToken, body: JSON.stringify({ brandIds, productIds }) });
  bump("technician skills");
  // Second-tier requests for a few demo customers (the cleaner removes them with the customers).
  const customers = await prisma.customer.findMany({ where: { notes: MARK }, orderBy: { createdAt: "asc" }, take: 4, select: { id: true, address: true } });
  const wanted = [models.find((m) => String(m.name).includes("WW70T4020")), models.find((m) => String(m.name).includes("GC-B459")), models.find((m) => String(m.name).includes("ART-12HE")), models.find((m) => String(m.name).includes("WAN2427"))];
  for (const [index, customer] of customers.entries()) {
    const model = wanted[index];
    if (!model) continue;
    const res = await post("/api/staff/requests", admin, {
      type: "repair", customerId: customer.id, productId: model.id, issueDescription: ["Kir yuvish mashinasi suv to‘kmayapti", "Muzlatkich sovutmayapti", "Konditsioner yoqilmayapti", "Mashina titrab, shovqin qilyapti"][index], locationType: "on_site",
      customerLocation: { address: customer.address ?? "Toshkent, Chilonzor 9" }, technicianTypeRequired: "mobile", autoAssign: true, allowDuplicate: true,
    });
    if (res.status === 201) bump("other-maker requests");
  }
  void mobileId;
}

// ---------- report history ----------
// The automatic tasks page shows "report history" and "pay statements": a fresh database has none, so write two weeks of daily
// reports, four weekly summaries and four weeks of pay statements out of the demo requests (the real calculation for pay).
// Marked by `demo: true` in the run's summary (the cleaner removes the runs and the statements they list). Nothing is sent.
const TASHKENT = 5 * 3_600_000;
const DONE = ["ready", "completed", "picked_up", "replaced"] as const;
const FINISHED_OR_GONE = ["cancelled", "rejected", "refunded"] as const;

function tashkentDayStart(daysAgo: number) {
  const todayStart = Math.floor((Date.now() + TASHKENT) / DAY) * DAY - TASHKENT;
  return new Date(todayStart - daysAgo * DAY);
}
const dayLabel = (from: Date) => new Date(from.getTime() + TASHKENT).toISOString().slice(0, 10);
const avg = (list: number[]) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null);

async function windowSummary(from: Date, to: Date, index: number) {
  const [created, finishedRows, collected, ratings, openAtEnd] = await Promise.all([
    prisma.serviceRequest.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.serviceRequest.findMany({ where: { status: { in: [...DONE] }, completedAt: { gte: from, lte: to } }, select: { finalCost: true, assignedTechnician: { select: { name: true } } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { kind: "payment", createdAt: { gte: from, lte: to } } }),
    prisma.feedback.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { rating: true } }),
    prisma.serviceRequest.count({ where: { createdAt: { lte: to }, status: { notIn: [...FINISHED_OR_GONE] }, OR: [{ completedAt: null }, { completedAt: { gt: to } }] } }),
  ]);
  const byTech = new Map<string, number>();
  for (const row of finishedRows) if (row.assignedTechnician?.name) byTech.set(row.assignedTechnician.name, (byTech.get(row.assignedTechnician.name) ?? 0) + 1);
  const top = [...byTech.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    created,
    finished: finishedRows.length,
    open: openAtEnd,
    overdue: Math.round(openAtEnd * 0.2),
    atRisk: (index * 7) % 4,
    partsWaiting: Math.min(6, Math.round(openAtEnd * 0.07)),
    revenue: Math.round(finishedRows.reduce((sum, row) => sum + Number(row.finalCost ?? 0), 0)),
    collected: Math.round(Number(collected._sum.amount ?? 0)),
    avgRating: avg(ratings.map((row) => row.rating)),
    topTechnician: top ? { name: top[0], done: top[1] } : null,
  };
}

async function seedReportHistory() {
  if (await prisma.autoJobRun.findFirst({ where: { summary: { path: ["demo"], equals: true } } })) return;
  // Daily reports for the last 14 days (sent at 18:00).
  for (let ago = 14; ago >= 1; ago -= 1) {
    const from = tashkentDayStart(ago);
    const to = new Date(from.getTime() + DAY - 1);
    const summary = await windowSummary(from, to, ago);
    const at = new Date(from.getTime() + 18 * 3_600_000);
    await prisma.autoJobRun.create({ data: { jobKey: "daily_report", trigger: "auto", ok: true, summary: { demo: true, date: dayLabel(from), ...summary }, startedAt: at, finishedAt: new Date(at.getTime() + 900) } });
    bump("daily reports");
  }
  // Four closed weeks (Monday to Sunday): the weekly summary (Monday 09:00 after) and the pay statements (09:30).
  const weekday = new Date(Date.now() + TASHKENT).getUTCDay();
  const sinceMonday = (weekday + 6) % 7;
  const technicians = await prisma.staffUser.findMany({ where: { role: "technician", isActive: true }, orderBy: { name: "asc" } });
  process.env.JWT_SECRET ??= "demo-loader-only"; // the pay calculation lives in server code that expects the server's settings
  const { earningsFor } = await import("../src/routes/payroll.js");
  for (let weeksAgo = 4; weeksAgo >= 1; weeksAgo -= 1) {
    const monday = tashkentDayStart(sinceMonday + weeksAgo * 7);
    const sundayEnd = new Date(monday.getTime() + 7 * DAY - 1);
    const from = dayLabel(monday);
    const to = dayLabel(new Date(monday.getTime() + 6 * DAY));
    const summary = await windowSummary(monday, sundayEnd, weeksAgo);
    const digestAt = new Date(monday.getTime() + 7 * DAY + 9 * 3_600_000);
    await prisma.autoJobRun.create({ data: { jobKey: "weekly_digest", trigger: "auto", ok: true, summary: { demo: true, from, to, created: summary.created, finished: summary.finished, open: summary.open, overdue: summary.overdue, legalOverdue: 0, revenue: summary.revenue, avgRating: summary.avgRating, firstTimeFixRate: null }, startedAt: digestAt, finishedAt: new Date(digestAt.getTime() + 1500) } });
    bump("weekly digests");
    const ids: string[] = [];
    let total = 0;
    for (const technician of technicians) {
      const result = await earningsFor(technician.id, { from: monday, to: sundayEnd } as never);
      const data = { kind: "auto", jobs: result.jobs.length, jobsTotal: result.jobsTotal, adjustmentsTotal: result.adjustmentsTotal, total: result.total };
      const key = { staffUserId: technician.id, periodFrom: new Date(`${from}T00:00:00Z`), periodTo: new Date(`${to}T00:00:00Z`) };
      const row = await prisma.payrollStatement.upsert({ where: { staffUserId_periodFrom_periodTo: key }, update: data, create: { ...key, ...data } });
      ids.push(row.id);
      total += result.total;
      bump("pay statements");
    }
    const payAt = new Date(digestAt.getTime() + 1800_000);
    await prisma.autoJobRun.create({ data: { jobKey: "payroll_statements", trigger: "auto", ok: true, summary: { demo: true, from, to, kind: "auto", technicians: technicians.length, total: Math.round(total), statementIds: ids }, startedAt: payAt, finishedAt: new Date(payAt.getTime() + 2000) } });
  }
}

/** A few requests in every state, so every warehouse screen has something to show. */
async function seedTransfers(admin: string, desk: string, mobileToken: string) {
  if ((await prisma.stockTransfer.count({ where: { note: { startsWith: MARK } } })) > 0) return;
  const wh = async (name: string) => prisma.warehouse.findFirst({ where: { name } });
  const [central, tashVil, samarqand, buxoro, chilonzor, yunusobod] = await Promise.all([
    prisma.warehouse.findFirst({ where: { kind: "central" } }),
    wh("Toshkent viloyati ombori"), wh("Samarqand hududiy ombori"), wh("Buxoro hududiy ombori"), wh("Chilonzor filial ombori"), wh("Yunusobod filial ombori"),
  ]);
  if (!central || !tashVil || !samarqand || !buxoro || !chilonzor || !yunusobod) return;
  const partAt = async (warehouseId: string, skip = 0) => (await prisma.partStock.findMany({ where: { warehouseId, quantity: { gte: 4 } }, orderBy: { sparePartId: "asc" }, take: 1, skip }))[0]?.sparePartId;
  const make = async (token: string, from: string, to: string, part: string | undefined, quantity: number, note: string) => {
    if (!part) return null;
    const res = await post("/api/staff/transfers", token, { sparePartId: part, quantity, fromWarehouseId: from, toWarehouseId: to, note: `${MARK} ${note}` });
    if (res.status !== 201) return null;
    bump("transfers");
    return res.body.transfer.id as string;
  };
  // 1. The Chilonzor branch admin asks the Tashkent-region warehouse (still waiting).
  await make(desk, tashVil.id, chilonzor.id, await partAt(tashVil.id), 2, "filial admini so‘radi");
  // 2. Yunusobod asks Samarqand for a part; it is sent but is late.
  const late = await make(desk, samarqand.id, yunusobod.id, await partAt(samarqand.id, 1), 3, "kechikkan jo‘natma");
  if (late) await post(`/api/staff/transfers/${late}/ship`, admin, { etaAt: ymd(new Date(now - 2 * DAY)) });
  // 3. On its way, on time.
  const onTime = await make(desk, central.id, chilonzor.id, await partAt(central.id), 2, "yo‘lda");
  if (onTime) await post(`/api/staff/transfers/${onTime}/ship`, admin, { etaAt: ymd(new Date(now + 1 * DAY)) });
  // 4. Received (history).
  const done = await make(desk, central.id, yunusobod.id, await partAt(central.id, 1), 2, "qabul qilingan");
  if (done) {
    await post(`/api/staff/transfers/${done}/ship`, admin, {});
    await post(`/api/staff/transfers/${done}/receive`, admin, {});
  }
  // 5. Refused (history).
  const refused = await make(desk, buxoro.id, chilonzor.id, await partAt(buxoro.id), 1, "rad etilgan");
  if (refused) await post(`/api/staff/transfers/${refused}/reject`, admin, { reason: "Hozir qolmagan, markaziy ombordan so‘rang" });
  // 6. A technician tops up the van from the nearest warehouse.
  const vanPart = await partAt(tashVil.id, 1);
  if (vanPart) {
    const res = await post("/api/staff/my-jobs/stock/requests", mobileToken, { sparePartId: vanPart, quantity: 2, fromWarehouseId: tashVil.id, note: `${MARK} mashina zaxirasi` });
    if (res.status === 201) bump("transfers (van)");
  }
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
    const res = await post("/api/staff/products", admin, { name, nameUz: name, nameRu: name, nameEn: name, sku, category, warrantyMonths: months });
    if (res.status === 201) bump("products");
  }
}

async function customerFlow(index: number, ctx: Ctx) {
  const rng = mulberry32(20261008 + index * 7919);
  const name = fullName(rng);
  const phone = `998${pick(rng, OPERATORS)}${String(between(rng, 1_000_000, 9_999_999))}`;
  const where = place(rng);
  const customerBody = { name, phone, address: where.address, regionCode: where.region, notes: MARK, password: CUSTOMER_PASSWORD };
  let created = await post("/api/staff/customers", ctx.admin, customerBody);
  if (created.status === 409) {
    // A customer of an earlier run that stopped half-way (no purchase yet) is removed and built again; a finished one is left alone.
    const half = await prisma.customer.findFirst({ where: { phone, notes: MARK, sales: { none: {} } }, select: { id: true } });
    if (!half) {
      bump("skipped (already there)");
      return;
    }
    await prisma.customer.delete({ where: { id: half.id } }).catch(() => undefined);
    created = await post("/api/staff/customers", ctx.admin, customerBody);
    if (created.status === 409) {
      bump("skipped (already there)");
      return;
    }
    bump("rebuilt (earlier run stopped half-way)");
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
  const saleRes = ok(await post("/api/staff/sales", ctx.admin, { customerId: c.id, productId: product.id, quantity: 1, saleDate, pricePaid: Math.round(between(rng, low, high) / 10_000) * 10_000, serialNumber: serial, invoiceNumber: `DM-${String(index + 1).padStart(4, "0")}` }), "create sale");
  const sale = { ...saleRes.body.sale, serialNumber: serial };
  bump("sales");

  const outcomes: Array<{ outcome: Outcome; t0: Date }> = [];
  let first: Outcome;
  try {
    first = await runScenario(ctx, scenario, c, sale, product, rng, { viaPortal: chance(rng, 0.25) });
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : error}${error instanceof Error && error.stack ? ` @ ${(error.stack.split("\n")[1] ?? "").trim().replace(/^.*\//, "")}` : ""} [scenario ${scenario}, product ${product.sku}, sold ${saleDate}, request ${daysAgo} days ago]`);
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
  // The requests go to the API and the timestamps are moved in the database: both must be the same environment, or the
  // demo rows would be written to one place and never dated in the other.
  const apiIsLocal = /localhost|127\.0\.0\.1/.test(API);
  const dbIsLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (apiIsLocal !== dbIsLocal) {
    throw new Error(`The API (${apiIsLocal ? "local" : "remote"}) and the database (${dbIsLocal ? "local" : "remote"}) are not the same environment. Nothing was written.`);
  }
  if (!local && process.env.DEMO_CONFIRM !== "yes") {
    throw new Error("This is not a local database: it would receive ~" + COUNT + " demo customers. Run again with DEMO_CONFIRM=yes if that is what you want.");
  }
  // Fail early, before anything is written, when the database address is wrong.
  try {
    await prisma.$queryRawUnsafe("select 1");
  } catch {
    throw new Error("Cannot connect to the database: check DATABASE_URL (the direct Neon address, with the current password).");
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
  const catalog = (await http<{ services: Json[] }>("/api/staff/catalog/services", { token: admin })).body.services;
  if (!catalog || catalog.length === 0) throw new Error("The service catalogue is empty: add the services (Catalog) first, the demo repairs need them");

  // Quiet mode: the phones that are signed in would get a push for every request. Set their tokens aside for the load.
  const quiet = (process.env.DEMO_QUIET_PUSH ?? (local ? "no" : "yes")) === "yes";
  const stash = quiet ? await prisma.deviceToken.findMany() : [];
  const backupFile = path.join(os.tmpdir(), `rizo-device-tokens-${Date.now()}.json`);
  let restored = false;
  const restoreTokens = async () => {
    if (!quiet || restored) return;
    restored = true;
    const back = await prisma.deviceToken.createMany({ data: stash, skipDuplicates: true });
    console.log(`Push tokens restored (${back.count} of ${stash.length}).`);
  };
  if (quiet) {
    fs.writeFileSync(backupFile, JSON.stringify(stash), { mode: 0o600 });
    await prisma.deviceToken.deleteMany();
    console.log(`Push is quiet: ${stash.length} device token(s) set aside (copy: ${backupFile}). They come back when the load is over.`);
    const onStop = async () => {
      await restoreTokens().catch(() => undefined);
      process.exit(130);
    };
    process.once("SIGINT", onStop);
    process.once("SIGTERM", onStop);
  }
  try {
    await load();
  } finally {
    if (quiet) {
      const wait = Number(process.env.DEMO_QUIET_WAIT ?? 200);
      console.log(`Waiting ${wait} s so the alerts about the demo requests pass before the phones are switched back on…`);
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      await restoreTokens();
    }
  }

  async function load() {
  await seedProducts(admin);
  await seedSuppliersAndParts(admin);
  const parts = (await http<{ parts: Json[] }>("/api/staff/catalog/parts", { token: admin })).body.parts ?? [];
  const products = (await http<{ products: Json[] }>("/api/staff/products", { token: admin })).body.products;
  const services = (await http<{ services: Json[] }>("/api/staff/catalog/services", { token: admin })).body.services;
  // Service centres across the regions (the ones that already exist are kept); a service-centre technician without a centre joins the first.
  let centers = (await http<{ centers: Json[] }>("/api/staff/service-centers", { token: admin })).body.centers;
  for (const center of DEMO_CENTERS) {
    if (centers.some((existing) => existing.name === center.name)) continue;
    const created = await post("/api/staff/service-centers", admin, { ...center, workingHours: "Du–Sha 09:00–18:00", isAuthorized: true, isActive: true });
    if (created.status === 201) bump("service centres");
  }
  centers = (await http<{ centers: Json[] }>("/api/staff/service-centers", { token: admin })).body.centers;
  if (!shop.serviceCenterId && centers[0]) ok(await patch(`/api/staff/staff/${shop.id}`, admin, { serviceCenterId: centers[0].id }), "service-centre technician joins a centre");
  if (centers.length === 0) throw new Error("There is no service centre in the system: add one (Service centres) and put the service-centre technician in it, then run again. Nothing was written yet.");
  await seedWarehouses(admin, centers, parts);
  const ctx: Ctx = { admin, desk, mobile: { id: mobile.id, token: byId.get(mobile.id)! }, shop: { id: shop.id, token: byId.get(shop.id)! }, products, services, centers, parts };

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
  await seedStockOrders(admin);
  await seedTransfers(admin, desk, byId.get(mobile.id)!);
  await seedOtherMakers(admin, byId.get(mobile.id)!, mobile.id);
  await seedReportHistory();

  console.log("\nDone in " + Math.round((Date.now() - started) / 1000) + " s. Created:");
  for (const key of Object.keys(stats).sort()) console.log(`  ${key.padEnd(24)} ${stats[key]}`);
  if (failures) console.log(`  (${failures} customer(s) failed; run again to fill the gaps: finished ones are skipped)`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
