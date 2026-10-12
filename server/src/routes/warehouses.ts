import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { serializeNamed } from "../lib/named.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { createPartOrder } from "../lib/partOrders.js";
import { maybeAlertLowStock } from "../lib/stockAlerts.js";
import { createTransfer } from "../lib/transfers.js";
import { requireManage, staffScope } from "../lib/warehouseAccess.js";
import { addStock, centralWarehouse, homeWarehouseId, rankSources, serializeWarehouse, setStock, takeStock } from "../lib/warehouses.js";
import { readWriteRoles, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const warehousesRouter = Router();
warehousesRouter.use(staffAuth);

const READ = readWriteRoles(["admin", "warehouse", "receptionist", "accountant"], ["admin", "warehouse"]);
const REGION = z.string().regex(/^\d{2}$/, "Region code is two digits");

const fields = {
  name: z.string().trim().min(1, "Name is required").max(100),
  kind: z.enum(["regional", "branch"]),
  regionCode: REGION,
  address: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  lat: z.coerce.number().min(-90).max(90).nullable().optional(),
  lng: z.coerce.number().min(-180).max(180).nullable().optional(),
  serviceCenterId: z.string().min(1).nullable().optional(),
  leadDaysSameRegion: z.coerce.number().int().min(0).max(60),
  leadDaysOtherRegion: z.coerce.number().int().min(0).max(60),
  note: z.string().trim().max(300).nullable().optional(),
};

const include = { serviceCenter: { select: { id: true, name: true } } } as const;

async function overview(ids?: string[]) {
  const warehouses = await prisma.warehouse.findMany({ where: ids ? { id: { in: ids } } : {}, orderBy: [{ isActive: "desc" }, { kind: "asc" }, { name: "asc" }], include });
  const [stocks, outgoing, incoming, keepers] = await Promise.all([
    prisma.partStock.groupBy({ by: ["warehouseId"], where: { quantity: { gt: 0 } }, _sum: { quantity: true }, _count: { _all: true } }),
    prisma.stockTransfer.groupBy({ by: ["fromWarehouseId"], where: { status: "requested" }, _count: { _all: true } }),
    prisma.stockTransfer.groupBy({ by: ["toWarehouseId"], where: { status: "shipped", toWarehouseId: { not: null } }, _count: { _all: true } }),
    prisma.staffUser.findMany({ where: { role: "warehouse", isActive: true, warehouseId: { not: null } }, select: { id: true, name: true, warehouseId: true } }),
  ]);
  const lows = await prisma.$queryRaw<Array<{ warehouse_id: string; n: number }>>`select warehouse_id, count(*)::int as n from part_stocks where min_quantity is not null and quantity <= min_quantity group by warehouse_id`;
  const lowBy = new Map(lows.map((row) => [row.warehouse_id, row.n]));
  const stockBy = new Map(stocks.map((row) => [row.warehouseId, row]));
  const outBy = new Map(outgoing.map((row) => [row.fromWarehouseId, row._count._all]));
  const inBy = new Map(incoming.map((row) => [row.toWarehouseId!, row._count._all]));
  return warehouses.map((row) => ({
    ...serializeWarehouse(row),
    units: stockBy.get(row.id)?._sum.quantity ?? 0,
    parts: stockBy.get(row.id)?._count._all ?? 0,
    toSend: outBy.get(row.id) ?? 0,
    arriving: inBy.get(row.id) ?? 0,
    low: lowBy.get(row.id) ?? 0,
    keepers: keepers.filter((keeper) => keeper.warehouseId === row.id).map((keeper) => ({ id: keeper.id, name: keeper.name })),
  }));
}

warehousesRouter.get(
  "/",
  READ,
  asyncHandler(async (_req, res) => {
    res.json({ warehouses: await overview() });
  }),
);

// The warehouse this person works from (their own, their service centre's, the region's or the central one).
warehousesRouter.get(
  "/mine",
  READ,
  asyncHandler(async (req, res) => {
    const scope = await staffScope(req.staff!);
    const id = scope.warehouseId ?? (await homeWarehouseId(prisma, { staffId: scope.id }));
    res.json({ warehouseId: id, canManageAll: scope.role === "admin" || (scope.role === "warehouse" && !scope.warehouseId), manages: scope.role === "admin" || scope.role === "warehouse" });
  }),
);

// Where a part can come from for a given destination, fastest first.
warehousesRouter.get(
  "/sources",
  requireStaffRole("admin", "warehouse", "receptionist"),
  asyncHandler(async (req, res) => {
    const partId = String(req.query.partId ?? "");
    const quantity = Math.max(1, Number(req.query.quantity ?? 1) || 1);
    if (!partId) throw new HttpError(400, "partId is required");
    const scope = await staffScope(req.staff!);
    const toWarehouseId = typeof req.query.toWarehouseId === "string" && req.query.toWarehouseId ? req.query.toWarehouseId : (scope.warehouseId ?? (await homeWarehouseId(prisma, { staffId: scope.id })));
    res.json({ toWarehouseId, options: await rankSources(prisma, { partId, quantity, toWarehouseId }) });
  }),
);

warehousesRouter.post(
  "/",
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object(fields), req.body);
    const row = await prisma.warehouse.create({
      data: { ...body, address: body.address ?? null, phone: body.phone ?? null, lat: body.lat ?? null, lng: body.lng ?? null, serviceCenterId: body.kind === "branch" ? (body.serviceCenterId ?? null) : null, note: body.note ?? null },
      include,
    });
    await writeAudit({ actor: staffActor(req.staff), action: "warehouse.create", entityType: "Warehouse", entityId: row.id, newValue: { name: row.name, kind: row.kind } });
    res.status(201).json({ warehouse: (await overview([row.id]))[0] });
  }),
);

warehousesRouter.patch(
  "/:id",
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ ...fields, isActive: z.boolean() }).partial(), req.body);
    const existing = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Warehouse not found");
    if (existing.kind === "central" && body.isActive === false) throw new HttpError(400, "The central warehouse cannot be switched off", "centralWarehouse");
    if (body.isActive === false) {
      const [open, shipped] = await Promise.all([
        prisma.stockTransfer.count({ where: { OR: [{ fromWarehouseId: existing.id, status: "requested" }, { toWarehouseId: existing.id, status: { in: ["requested", "shipped"] } }, { fromWarehouseId: existing.id, status: "shipped" }] } }),
        prisma.partOrder.count({ where: { warehouseId: existing.id, status: { in: ["requested", "ordered"] } } }),
      ]);
      if (open + shipped > 0) throw new HttpError(409, "This warehouse has open requests or orders", "warehouseInUse");
    }
    const { kind: _kind, ...rest } = body;
    await prisma.warehouse.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(existing.kind === "central" ? { serviceCenterId: null } : {}),
        ...(body.kind && existing.kind !== "central" ? { kind: body.kind } : {}),
      },
    });
    await writeAudit({ actor: staffActor(req.staff), action: "warehouse.update", entityType: "Warehouse", entityId: existing.id, newValue: { name: body.name ?? existing.name, isActive: body.isActive ?? existing.isActive } });
    res.json({ warehouse: (await overview([existing.id]))[0] });
  }),
);

warehousesRouter.delete(
  "/:id",
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Warehouse not found");
    if (existing.kind === "central") throw new HttpError(400, "The central warehouse cannot be deleted", "centralWarehouse");
    const [stock, transfers, orders, staff] = await Promise.all([
      prisma.partStock.count({ where: { warehouseId: existing.id, quantity: { gt: 0 } } }),
      prisma.stockTransfer.count({ where: { OR: [{ fromWarehouseId: existing.id }, { toWarehouseId: existing.id }] } }),
      prisma.partOrder.count({ where: { warehouseId: existing.id } }),
      prisma.staffUser.count({ where: { warehouseId: existing.id } }),
    ]);
    if (stock + transfers + orders + staff > 0) throw new HttpError(409, "This warehouse has stock, history or staff; switch it off instead", "warehouseInUse");
    await prisma.partStock.deleteMany({ where: { warehouseId: existing.id } });
    await prisma.warehouse.delete({ where: { id: existing.id } });
    await writeAudit({ actor: staffActor(req.staff), action: "warehouse.delete", entityType: "Warehouse", entityId: existing.id, oldValue: { name: existing.name } });
    res.json({ ok: true });
  }),
);

/** What one warehouse holds: every part of the catalogue with its quantity, minimum and what is on its way in or out. */
async function stockList(warehouseId: string, query: { q?: string; low?: boolean; onlyStocked?: boolean }) {
  const [parts, rows, incomingOrders, incomingTransfers, outgoing] = await Promise.all([
    prisma.sparePart.findMany({ orderBy: { name: "asc" }, ...(query.q ? { where: { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { nameUz: { contains: query.q, mode: "insensitive" } }, { nameRu: { contains: query.q, mode: "insensitive" } }, { nameEn: { contains: query.q, mode: "insensitive" } }] } } : {}) }),
    prisma.partStock.findMany({ where: { warehouseId } }),
    prisma.partOrder.groupBy({ by: ["sparePartId"], where: { warehouseId, status: { in: ["requested", "ordered"] } }, _sum: { quantity: true } }),
    prisma.stockTransfer.groupBy({ by: ["sparePartId"], where: { toWarehouseId: warehouseId, status: { in: ["requested", "shipped"] } }, _sum: { quantity: true } }),
    prisma.stockTransfer.groupBy({ by: ["sparePartId"], where: { fromWarehouseId: warehouseId, status: "requested" }, _sum: { quantity: true } }),
  ]);
  const rowBy = new Map(rows.map((row) => [row.sparePartId, row]));
  const ordersBy = new Map(incomingOrders.map((row) => [row.sparePartId, row._sum.quantity ?? 0]));
  const transfersBy = new Map(incomingTransfers.map((row) => [row.sparePartId, row._sum.quantity ?? 0]));
  const outBy = new Map(outgoing.map((row) => [row.sparePartId, row._sum.quantity ?? 0]));
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
  const items = parts.map((part) => {
    const row = rowBy.get(part.id);
    const quantity = row?.quantity ?? 0;
    const minQuantity = row?.minQuantity ?? null;
    // The central warehouse falls back to the part's own minimum; a branch or regional one has none unless it is set.
    const effectiveMin = minQuantity ?? (warehouse.kind === "central" ? part.lowStockThreshold : null);
    return {
      part: { id: part.id, ...serializeNamed(part) },
      quantity,
      minQuantity,
      effectiveMin,
      low: effectiveMin != null && quantity <= effectiveMin,
      onOrder: ordersBy.get(part.id) ?? 0,
      incoming: transfersBy.get(part.id) ?? 0,
      requestedFromHere: outBy.get(part.id) ?? 0,
    };
  });
  return items.filter((item) => (query.low ? item.low : true) && (query.onlyStocked ? item.quantity > 0 || item.onOrder > 0 || item.incoming > 0 || item.minQuantity != null : true));
}

warehousesRouter.get(
  "/:id/stock",
  READ,
  asyncHandler(async (req, res) => {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: req.params.id }, include });
    if (!warehouse) throw new HttpError(404, "Warehouse not found");
    const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;
    res.json({ warehouse: serializeWarehouse(warehouse), items: await stockList(warehouse.id, { q, low: req.query.low === "1", onlyStocked: req.query.stocked === "1" }) });
  }),
);

// Counting or correcting the shelf, and setting the minimum the keeper is warned at.
warehousesRouter.patch(
  "/:id/stock/:partId",
  requireStaffRole("admin", "warehouse"),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        quantity: z.coerce.number().int().min(0).max(1_000_000).optional(),
        delta: z.coerce.number().int().min(-1_000_000).max(1_000_000).optional(),
        minQuantity: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
        note: z.string().trim().max(200).nullable().optional(),
      }),
      req.body,
    );
    const scope = await staffScope(req.staff!);
    requireManage(scope, req.params.id);
    const [warehouse, part] = await Promise.all([prisma.warehouse.findUnique({ where: { id: req.params.id } }), prisma.sparePart.findUnique({ where: { id: req.params.partId } })]);
    if (!warehouse) throw new HttpError(404, "Warehouse not found");
    if (!part) throw new HttpError(404, "Spare part not found");
    const by = { id: scope.id, name: scope.name };
    await prisma.$transaction(async (tx) => {
      if (body.quantity !== undefined) await setStock(tx, warehouse.id, part.id, body.quantity, { kind: "adjust", by, note: body.note ?? null });
      else if (body.delta !== undefined && body.delta !== 0) {
        if (body.delta > 0) await addStock(tx, warehouse.id, part.id, body.delta, { kind: "adjust", by, note: body.note ?? null });
        else if (!(await takeStock(tx, warehouse.id, part.id, -body.delta, { kind: "adjust", by, note: body.note ?? null }))) throw new HttpError(400, "There is not that much on the shelf", "stockInsufficient");
      }
      if (body.minQuantity !== undefined) {
        await tx.partStock.upsert({
          where: { warehouseId_sparePartId: { warehouseId: warehouse.id, sparePartId: part.id } },
          update: { minQuantity: body.minQuantity, lowNotifiedAt: null },
          create: { warehouseId: warehouse.id, sparePartId: part.id, quantity: 0, minQuantity: body.minQuantity },
        });
      }
    });
    await writeAudit({ actor: staffActor(req.staff), action: "warehouse.stock", entityType: "Warehouse", entityId: warehouse.id, newValue: { part: part.name, quantity: body.quantity ?? null, delta: body.delta ?? null, min: body.minQuantity ?? null } });
    await maybeAlertLowStock(part.id);
    const item = (await stockList(warehouse.id, {})).find((entry) => entry.part.id === part.id);
    res.json({ item });
  }),
);

// The history of the shelf: receipts, sends, counts, parts used on jobs, parts handed to technicians.
warehousesRouter.get(
  "/:id/movements",
  READ,
  asyncHandler(async (req, res) => {
    const partId = typeof req.query.partId === "string" && req.query.partId ? req.query.partId : undefined;
    const rows = await prisma.stockMovement.findMany({ where: { warehouseId: req.params.id, sparePartId: partId }, orderBy: { createdAt: "desc" }, take: 150 });
    const [parts, techs] = await Promise.all([
      prisma.sparePart.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.sparePartId))] } } }),
      prisma.staffUser.findMany({ where: { id: { in: rows.map((row) => row.technicianId).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true } }),
    ]);
    const partBy = new Map(parts.map((part) => [part.id, part]));
    const techBy = new Map(techs.map((tech) => [tech.id, tech.name]));
    res.json({
      movements: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        quantity: row.quantity,
        part: partBy.get(row.sparePartId) ? { id: row.sparePartId, ...serializeNamed(partBy.get(row.sparePartId)!) } : null,
        technicianName: row.technicianId ? (techBy.get(row.technicianId) ?? null) : null,
        note: row.note,
        createdByName: row.createdByName,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }),
);

// What this warehouse should ask for: parts below their minimum, with the fastest places to get them.
warehousesRouter.get(
  "/:id/restock",
  READ,
  asyncHandler(async (req, res) => {
    const warehouse = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
    if (!warehouse) throw new HttpError(404, "Warehouse not found");
    const low = (await stockList(warehouse.id, { low: true })).filter((item) => item.quantity + item.onOrder + item.incoming <= (item.effectiveMin ?? 0));
    const suggestions = [];
    for (const item of low) {
      const target = Math.max((item.effectiveMin ?? 0) * 2, (item.effectiveMin ?? 0) + 1);
      const quantity = Math.max(1, target - item.quantity - item.onOrder - item.incoming);
      suggestions.push({ ...item, recommended: quantity, options: await rankSources(prisma, { partId: item.part.id, quantity, toWarehouseId: warehouse.id }) });
    }
    res.json({ warehouse: serializeWarehouse(warehouse), suggestions });
  }),
);

// Ask for several parts at once: each line goes to a warehouse (as a request) or to the supplier (as an order).
warehousesRouter.post(
  "/:id/restock",
  requireStaffRole("admin", "warehouse"),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        items: z.array(z.object({ sparePartId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(100000), from: z.string().min(1) })).min(1).max(100),
      }),
      req.body,
    );
    const scope = await staffScope(req.staff!);
    requireManage(scope, req.params.id);
    const warehouse = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
    if (!warehouse || !warehouse.isActive) throw new HttpError(404, "Warehouse not found");
    let transfers = 0;
    let orders = 0;
    for (const line of body.items) {
      if (line.from === "supplier") {
        await createPartOrder({ sparePartId: line.sparePartId, quantity: line.quantity, warehouseId: warehouse.id, createdById: scope.id, note: `Restock ${warehouse.name}` });
        orders += 1;
      } else {
        await createTransfer({ sparePartId: line.sparePartId, quantity: line.quantity, fromWarehouseId: line.from, toWarehouseId: warehouse.id, note: "Restock", actor: { id: scope.id, name: scope.name, role: scope.role } });
        transfers += 1;
      }
    }
    res.status(201).json({ transfers, orders });
  }),
);

export { centralWarehouse };
