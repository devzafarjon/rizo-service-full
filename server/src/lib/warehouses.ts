import type { Prisma, Warehouse } from "@prisma/client";
import { tashkentCalendarDate } from "./displayId.js";
import { HttpError } from "./httpError.js";
import { serializeNamed } from "./named.js";
import { prisma } from "./prisma.js";

type Db = Prisma.TransactionClient;

export type MovementInfo = {
  kind: string;
  note?: string | null;
  by?: { id: string; name: string } | null;
  technicianId?: string | null;
  serviceRequestId?: string | null;
  transferId?: string | null;
};

// ---------------------------------------------------------------------------------------------------------------------
// Where things are
// ---------------------------------------------------------------------------------------------------------------------

/** The warehouse everybody can be supplied from. A database always has one (the migration creates it); this is a safety net. */
export async function centralWarehouse(db: Db = prisma): Promise<Warehouse> {
  const found = await db.warehouse.findFirst({ where: { kind: "central", isActive: true }, orderBy: { createdAt: "asc" } });
  if (found) return found;
  const any = await db.warehouse.findFirst({ where: { kind: "central" }, orderBy: { createdAt: "asc" } });
  if (any) return any;
  return db.warehouse.create({ data: { name: "Central warehouse", kind: "central", regionCode: "01" } });
}

/**
 * The warehouse a person or a job takes parts from: the one assigned to the staff member, else the stock room of their
 * service centre, else a regional warehouse in the centre's region, else the central warehouse.
 */
export async function homeWarehouseId(db: Db, input: { staffId?: string | null; serviceCenterId?: string | null }): Promise<string> {
  let centerId = input.serviceCenterId ?? null;
  if (input.staffId) {
    const staff = await db.staffUser.findUnique({ where: { id: input.staffId }, select: { warehouseId: true, serviceCenterId: true, warehouse: { select: { isActive: true } } } });
    if (staff?.warehouseId && staff.warehouse?.isActive) return staff.warehouseId;
    centerId = centerId ?? staff?.serviceCenterId ?? null;
  }
  if (centerId) {
    const branch = await db.warehouse.findFirst({ where: { serviceCenterId: centerId, isActive: true }, orderBy: { createdAt: "asc" } });
    if (branch) return branch.id;
    const center = await db.serviceCenter.findUnique({ where: { id: centerId }, select: { regionCode: true } });
    if (center && center.regionCode !== "00") {
      const regional = await db.warehouse.findFirst({ where: { kind: "regional", regionCode: center.regionCode, isActive: true }, orderBy: { createdAt: "asc" } });
      if (regional) return regional.id;
    }
  }
  return (await centralWarehouse(db)).id;
}

export async function homeWarehouseForRequest(db: Db, request: { assignedTechnicianId: string | null; serviceCenterId: string | null }) {
  return homeWarehouseId(db, { staffId: request.assignedTechnicianId, serviceCenterId: request.serviceCenterId });
}

// ---------------------------------------------------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------------------------------------------------

export async function stockAt(db: Db, warehouseId: string, partId: string) {
  const row = await db.partStock.findUnique({ where: { warehouseId_sparePartId: { warehouseId, sparePartId: partId } } });
  return row?.quantity ?? 0;
}

async function log(db: Db, warehouseId: string, partId: string, quantity: number, info: MovementInfo) {
  await db.stockMovement.create({
    data: {
      sparePartId: partId,
      warehouseId,
      technicianId: info.technicianId ?? null,
      transferId: info.transferId ?? null,
      serviceRequestId: info.serviceRequestId ?? null,
      kind: info.kind,
      quantity,
      note: info.note ?? null,
      createdById: info.by?.id ?? null,
      createdByName: info.by?.name ?? null,
    },
  });
}

/** Puts parts on a warehouse's shelf; the part's total follows. */
export async function addStock(db: Db, warehouseId: string, partId: string, quantity: number, info?: MovementInfo) {
  if (quantity <= 0) return;
  await db.partStock.upsert({
    where: { warehouseId_sparePartId: { warehouseId, sparePartId: partId } },
    update: { quantity: { increment: quantity } },
    create: { warehouseId, sparePartId: partId, quantity },
  });
  await db.sparePart.update({ where: { id: partId }, data: { stockQuantity: { increment: quantity } } });
  if (info) await log(db, warehouseId, partId, quantity, info);
}

/** Takes parts off a warehouse's shelf. Never below zero: returns false (and changes nothing) when there is not enough. */
export async function takeStock(db: Db, warehouseId: string, partId: string, quantity: number, info?: MovementInfo) {
  if (quantity <= 0) return true;
  const updated = await db.partStock.updateMany({ where: { warehouseId, sparePartId: partId, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
  if (updated.count === 0) return false;
  await db.sparePart.update({ where: { id: partId }, data: { stockQuantity: { decrement: quantity } } });
  if (info) await log(db, warehouseId, partId, -quantity, info);
  return true;
}

/** Empties what is left of a part on a shelf (used when zero stock is allowed and a job needs more than is there). */
export async function drainStock(db: Db, warehouseId: string, partId: string, info?: MovementInfo) {
  const left = await stockAt(db, warehouseId, partId);
  if (left > 0) await takeStock(db, warehouseId, partId, left, info);
  return left;
}

/** Counted stock: sets the quantity on a shelf to `quantity` (the part's total follows). */
export async function setStock(db: Db, warehouseId: string, partId: string, quantity: number, info: MovementInfo) {
  if (!Number.isInteger(quantity) || quantity < 0) throw new HttpError(400, "Stock cannot be negative");
  const before = await stockAt(db, warehouseId, partId);
  const delta = quantity - before;
  if (delta === 0) return { before, after: before };
  if (delta > 0) await addStock(db, warehouseId, partId, delta, { ...info, kind: info.kind || "adjust" });
  else await takeStock(db, warehouseId, partId, -delta, { ...info, kind: info.kind || "adjust" });
  return { before, after: quantity };
}

/** Sets the total of a part by changing the central warehouse (what the catalogue form edits). */
export async function setTotalViaCentral(db: Db, partId: string, total: number, by?: { id: string; name: string } | null) {
  const part = await db.sparePart.findUniqueOrThrow({ where: { id: partId }, select: { stockQuantity: true } });
  const central = await centralWarehouse(db);
  const centralNow = await stockAt(db, central.id, partId);
  const wanted = Math.max(0, centralNow + (total - part.stockQuantity));
  await setStock(db, central.id, partId, wanted, { kind: "adjust", by: by ?? null, note: "catalogue" });
}

// ---------------------------------------------------------------------------------------------------------------------
// Where can a part come from, and how fast
// ---------------------------------------------------------------------------------------------------------------------

export type WarehouseRef = { id: string; name: string; kind: string; regionCode: string };

export type SourceOption =
  | { type: "warehouse"; warehouse: WarehouseRef; available: number; enough: boolean; etaDays: number; etaDate: string; sameRegion: boolean; recommended: boolean }
  | { type: "supplier"; supplier: { id: string; name: string } | null; etaDays: number; etaDate: string; recommended: boolean };

export function addDaysTashkent(days: number) {
  const base = Date.parse(`${tashkentCalendarDate(new Date())}T00:00:00Z`);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/** Days a delivery takes from `from` to `to`. */
export function deliveryDays(from: Pick<Warehouse, "regionCode" | "leadDaysSameRegion" | "leadDaysOtherRegion">, to: Pick<Warehouse, "regionCode">) {
  return from.regionCode === to.regionCode ? from.leadDaysSameRegion : from.leadDaysOtherRegion;
}

/**
 * Every place the part could be had: warehouses that hold it (fastest first) and, when nothing can supply the whole
 * quantity quickly, the supplier. The best one is marked `recommended`.
 */
export async function rankSources(db: Db, input: { partId: string; quantity: number; toWarehouseId: string; excludeWarehouseIds?: string[] }): Promise<SourceOption[]> {
  const dest = await db.warehouse.findUniqueOrThrow({ where: { id: input.toWarehouseId } });
  const part = await db.sparePart.findUniqueOrThrow({ where: { id: input.partId }, include: { supplier: true } });
  const exclude = new Set([input.toWarehouseId, ...(input.excludeWarehouseIds ?? [])]);
  const [stocks, reserved] = await Promise.all([
    db.partStock.findMany({ where: { sparePartId: input.partId, quantity: { gt: 0 }, warehouse: { isActive: true } }, include: { warehouse: true } }),
    db.stockTransfer.groupBy({ by: ["fromWarehouseId"], where: { sparePartId: input.partId, status: "requested" }, _sum: { quantity: true } }),
  ]);
  const held = new Map(reserved.map((row) => [row.fromWarehouseId, row._sum.quantity ?? 0]));
  const options: SourceOption[] = [];
  for (const row of stocks) {
    if (exclude.has(row.warehouseId)) continue;
    const available = Math.max(0, row.quantity - (held.get(row.warehouseId) ?? 0));
    if (available <= 0) continue;
    const etaDays = deliveryDays(row.warehouse, dest);
    options.push({
      type: "warehouse",
      warehouse: { id: row.warehouse.id, name: row.warehouse.name, kind: row.warehouse.kind, regionCode: row.warehouse.regionCode },
      available,
      enough: available >= input.quantity,
      etaDays,
      etaDate: addDaysTashkent(etaDays),
      sameRegion: row.warehouse.regionCode === dest.regionCode,
      recommended: false,
    });
  }
  options.sort((a, b) => {
    const wa = a as Extract<SourceOption, { type: "warehouse" }>;
    const wb = b as Extract<SourceOption, { type: "warehouse" }>;
    return Number(wb.enough) - Number(wa.enough) || wa.etaDays - wb.etaDays || wb.available - wa.available;
  });
  const supplierDays = part.supplier?.leadTimeDays ?? 3;
  options.push({ type: "supplier", supplier: part.supplier ? { id: part.supplier.id, name: part.supplier.name } : null, etaDays: supplierDays, etaDate: addDaysTashkent(supplierDays), recommended: false });

  // Best: the fastest warehouse that has the whole quantity, unless the supplier is strictly faster.
  const bestWarehouse = options.find((option) => option.type === "warehouse" && option.enough);
  const supplier = options[options.length - 1]!;
  const best = bestWarehouse && bestWarehouse.etaDays <= supplier.etaDays ? bestWarehouse : supplier;
  best.recommended = true;
  return options;
}

export function serializeWarehouse(row: Warehouse & { serviceCenter?: { id: string; name: string } | null }) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    regionCode: row.regionCode,
    address: row.address,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    serviceCenterId: row.serviceCenterId,
    serviceCenterName: row.serviceCenter?.name ?? null,
    leadDaysSameRegion: row.leadDaysSameRegion,
    leadDaysOtherRegion: row.leadDaysOtherRegion,
    note: row.note,
    isActive: row.isActive,
  };
}

export { serializeNamed };
