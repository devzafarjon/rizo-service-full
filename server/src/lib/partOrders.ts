import type { Prisma } from "@prisma/client";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";
import { isBlockZeroStock } from "./settings.js";
import { maybeAlertLowStock } from "./stockAlerts.js";

/** Takes `quantity` of a part out of stock for a job; returns false when stock is short and zero stock is blocked. */
export async function takeFromStock(tx: Prisma.TransactionClient, partId: string, quantity: number) {
  const updated = await tx.sparePart.updateMany({
    where: { id: partId, stockQuantity: { gte: quantity } },
    data: { stockQuantity: { decrement: quantity } },
  });
  if (updated.count > 0) return true;
  if (await isBlockZeroStock()) return false;
  const part = await tx.sparePart.findUnique({ where: { id: partId }, select: { stockQuantity: true } });
  if (part && part.stockQuantity > 0) await tx.sparePart.update({ where: { id: partId }, data: { stockQuantity: 0 } });
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
  note?: string | null;
  expectedAt?: Date | null;
  createdById?: string | null;
}) {
  const part = await prisma.sparePart.findUnique({ where: { id: input.sparePartId } });
  if (!part) throw new HttpError(400, "Spare part not found");
  return prisma.partOrder.create({
    data: {
      sparePartId: part.id,
      quantity: input.quantity,
      serviceRequestId: input.serviceRequestId ?? null,
      supplier: input.supplier ?? null,
      note: input.note ?? null,
      expectedAt: input.expectedAt ?? null,
      createdById: input.createdById ?? null,
    },
  });
}

export { maybeAlertLowStock };
