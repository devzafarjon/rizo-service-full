import type { Prisma } from "@prisma/client";
import { writeAudit, type AuditActor } from "./audit.js";
import { tashkentCalendarDate, formatRequestId } from "./displayId.js";
import { fulfilPendingParts } from "./estimates.js";
import { HttpError } from "./httpError.js";
import { serializeNamed } from "./named.js";
import { createCustomerNotification } from "./notifyCustomer.js";
import { notifyAdmins, notifyStaffUser } from "./notifyStaff.js";
import { maybeAlertLowStock } from "./stockAlerts.js";
import { prisma } from "./prisma.js";
import { getAppSettings } from "./settings.js";
import { changeRequestStatus } from "./statusChange.js";
import { toDateOnly } from "./warranty.js";
import { addStock, centralWarehouse, homeWarehouseForRequest } from "./warehouses.js";

const OPEN_ORDER = ["requested", "ordered"] as const;
const DAY = 86_400_000;
const STOCK_ROLES: Array<"admin" | "warehouse"> = ["admin", "warehouse"];

function todayTashkent() {
  return tashkentCalendarDate(new Date());
}

function isLate(expectedAt: Date | null, today = todayTashkent()) {
  return Boolean(expectedAt && toDateOnly(expectedAt) < today);
}

type OrderRow = Prisma.PartOrderGetPayload<{ include: { supplierRef: true } }>;

function serializeOrderBrief(order: OrderRow, today: string) {
  return {
    id: order.id,
    status: order.status,
    quantity: order.quantity,
    supplier: order.supplierRef?.name ?? order.supplier ?? null,
    expectedAt: order.expectedAt ? toDateOnly(order.expectedAt) : null,
    late: isLate(order.expectedAt, today),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Waiting requests
// ---------------------------------------------------------------------------------------------------------------------

type Need = { partId: string; quantity: number };

/** Parts that approved estimates still need and that were not taken from stock yet (latest approved estimate per request). */
async function unfulfilledNeeds() {
  const estimates = await prisma.estimate.findMany({
    where: {
      status: "approved",
      serviceRequest: { status: { in: ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused"] } },
      lines: { some: { kind: "part", isSelected: true, isFulfilled: false } },
    },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
  });
  const byRequest = new Map<string, Need[]>();
  const seen = new Set<string>();
  for (const estimate of estimates) {
    if (seen.has(estimate.serviceRequestId)) continue;
    seen.add(estimate.serviceRequestId);
    const needs = new Map<string, number>();
    for (const line of estimate.lines) {
      if (line.kind !== "part" || !line.isSelected || line.isFulfilled || !line.sparePartId) continue;
      needs.set(line.sparePartId, (needs.get(line.sparePartId) ?? 0) + line.quantity);
    }
    byRequest.set(estimate.serviceRequestId, [...needs].map(([partId, quantity]) => ({ partId, quantity })));
  }
  return byRequest;
}

type TransferRow = Prisma.StockTransferGetPayload<{ include: { fromWarehouse: true; toWarehouse: true } }>;

function serializeTransferBrief(transfer: TransferRow, today: string) {
  const eta = transfer.etaAt ? toDateOnly(transfer.etaAt) : null;
  return {
    id: transfer.id,
    kind: "transfer" as const,
    status: transfer.status,
    quantity: transfer.quantity,
    supplier: transfer.fromWarehouse.name,
    expectedAt: eta,
    late: transfer.status === "shipped" && eta != null && eta < today,
  };
}

/** Every job that is held up by a part: what it needs, what is on the way (orders and warehouse transfers), and whether anything was arranged at all. */
export async function waitingRequests() {
  const today = todayTashkent();
  const [needsByRequest, openOrders, openTransfers] = await Promise.all([
    unfulfilledNeeds(),
    prisma.partOrder.findMany({ where: { status: { in: [...OPEN_ORDER] }, serviceRequestId: { not: null } }, include: { supplierRef: true }, orderBy: { createdAt: "asc" } }),
    prisma.stockTransfer.findMany({ where: { status: { in: ["requested", "shipped"] }, serviceRequestId: { not: null } }, include: { fromWarehouse: true, toWarehouse: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const ordersByRequest = new Map<string, OrderRow[]>();
  for (const order of openOrders) ordersByRequest.set(order.serviceRequestId!, [...(ordersByRequest.get(order.serviceRequestId!) ?? []), order]);
  const transfersByRequest = new Map<string, TransferRow[]>();
  for (const transfer of openTransfers) transfersByRequest.set(transfer.serviceRequestId!, [...(transfersByRequest.get(transfer.serviceRequestId!) ?? []), transfer]);

  const ids = new Set<string>([...needsByRequest.keys(), ...ordersByRequest.keys(), ...transfersByRequest.keys()]);
  const waiting = await prisma.serviceRequest.findMany({
    where: { OR: [{ status: "awaiting_parts" }, { id: { in: [...ids] }, status: { in: ["new", "diagnosing", "awaiting_decision", "in_progress", "paused"] } }] },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      product: true,
      assignedTechnician: { select: { id: true, name: true } },
    },
    orderBy: { statusChangedAt: "asc" },
  });

  // What a job needs: the parts of its approved estimate, plus whatever is on order or on its way for it.
  const needsOf = (requestId: string) => {
    const needs = new Map((needsByRequest.get(requestId) ?? []).map((need) => [need.partId, need.quantity]));
    const supply = new Map<string, number>();
    for (const order of ordersByRequest.get(requestId) ?? []) supply.set(order.sparePartId, (supply.get(order.sparePartId) ?? 0) + order.quantity);
    for (const transfer of transfersByRequest.get(requestId) ?? []) supply.set(transfer.sparePartId, (supply.get(transfer.sparePartId) ?? 0) + transfer.quantity);
    for (const [partId, quantity] of supply) if (!needs.has(partId)) needs.set(partId, quantity);
    return { needs, supply };
  };

  const partIds = new Set<string>();
  for (const request of waiting) for (const partId of needsOf(request.id).needs.keys()) partIds.add(partId);
  const homes = new Map<string, string>();
  for (const request of waiting) homes.set(request.id, await homeWarehouseForRequest(prisma, request));
  const homeIds = [...new Set(homes.values())];
  const [parts, openByPart, homeStocks, homeNames, homeOrders, homeTransfers] = await Promise.all([
    prisma.sparePart.findMany({ where: { id: { in: [...partIds] } } }),
    prisma.partOrder.groupBy({ by: ["sparePartId"], where: { status: { in: [...OPEN_ORDER] }, sparePartId: { in: [...partIds] } }, _sum: { quantity: true } }),
    prisma.partStock.findMany({ where: { warehouseId: { in: [...new Set(homes.values())] }, sparePartId: { in: [...partIds] } } }),
    prisma.warehouse.findMany({ where: { id: { in: [...new Set(homes.values())] } }, select: { id: true, name: true } }),
    // Orders and transfers on their way to those warehouses count as cover even when no job is named on them.
    prisma.partOrder.groupBy({ by: ["warehouseId", "sparePartId"], where: { status: { in: [...OPEN_ORDER] }, warehouseId: { in: homeIds }, sparePartId: { in: [...partIds] } }, _sum: { quantity: true } }),
    prisma.stockTransfer.groupBy({ by: ["toWarehouseId", "sparePartId"], where: { status: { in: ["requested", "shipped"] }, toWarehouseId: { in: homeIds }, sparePartId: { in: [...partIds] } }, _sum: { quantity: true } }),
  ]);
  const homeIncoming = new Map<string, number>();
  for (const row of homeOrders) homeIncoming.set(`${row.warehouseId}:${row.sparePartId}`, (homeIncoming.get(`${row.warehouseId}:${row.sparePartId}`) ?? 0) + (row._sum.quantity ?? 0));
  for (const row of homeTransfers) homeIncoming.set(`${row.toWarehouseId}:${row.sparePartId}`, (homeIncoming.get(`${row.toWarehouseId}:${row.sparePartId}`) ?? 0) + (row._sum.quantity ?? 0));
  const partById = new Map(parts.map((part) => [part.id, part]));
  const incoming = new Map(openByPart.map((row) => [row.sparePartId, row._sum.quantity ?? 0]));
  const homeStock = new Map(homeStocks.map((row) => [`${row.warehouseId}:${row.sparePartId}`, row.quantity]));
  const homeName = new Map(homeNames.map((row) => [row.id, row.name]));

  // Per part: what every waiting job needs against what is in stock (anywhere) and on order.
  const demand = new Map<string, number>();
  for (const request of waiting) for (const [partId, quantity] of needsOf(request.id).needs) demand.set(partId, (demand.get(partId) ?? 0) + quantity);
  const gapOf = (partId: string) => Math.max(0, (demand.get(partId) ?? 0) - (partById.get(partId)?.stockQuantity ?? 0) - (incoming.get(partId) ?? 0));

  const now = Date.now();
  return waiting.map((request) => {
    const { needs, supply } = needsOf(request.id);
    const orders = ordersByRequest.get(request.id) ?? [];
    const transfers = transfersByRequest.get(request.id) ?? [];
    const home = homes.get(request.id)!;
    const items = [...needs].map(([partId, needed]) => {
      const part = partById.get(partId)!;
      const partOrders = orders.filter((order) => order.sparePartId === partId);
      const partTransfers = transfers.filter((transfer) => transfer.sparePartId === partId);
      const ordered = supply.get(partId) ?? 0;
      return {
        part: { id: part.id, ...serializeNamed(part) },
        needed,
        inStock: part.stockQuantity,
        homeStock: homeStock.get(`${home}:${partId}`) ?? 0,
        homeIncoming: homeIncoming.get(`${home}:${partId}`) ?? 0,
        ordered,
        uncovered: Math.max(0, needed - ordered),
        gap: gapOf(partId),
        orders: [
          ...partOrders.map((order) => ({ ...serializeOrderBrief(order, today), kind: "order" as const })),
          ...partTransfers.map((transfer) => serializeTransferBrief(transfer, today)),
        ],
      };
    });
    const dates = [
      ...orders.map((order) => (order.expectedAt ? toDateOnly(order.expectedAt) : null)),
      ...transfers.map((transfer) => (transfer.etaAt ? toDateOnly(transfer.etaAt) : null)),
    ].filter((value): value is string => Boolean(value)).sort();
    const firstSupply = [...orders.map((order) => order.createdAt), ...transfers.map((transfer) => transfer.createdAt)].sort((x, y) => x.getTime() - y.getTime())[0];
    const since = request.status === "awaiting_parts" ? request.statusChangedAt : (firstSupply ?? request.statusChangedAt);
    return {
      id: request.id,
      displayId: request.displayId,
      status: request.status,
      priority: request.priority,
      customer: request.customer,
      product: serializeNamed(request.product),
      technician: request.assignedTechnician,
      homeWarehouse: { id: home, name: homeName.get(home) ?? "" },
      waitingSince: since.toISOString(),
      waitingDays: Math.floor((now - since.getTime()) / DAY),
      isOverdue: Boolean(request.overdueAt),
      // Nothing arranged for it: no order, no transfer, and the part is not on the shelf of the warehouse that serves the job.
      noOrder: items.length === 0 || items.some((item) => item.uncovered > 0 && (item.gap > 0 || item.homeStock + item.homeIncoming < item.needed)),
      expectedAt: dates.length > 0 ? dates[dates.length - 1] : null,
      late: orders.some((order) => isLate(order.expectedAt, today)) || transfers.some((transfer) => transfer.status === "shipped" && transfer.etaAt != null && toDateOnly(transfer.etaAt) < today),
      items,
    };
  });
}

/** What a customer waiting for a spare part is told: whether it is ordered and when it should arrive. */
export async function customerPartWait(requestId: string) {
  const [orders, transfers] = await Promise.all([
    prisma.partOrder.findMany({ where: { serviceRequestId: requestId, status: { in: [...OPEN_ORDER] } }, select: { status: true, expectedAt: true } }),
    prisma.stockTransfer.findMany({ where: { serviceRequestId: requestId, status: { in: ["requested", "shipped"] } }, select: { status: true, etaAt: true } }),
  ]);
  const dates = [...orders.map((order) => (order.expectedAt ? toDateOnly(order.expectedAt) : null)), ...transfers.map((transfer) => (transfer.etaAt ? toDateOnly(transfer.etaAt) : null))].filter((value): value is string => Boolean(value)).sort();
  const latest = dates.length > 0 ? dates[dates.length - 1] : null;
  return { ordered: orders.some((order) => order.status === "ordered") || transfers.some((transfer) => transfer.status === "shipped"), expectedAt: latest, late: latest != null && latest < todayTashkent() };
}

// ---------------------------------------------------------------------------------------------------------------------
// Stock monitoring and order recommendations
// ---------------------------------------------------------------------------------------------------------------------

export type Reason = "waiting" | "low" | "forecast";

/** Per part: stock, what is on order, who is waiting for it, how fast it is used, and how many to order next. */
export async function partMetrics() {
  const settings = await getAppSettings();
  const since = new Date(Date.now() - settings.partsUsageDays * DAY);
  const [parts, open, techStock, usage, waiting] = await Promise.all([
    prisma.sparePart.findMany({ include: { supplier: true }, orderBy: { name: "asc" } }),
    prisma.partOrder.groupBy({ by: ["sparePartId"], where: { status: { in: [...OPEN_ORDER] } }, _sum: { quantity: true } }),
    prisma.technicianStock.groupBy({ by: ["sparePartId"], _sum: { quantity: true } }),
    prisma.requestPartLine.findMany({
      where: { serviceRequest: { OR: [{ completedAt: { gte: since } }, { completedAt: null, createdAt: { gte: since } }] } },
      select: { sparePartId: true, quantity: true },
    }),
    waitingRequests(),
  ]);
  const onOrder = new Map(open.map((row) => [row.sparePartId, row._sum.quantity ?? 0]));
  const withTechnicians = new Map(techStock.map((row) => [row.sparePartId, row._sum.quantity ?? 0]));
  const used = new Map<string, number>();
  for (const line of usage) used.set(line.sparePartId, (used.get(line.sparePartId) ?? 0) + line.quantity);
  const waitingCount = new Map<string, number>();
  const uncovered = new Map<string, number>();
  for (const request of waiting) {
    for (const item of request.items) {
      waitingCount.set(item.part.id, (waitingCount.get(item.part.id) ?? 0) + 1);
      uncovered.set(item.part.id, item.gap);
    }
  }

  return parts.map((part) => {
    const incoming = onOrder.get(part.id) ?? 0;
    const missing = uncovered.get(part.id) ?? 0;
    const avgDaily = (used.get(part.id) ?? 0) / settings.partsUsageDays;
    const leadDays = part.supplier?.leadTimeDays ?? 3;
    const autoTarget = Math.max(part.lowStockThreshold * 2, Math.ceil(avgDaily * (leadDays + settings.partsSafetyDays)));
    const target = part.targetStock ?? autoTarget;
    const reasons: Reason[] = [];
    if (missing > 0) reasons.push("waiting");
    if (part.lowStockThreshold > 0 && part.stockQuantity + incoming <= part.lowStockThreshold) reasons.push("low");
    if (avgDaily > 0 && part.stockQuantity + incoming < avgDaily * (leadDays + 2)) reasons.push("forecast");
    const recommended = reasons.length > 0 ? Math.max(1, target + missing - part.stockQuantity - incoming) : 0;
    return {
      part,
      stockQuantity: part.stockQuantity,
      lowStockThreshold: part.lowStockThreshold,
      onOrder: incoming,
      withTechnicians: withTechnicians.get(part.id) ?? 0,
      waitingRequests: waitingCount.get(part.id) ?? 0,
      uncovered: missing,
      avgDaily: Math.round(avgDaily * 100) / 100,
      daysCover: avgDaily > 0 ? Math.floor(part.stockQuantity / avgDaily) : null,
      leadDays,
      target,
      reasons,
      recommended,
    };
  });
}

type Metric = Awaited<ReturnType<typeof partMetrics>>[number];

function serializeMetric(metric: Metric) {
  return {
    part: { id: metric.part.id, ...serializeNamed(metric.part), costPrice: Number(metric.part.costPrice) },
    stockQuantity: metric.stockQuantity,
    lowStockThreshold: metric.lowStockThreshold,
    onOrder: metric.onOrder,
    withTechnicians: metric.withTechnicians,
    waitingRequests: metric.waitingRequests,
    uncovered: metric.uncovered,
    avgDaily: metric.avgDaily,
    daysCover: metric.daysCover,
    leadDays: metric.leadDays,
    target: metric.target,
    reasons: metric.reasons,
    recommended: metric.recommended,
  };
}

function urgency(metric: Metric) {
  return (metric.uncovered > 0 ? 0 : 1_000_000) + (metric.daysCover ?? 9999) - metric.uncovered * 10;
}

/** What to buy next, grouped by supplier so one message or call covers each. */
export async function orderRecommendations() {
  const metrics = (await partMetrics()).filter((metric) => metric.reasons.length > 0).sort((a, b) => urgency(a) - urgency(b));
  const groups = new Map<string, { supplier: { id: string; name: string; phone: string | null; telegram: string | null; leadTimeDays: number } | null; items: ReturnType<typeof serializeMetric>[] }>();
  for (const metric of metrics) {
    const supplier = metric.part.supplier && metric.part.supplier.isActive ? metric.part.supplier : null;
    const key = supplier?.id ?? "none";
    const group = groups.get(key) ?? {
      supplier: supplier ? { id: supplier.id, name: supplier.name, phone: supplier.phone, telegram: supplier.telegram, leadTimeDays: supplier.leadTimeDays } : null,
      items: [],
    };
    group.items.push(serializeMetric(metric));
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (a.supplier ? 0 : 1) - (b.supplier ? 0 : 1));
}

/** The numbers shown at the top of the parts page. */
export async function partsOverview() {
  const [metrics, waiting, orders] = await Promise.all([
    partMetrics(),
    waitingRequests(),
    prisma.partOrder.findMany({ where: { status: { in: [...OPEN_ORDER] } }, select: { expectedAt: true } }),
  ]);
  const today = todayTashkent();
  return {
    waitingRequests: waiting.length,
    noOrder: waiting.filter((request) => request.noOrder).length,
    lateOrders: orders.filter((order) => isLate(order.expectedAt, today)).length,
    openOrders: orders.length,
    lowStock: metrics.filter((metric) => metric.stockQuantity <= metric.lowStockThreshold).length,
    toOrder: metrics.filter((metric) => metric.reasons.length > 0).length,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Orders: status news for the customer, receiving goods, releasing waiting jobs
// ---------------------------------------------------------------------------------------------------------------------

async function loadOrder(id: string) {
  const order = await prisma.partOrder.findUnique({ where: { id }, include: { sparePart: true, supplierRef: true, serviceRequest: true } });
  if (!order) throw new HttpError(404, "Part order not found");
  return order;
}

/** The customer hears that the part was ordered and, when known, when it should arrive. */
export async function tellCustomerAboutOrder(orderId: string) {
  const order = await loadOrder(orderId);
  const request = order.serviceRequest;
  if (!request || request.status === "cancelled") return;
  const named = serializeNamed(order.sparePart);
  const date = order.expectedAt ? toDateOnly(order.expectedAt) : null;
  await createCustomerNotification(
    request.customerId,
    request.id,
    date ? `The spare part for ${formatRequestId(request.displayId)} is expected by ${date}` : `The spare part for ${formatRequestId(request.displayId)} has been ordered`,
    date ? "partEta" : "partOrdered",
    { displayId: request.displayId, date, ...named },
  );
}

async function wakeRequest(requestId: string, actor: AuditActor) {
  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId }, include: { assignedTechnician: { select: { id: true } } } });
  if (!request || request.status !== "awaiting_parts") return null;
  await changeRequestStatus({ requestId: request.id, next: "in_progress", actor: { audit: actor, role: "system" } });
  await createCustomerNotification(request.customerId, request.id, "The part has arrived, we are continuing the repair", "partArrived", { displayId: request.displayId });
  if (request.assignedTechnician) {
    await notifyStaffUser(request.assignedTechnician.id, {
      message: `${formatRequestId(request.displayId)}: the part has arrived, please continue the job`,
      code: "jobPartReady",
      serviceRequestId: request.id,
      params: { displayId: request.displayId },
    });
  }
  return request.displayId;
}

/**
 * Goods arrived: stock goes up (all of the order, or only what came), the linked job is served first, then every other
 * job still waiting for the same part, oldest first. Jobs that now have everything continue and everyone concerned hears it.
 */
/**
 * Stock has just arrived (an order or a transfer): jobs that were waiting for the part continue. The linked job is served
 * first, then every other job still waiting for that part, oldest first. A job continues when it has everything.
 */
export async function releaseWaitingJobs(input: { partId: string; linkedRequestId?: string | null; ignoreOrderId?: string; ignoreTransferId?: string; actor: AuditActor }) {
  const released: string[] = [];
  const tried = new Set<string>();
  const release = async (requestId: string) => {
    if (tried.has(requestId)) return;
    tried.add(requestId);
    const result = await fulfilPendingParts(requestId);
    if (result.pending > 0) return;
    // A job with an approved estimate has everything once its lines are taken from the shelf, whatever else is still on the way.
    if (result.hadLines) {
      const displayId = await wakeRequest(requestId, input.actor);
      if (displayId) {
        released.push(displayId);
        // Requests to other warehouses that nobody has sent yet are no longer needed for this job.
        await prisma.stockTransfer.updateMany({ where: { serviceRequestId: requestId, status: "requested" }, data: { status: "cancelled" } });
      }
      return;
    }
    const [orders, transfers] = await Promise.all([
      prisma.partOrder.count({ where: { serviceRequestId: requestId, status: { in: [...OPEN_ORDER] }, ...(input.ignoreOrderId ? { id: { not: input.ignoreOrderId } } : {}) } }),
      prisma.stockTransfer.count({ where: { serviceRequestId: requestId, status: { in: ["requested", "shipped"] }, ...(input.ignoreTransferId ? { id: { not: input.ignoreTransferId } } : {}) } }),
    ]);
    if (orders + transfers > 0) return;
    const displayId = await wakeRequest(requestId, input.actor);
    if (displayId) released.push(displayId);
  };

  if (input.linkedRequestId) await release(input.linkedRequestId);
  const needs = await unfulfilledNeeds();
  const waiting = await prisma.serviceRequest.findMany({
    where: { id: { in: [...needs.entries()].filter(([, list]) => list.some((need) => need.partId === input.partId)).map(([id]) => id) }, status: "awaiting_parts" },
    orderBy: { statusChangedAt: "asc" },
    select: { id: true },
  });
  for (const request of waiting) await release(request.id);
  return released;
}

/**
 * Goods arrived: stock goes up on the shelf of the warehouse the order was for (all of the order, or only what came), and
 * the jobs waiting for the part continue. Everyone concerned hears it.
 */
export async function receivePartOrder(input: { orderId: string; receivedQuantity?: number; actor: AuditActor }) {
  const order = await loadOrder(input.orderId);
  if (order.status === "received" || order.status === "cancelled") throw new HttpError(400, "This order is closed", "orderClosed");
  const quantity = input.receivedQuantity ?? order.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > order.quantity) throw new HttpError(400, "Received quantity must be between 1 and the ordered quantity", "receivedQuantityInvalid");
  const complete = quantity === order.quantity;

  await prisma.$transaction(async (tx) => {
    const warehouseId = order.warehouseId ?? (await centralWarehouse(tx)).id;
    await addStock(tx, warehouseId, order.sparePartId, quantity, { kind: "receive", by: input.actor.type === "staff" ? { id: input.actor.id, name: input.actor.name ?? "" } : null, note: order.supplierRef?.name ?? order.supplier ?? null });
    await tx.partOrder.update({
      where: { id: order.id },
      data: complete ? { status: "received", receivedAt: new Date() } : { quantity: { decrement: quantity }, status: "ordered", orderedAt: order.orderedAt ?? new Date() },
    });
  });
  await maybeAlertLowStock(order.sparePartId);
  const released = await releaseWaitingJobs({ partId: order.sparePartId, linkedRequestId: order.serviceRequestId, ignoreOrderId: order.id, actor: input.actor });

  await writeAudit({
    actor: input.actor,
    action: "partOrder.receive",
    entityType: "PartOrder",
    entityId: order.id,
    newValue: { quantity, complete, released },
  });
  return { order: await loadOrder(order.id), released };
}

// ---------------------------------------------------------------------------------------------------------------------
// Background watch: late deliveries, jobs with nothing ordered, regular news for customers, daily order suggestion
// ---------------------------------------------------------------------------------------------------------------------

let lastWatch = 0;

export async function runPartsWatch(force = false) {
  if (!force && Date.now() - lastWatch < 10 * 60_000) return null;
  lastWatch = Date.now();
  const settings = await getAppSettings();
  const today = todayTashkent();
  const result = { late: 0, noOrder: 0, customerUpdates: 0, suggestion: false };

  // 1. Late deliveries: the office is told once per promised date, the customer apologised to once.
  const open = await prisma.partOrder.findMany({
    where: { status: { in: [...OPEN_ORDER] }, lateNotifiedAt: null, expectedAt: { not: null } },
    include: { sparePart: true, supplierRef: true, serviceRequest: true },
  });
  for (const order of open) {
    if (!isLate(order.expectedAt, today)) continue;
    await prisma.partOrder.update({ where: { id: order.id }, data: { lateNotifiedAt: new Date() } });
    const named = serializeNamed(order.sparePart);
    const days = Math.max(1, Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${toDateOnly(order.expectedAt!)}T00:00:00Z`)) / DAY));
    await notifyAdmins({
      message: `${order.sparePart.name} (${order.quantity}) is ${days} day(s) late`,
      code: "partOrderLate",
      sparePartId: order.sparePartId,
      serviceRequestId: order.serviceRequestId,
      roles: STOCK_ROLES,
      params: { ...named, qty: order.quantity, days, supplier: order.supplierRef?.name ?? order.supplier ?? "", displayId: order.serviceRequest?.displayId ?? "" },
    });
    if (order.serviceRequest && order.serviceRequest.status !== "cancelled") {
      await createCustomerNotification(order.serviceRequest.customerId, order.serviceRequest.id, `The spare part for ${formatRequestId(order.serviceRequest.displayId)} is late, sorry for the delay`, "partLate", { displayId: order.serviceRequest.displayId });
    }
    result.late += 1;
  }

  // 2 + 3. Jobs waiting for a part.
  const waiting = await waitingRequests();
  for (const request of waiting) {
    if (request.status !== "awaiting_parts") continue;
    const since = Date.parse(request.waitingSince);
    if (request.noOrder && Date.now() - since > 30 * 60_000) {
      const recent = await prisma.notification.count({ where: { audience: "staff", code: "partNoOrder", serviceRequestId: request.id, createdAt: { gte: new Date(Date.now() - DAY) } } });
      if (recent === 0) {
        const item = request.items.find((entry) => entry.uncovered > 0) ?? request.items[0];
        await notifyAdmins({
          message: `${formatRequestId(request.displayId)} is waiting for a part that nobody has ordered`,
          code: "partNoOrder",
          serviceRequestId: request.id,
          sparePartId: item?.part.id ?? null,
          roles: STOCK_ROLES,
          params: { displayId: request.displayId, ...(item ? item.part : {}) },
        });
        result.noOrder += 1;
      }
    }
    if (settings.partsCustomerUpdateDays > 0) {
      const sinceNews = new Date(Date.now() - settings.partsCustomerUpdateDays * DAY);
      if (since < sinceNews.getTime()) {
        const news = await prisma.notification.count({ where: { audience: "customer", serviceRequestId: request.id, createdAt: { gte: sinceNews } } });
        if (news === 0) {
          const full = await prisma.serviceRequest.findUnique({ where: { id: request.id }, select: { customerId: true } });
          if (full) {
            await createCustomerNotification(
              full.customerId,
              request.id,
              request.expectedAt ? `Still waiting for the spare part for ${formatRequestId(request.displayId)}, expected by ${request.expectedAt}` : `Still waiting for the spare part for ${formatRequestId(request.displayId)}, we are on it`,
              request.expectedAt ? "partEta" : "partWaiting",
              { displayId: request.displayId, date: request.expectedAt },
            );
            result.customerUpdates += 1;
          }
        }
      }
    }
  }

  // 4. One suggestion a day, in the morning, when something should be ordered.
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(new Date()));
  if (hour >= 9) {
    const startOfDay = new Date(`${today}T00:00:00+05:00`);
    const sent = await prisma.notification.count({ where: { audience: "staff", code: "reorderSuggestion", createdAt: { gte: startOfDay } } });
    if (sent === 0) {
      const toOrder = (await partMetrics()).filter((metric) => metric.reasons.length > 0);
      if (toOrder.length > 0) {
        await notifyAdmins({
          message: `${toOrder.length} spare part(s) should be ordered`,
          code: "reorderSuggestion",
          roles: STOCK_ROLES,
          params: { count: toOrder.length, waiting: toOrder.filter((metric) => metric.uncovered > 0).length },
        });
        result.suggestion = true;
      }
    }
  }
  return result;
}

export { serializeMetric };
