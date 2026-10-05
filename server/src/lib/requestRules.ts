import type { ServiceType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { OPEN_STATUSES } from "./status.js";

type Identity = { customerId: string; saleId?: string | null; serialNumber?: string | null; productId: string };

function identityFilter(input: Identity) {
  const or: Array<Record<string, unknown>> = [];
  if (input.saleId) or.push({ saleId: input.saleId });
  if (input.serialNumber) or.push({ serialNumber: input.serialNumber });
  // Without a sale or serial the best we know is this customer's device of the same model.
  if (or.length === 0) or.push({ customerId: input.customerId, productId: input.productId, saleId: null });
  return { OR: or };
}

/** An open request of the same type for the same unit: a likely duplicate (or an attempt to claim twice). */
export async function findDuplicate(input: Identity & { type: ServiceType }) {
  return prisma.serviceRequest.findFirst({
    where: { type: input.type, status: { in: OPEN_STATUSES }, ...identityFilter(input) },
    orderBy: { createdAt: "desc" },
    select: { id: true, displayId: true, status: true, createdAt: true },
  });
}

/**
 * A repeat failure: the same unit came back after an earlier finished repair within 12 months.
 * `coveredByRepairWarranty` means the earlier repair itself is still under its own warranty.
 */
export async function detectRepeat(input: Identity, now = new Date()) {
  const since = new Date(now.getTime() - 365 * 86_400_000);
  const previous = await prisma.serviceRequest.findFirst({
    where: {
      type: "repair",
      status: { in: ["ready", "completed", "picked_up"] },
      completedAt: { gte: since },
      ...identityFilter(input),
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, displayId: true, repairWarrantyUntil: true },
  });
  if (!previous) return null;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const covered = Boolean(previous.repairWarrantyUntil && previous.repairWarrantyUntil.getTime() >= today.getTime());
  return { previous, coveredByRepairWarranty: covered };
}
