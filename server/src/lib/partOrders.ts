import type { Prisma } from "@prisma/client";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";
import { isBlockZeroStock } from "./settings.js";
import { tashkentCalendarDate } from "./displayId.js";
import { centralWarehouse, drainStock, homeWarehouseForRequest, takeStock, type MovementInfo } from "./warehouses.js";
import { maybeAlertLowStock } from "./stockAlerts.js";

/**
 * Takes `quantity` of a part off a warehouse's shelf for a job (the central warehouse unless one is given); returns false
 * when it is short and zero stock is blocked. When zero stock is allowed, whatever is there is taken.
 */
export async function takeFromStock(tx: Prisma.TransactionClient, partId: string, quantity: number, warehouseId?: string, info?: MovementInfo) {
  const wh = warehouseId ?? (await centralWarehouse(tx)).id;
  if (await takeStock(tx, wh, partId, quantity, info)) return true;
  if (await isBlockZeroStock()) return false;
  await drainStock(tx, wh, partId, info);
  return true;
}

/** Open order quantity for a part (requested or ordered, not yet received). */
export async function onOrderQuantity(partId: string) {
  const rows = await prisma.partOrder.aggregate({
    where: { sparePartId: partId, status: { in: ["requested", "ordered"] } },
    _sum: { quantity: true },
  });
  return rows._sum.quantity ?? 0;
}

export async function createPartOrder(input: {
  sparePartId: string;
  quantity: number;
  serviceRequestId?: string | null;
  supplier?: string | null;
  supplierId?: string | null;
  /** Where the goods are delivered; empty = the home warehouse of the job it is for, else the central warehouse. */
  warehouseId?: string | null;
  note?: string | null;
  expectedAt?: Date | null;
  createdById?: string | null;
}) {
  const part = await prisma.sparePart.findUnique({ where: { id: input.sparePartId } });
  if (!part) throw new HttpError(400, "Spare part not found");
  // Without a named supplier the part's usual one is used, and its delivery time gives the expected date.
  const supplier = input.supplierId ? await prisma.supplier.findUnique({ where: { id: input.supplierId } }) : part.supplierId ? await prisma.supplier.findUnique({ where: { id: part.supplierId } }) : null;
  if (input.supplierId && !supplier) throw new HttpError(400, "Supplier not found");
  let warehouseId = input.warehouseId ?? null;
  if (!warehouseId && input.serviceRequestId) {
    const job = await prisma.serviceRequest.findUnique({ where: { id: input.serviceRequestId }, select: { assignedTechnicianId: true, serviceCenterId: true } });
    if (job) warehouseId = await homeWarehouseForRequest(prisma, job);
  }
  if (!warehouseId) warehouseId = (await centralWarehouse(prisma)).id;
  const expectedAt = input.expectedAt ?? (supplier ? new Date(Date.parse(`${tashkentCalendarDate(new Date())}T00:00:00Z`) + supplier.leadTimeDays * 86_400_000) : null);
  return prisma.partOrder.create({
    data: {
      sparePartId: part.id,
      quantity: input.quantity,
      serviceRequestId: input.serviceRequestId ?? null,
      supplierId: supplier?.id ?? null,
      warehouseId,
      supplier: input.supplier ?? supplier?.name ?? null,
      note: input.note ?? null,
      expectedAt,
      createdById: input.createdById ?? null,
    },
  });
}

export { maybeAlertLowStock };
