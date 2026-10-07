import type { Prisma } from "@prisma/client";
import { HttpError } from "./httpError.js";
import { serializeNamed } from "./named.js";
import { prisma } from "./prisma.js";
import { isBlockZeroStock } from "./settings.js";

type PartIdentity = { id: string; name: string; nameUz: string; nameRu: string; nameEn: string; stockQuantity: number };

/** Takes from the central (warehouse) stock; refuses when there is not enough and zero stock is blocked. */
export async function decrementCentralStock(tx: Prisma.TransactionClient, part: PartIdentity, quantity: number) {
  const updated = await tx.sparePart.updateMany({
    where: { id: part.id, stockQuantity: { gte: quantity } },
    data: { stockQuantity: { decrement: quantity } },
  });
  if (updated.count === 0) {
    const latest = await tx.sparePart.findUnique({ where: { id: part.id } });
    const count = latest?.stockQuantity ?? 0;
    if (await isBlockZeroStock()) {
      throw new HttpError(400, `Only ${count} ${part.name} in stock`, "stockInsufficient", { count, ...serializeNamed(part) });
    }
    if (count > 0) await tx.sparePart.update({ where: { id: part.id }, data: { stockQuantity: 0 } });
  }
}

async function techQuantity(tx: Prisma.TransactionClient, technicianId: string, sparePartId: string) {
  const row = await tx.technicianStock.findUnique({ where: { technicianId_sparePartId: { technicianId, sparePartId } } });
  return row?.quantity ?? 0;
}

/**
 * A technician uses a part on a job: the part comes from what they carry first, the rest from the warehouse.
 * Every unit taken from the technician is logged against the job so a later reduction can put it back.
 */
export async function consumeForJob(tx: Prisma.TransactionClient, input: { technicianId: string; part: PartIdentity; quantity: number; requestId: string }) {
  const carried = await techQuantity(tx, input.technicianId, input.part.id);
  const fromTech = Math.min(carried, input.quantity);
  if (fromTech > 0) {
    await tx.technicianStock.update({
      where: { technicianId_sparePartId: { technicianId: input.technicianId, sparePartId: input.part.id } },
      data: { quantity: { decrement: fromTech } },
    });
    await tx.stockMovement.create({
      data: { sparePartId: input.part.id, technicianId: input.technicianId, kind: "used", quantity: fromTech, serviceRequestId: input.requestId },
    });
  }
  const rest = input.quantity - fromTech;
  if (rest > 0) await decrementCentralStock(tx, input.part, rest);
  return { fromTech, fromCentral: rest };
}

/** A part line gets smaller or is removed: units that came from the technician go back to them, the rest to the warehouse. */
export async function releaseFromJob(tx: Prisma.TransactionClient, input: { technicianId: string | null; sparePartId: string; quantity: number; requestId: string }) {
  let back = 0;
  if (input.technicianId) {
    const moves = await tx.stockMovement.findMany({
      where: { serviceRequestId: input.requestId, sparePartId: input.sparePartId, technicianId: input.technicianId, kind: { in: ["used", "unused"] } },
      select: { kind: true, quantity: true },
    });
    const outstanding = moves.reduce((sum, row) => sum + (row.kind === "used" ? row.quantity : -row.quantity), 0);
    back = Math.max(0, Math.min(input.quantity, outstanding));
    if (back > 0) {
      await tx.technicianStock.upsert({
        where: { technicianId_sparePartId: { technicianId: input.technicianId, sparePartId: input.sparePartId } },
        update: { quantity: { increment: back } },
        create: { technicianId: input.technicianId, sparePartId: input.sparePartId, quantity: back },
      });
      await tx.stockMovement.create({
        data: { sparePartId: input.sparePartId, technicianId: input.technicianId, kind: "unused", quantity: back, serviceRequestId: input.requestId },
      });
    }
  }
  const rest = input.quantity - back;
  if (rest > 0) await tx.sparePart.update({ where: { id: input.sparePartId }, data: { stockQuantity: { increment: rest } } });
}

/** Warehouse to technician. */
export async function issueToTechnician(input: { technicianId: string; sparePartId: string; quantity: number; by: { id: string; name: string }; note?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const part = await tx.sparePart.findUnique({ where: { id: input.sparePartId } });
    if (!part) throw new HttpError(400, "Spare part not found");
    const technician = await tx.staffUser.findUnique({ where: { id: input.technicianId }, select: { role: true, isActive: true } });
    if (!technician || technician.role !== "technician" || !technician.isActive) throw new HttpError(400, "Technician not found");
    const updated = await tx.sparePart.updateMany({ where: { id: part.id, stockQuantity: { gte: input.quantity } }, data: { stockQuantity: { decrement: input.quantity } } });
    if (updated.count === 0) {
      throw new HttpError(400, `Only ${part.stockQuantity} ${part.name} in stock`, "stockInsufficient", { count: part.stockQuantity, ...serializeNamed(part) });
    }
    await tx.technicianStock.upsert({
      where: { technicianId_sparePartId: { technicianId: input.technicianId, sparePartId: part.id } },
      update: { quantity: { increment: input.quantity } },
      create: { technicianId: input.technicianId, sparePartId: part.id, quantity: input.quantity },
    });
    await tx.stockMovement.create({
      data: { sparePartId: part.id, technicianId: input.technicianId, kind: "issue", quantity: input.quantity, note: input.note ?? null, createdById: input.by.id, createdByName: input.by.name },
    });
  });
}

/** Technician back to the warehouse. */
export async function returnFromTechnician(input: { technicianId: string; sparePartId: string; quantity: number; by: { id: string; name: string }; note?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const carried = await techQuantity(tx, input.technicianId, input.sparePartId);
    if (carried < input.quantity) throw new HttpError(400, `The technician only has ${carried}`, "techStockInsufficient", { count: carried });
    await tx.technicianStock.update({ where: { technicianId_sparePartId: { technicianId: input.technicianId, sparePartId: input.sparePartId } }, data: { quantity: { decrement: input.quantity } } });
    await tx.sparePart.update({ where: { id: input.sparePartId }, data: { stockQuantity: { increment: input.quantity } } });
    await tx.stockMovement.create({
      data: { sparePartId: input.sparePartId, technicianId: input.technicianId, kind: "return", quantity: input.quantity, note: input.note ?? null, createdById: input.by.id, createdByName: input.by.name },
    });
  });
}

/** What a technician carries now. */
export async function technicianStockList(technicianId: string) {
  const rows = await prisma.technicianStock.findMany({ where: { technicianId, quantity: { gt: 0 } }, include: { sparePart: true }, orderBy: { sparePart: { name: "asc" } } });
  return rows.map((row) => ({ sparePartId: row.sparePartId, quantity: row.quantity, ...serializeNamed(row.sparePart), productCategories: row.sparePart.productCategories }));
}
