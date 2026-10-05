import type { EstimateLineKind, Prisma } from "@prisma/client";
import { writeAudit, type AuditActor } from "./audit.js";
import { HttpError } from "./httpError.js";
import { serializeNamed } from "./named.js";
import { createCustomerNotification } from "./notifyCustomer.js";
import { notifyAdmins } from "./notifyStaff.js";
import { createPartOrder, maybeAlertLowStock, takeFromStock } from "./partOrders.js";
import { prisma } from "./prisma.js";
import { publishRequest } from "./realtime.js";
import { requestInclude, serializeRequest } from "./serializeRequest.js";
import { estimateValidDays } from "./settings.js";
import { formatRequestId } from "./displayId.js";
import { money } from "./warranty.js";

export type EstimateLineInput = {
  kind: EstimateLineKind;
  serviceCatalogItemId?: string | null;
  sparePartId?: string | null;
  name?: string;
  quantity?: number;
  unitPrice?: number;
  isOptional?: boolean;
};

export const estimateInclude = { lines: { orderBy: { id: "asc" as const } } } satisfies Prisma.EstimateInclude;
type EstimateRecord = Prisma.EstimateGetPayload<{ include: typeof estimateInclude }>;

export function estimateTotal(lines: Array<{ quantity: number; unitPrice: { toString(): string } | number; isSelected: boolean }>) {
  return lines.filter((line) => line.isSelected).reduce((sum, line) => sum + line.quantity * money(line.unitPrice), 0);
}

export async function serializeEstimate(estimate: EstimateRecord) {
  const serviceIds = estimate.lines.map((line) => line.serviceCatalogItemId).filter((id): id is string => Boolean(id));
  const partIds = estimate.lines.map((line) => line.sparePartId).filter((id): id is string => Boolean(id));
  const [services, parts] = await Promise.all([
    serviceIds.length ? prisma.serviceCatalogItem.findMany({ where: { id: { in: serviceIds } } }) : [],
    partIds.length ? prisma.sparePart.findMany({ where: { id: { in: partIds } } }) : [],
  ]);
  const named = new Map<string, ReturnType<typeof serializeNamed>>();
  for (const item of [...services, ...parts]) named.set(item.id, serializeNamed(item));
  const expired = estimate.status === "sent" && estimate.validUntil.getTime() < Date.now();
  return {
    id: estimate.id,
    status: expired ? ("expired" as const) : estimate.status,
    note: estimate.note,
    validUntil: estimate.validUntil.toISOString(),
    sentAt: estimate.sentAt?.toISOString() ?? null,
    approvedAt: estimate.approvedAt?.toISOString() ?? null,
    approvedBy: estimate.approvedBy,
    declinedAt: estimate.declinedAt?.toISOString() ?? null,
    declineReason: estimate.declineReason,
    createdByName: estimate.createdByName,
    createdAt: estimate.createdAt.toISOString(),
    total: estimateTotal(estimate.lines),
    lines: estimate.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      serviceCatalogItemId: line.serviceCatalogItemId,
      sparePartId: line.sparePartId,
      name: line.name,
      names: line.serviceCatalogItemId ? (named.get(line.serviceCatalogItemId) ?? null) : line.sparePartId ? (named.get(line.sparePartId) ?? null) : null,
      quantity: line.quantity,
      unitPrice: money(line.unitPrice),
      isOptional: line.isOptional,
      isSelected: line.isSelected,
      isFulfilled: line.isFulfilled,
    })),
  };
}

async function resolveLines(lines: EstimateLineInput[]) {
  const out: Prisma.EstimateLineCreateManyEstimateInput[] = [];
  for (const line of lines) {
    const quantity = Math.max(1, Math.round(line.quantity ?? 1));
    if (line.kind === "service" && line.serviceCatalogItemId) {
      const item = await prisma.serviceCatalogItem.findUnique({ where: { id: line.serviceCatalogItemId } });
      if (!item) throw new HttpError(400, "Service not found");
      out.push({ kind: "service", serviceCatalogItemId: item.id, name: item.name, quantity: 1, unitPrice: line.unitPrice ?? item.price, isOptional: Boolean(line.isOptional) });
    } else if (line.kind === "part" && line.sparePartId) {
      const part = await prisma.sparePart.findUnique({ where: { id: line.sparePartId } });
      if (!part) throw new HttpError(400, "Spare part not found");
      out.push({ kind: "part", sparePartId: part.id, name: part.name, quantity, unitPrice: line.unitPrice ?? part.price, isOptional: Boolean(line.isOptional) });
    } else {
      if (!line.name?.trim()) throw new HttpError(400, "Describe the estimate line", "estimateLineName");
      out.push({ kind: line.kind === "labor" ? "labor" : "other", name: line.name.trim(), quantity, unitPrice: Math.max(0, line.unitPrice ?? 0), isOptional: Boolean(line.isOptional) });
    }
  }
  return out;
}

export async function createEstimate(input: {
  requestId: string;
  lines: EstimateLineInput[];
  note?: string | null;
  validDays?: number;
  actor: AuditActor;
}) {
  const request = await prisma.serviceRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new HttpError(404, "Service request not found");
  if (input.lines.length === 0) throw new HttpError(400, "Add at least one line to the estimate", "estimateEmpty");
  const lines = await resolveLines(input.lines);
  const days = input.validDays ?? (await estimateValidDays());
  // A new estimate replaces any estimate that was never approved.
  await prisma.estimate.updateMany({
    where: { serviceRequestId: request.id, status: { in: ["draft", "sent"] } },
    data: { status: "expired" },
  });
  const created = await prisma.estimate.create({
    data: {
      serviceRequestId: request.id,
      note: input.note?.trim() || null,
      validUntil: new Date(Date.now() + days * 86_400_000),
      createdById: input.actor.id,
      createdByName: input.actor.name ?? null,
      lines: { createMany: { data: lines } },
    },
    include: estimateInclude,
  });
  await writeAudit({
    actor: input.actor,
    action: "estimate.create",
    entityType: "ServiceRequest",
    entityId: request.id,
    newValue: { estimateId: created.id, total: estimateTotal(created.lines) },
  });
  return created;
}

export async function latestEstimate(requestId: string) {
  return prisma.estimate.findFirst({ where: { serviceRequestId: requestId }, orderBy: { createdAt: "desc" }, include: estimateInclude });
}

export async function sendEstimate(estimateId: string, actor: AuditActor) {
  const estimate = await prisma.estimate.findUnique({ where: { id: estimateId }, include: estimateInclude });
  if (!estimate) throw new HttpError(404, "Estimate not found");
  if (estimate.status !== "draft" && estimate.status !== "sent") throw new HttpError(400, "This estimate can no longer be sent", "estimateClosed");
  const request = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: estimate.serviceRequestId }, include: { product: true } });
  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: "sent", sentAt: new Date() },
    include: estimateInclude,
  });
  await createCustomerNotification(request.customerId, request.id, `Estimate ready for ${formatRequestId(request.displayId)}`, "estimateSent", {
    displayId: request.displayId,
    total: estimateTotal(updated.lines),
  });
  await writeAudit({ actor, action: "estimate.send", entityType: "ServiceRequest", entityId: request.id, newValue: { estimateId: updated.id } });
  return updated;
}

/**
 * Approval turns the selected lines into real work lines: services and extras are recorded, parts are taken
 * from stock. Parts that are not on the shelf become part orders and the request waits for them.
 */
export async function approveEstimate(input: {
  estimateId: string;
  by: { kind: "customer" | "staff"; id: string; name: string };
  selectedOptionalLineIds?: string[];
  note?: string;
}) {
  const estimate = await prisma.estimate.findUnique({ where: { id: input.estimateId }, include: estimateInclude });
  if (!estimate) throw new HttpError(404, "Estimate not found");
  if (estimate.status !== "sent") throw new HttpError(400, "This estimate is not waiting for approval", "estimateNotPending");
  if (estimate.validUntil.getTime() < Date.now()) throw new HttpError(400, "This estimate has expired", "estimateExpired");
  const chosen = new Set(input.selectedOptionalLineIds ?? []);
  const request = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: estimate.serviceRequestId } });

  const result = await prisma.$transaction(async (tx) => {
    for (const line of estimate.lines) {
      if (line.isOptional) await tx.estimateLine.update({ where: { id: line.id }, data: { isSelected: chosen.has(line.id) } });
    }
    const fresh = await tx.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: estimateInclude });
    const shortages: Array<{ partId: string; quantity: number }> = [];
    for (const line of fresh.lines.filter((item) => item.isSelected)) {
      if (line.kind === "service" && line.serviceCatalogItemId) {
        const exists = await tx.requestServiceLine.findFirst({ where: { serviceRequestId: request.id, serviceCatalogItemId: line.serviceCatalogItemId } });
        if (!exists) {
          await tx.requestServiceLine.create({ data: { serviceRequestId: request.id, serviceCatalogItemId: line.serviceCatalogItemId, priceAtTime: line.unitPrice } });
        }
        await tx.estimateLine.update({ where: { id: line.id }, data: { isFulfilled: true } });
      } else if (line.kind === "part" && line.sparePartId) {
        const part = await tx.sparePart.findUniqueOrThrow({ where: { id: line.sparePartId } });
        const ok = await takeFromStock(tx, part.id, line.quantity);
        if (ok) {
          await tx.requestPartLine.create({
            data: { serviceRequestId: request.id, sparePartId: part.id, quantity: line.quantity, priceAtTime: line.unitPrice, costAtTime: part.costPrice },
          });
          await tx.estimateLine.update({ where: { id: line.id }, data: { isFulfilled: true } });
        } else {
          shortages.push({ partId: part.id, quantity: line.quantity });
        }
      } else {
        await tx.requestExtraExpense.create({
          data: { serviceRequestId: request.id, description: line.name, price: Number(line.unitPrice) * line.quantity },
        });
        await tx.estimateLine.update({ where: { id: line.id }, data: { isFulfilled: true } });
      }
    }
    const approved = await tx.estimate.update({
      where: { id: estimate.id },
      data: { status: "approved", approvedAt: new Date(), approvedBy: `${input.by.kind}:${input.by.name}` },
      include: estimateInclude,
    });
    await tx.serviceRequest.update({
      where: { id: request.id },
      data: {
        decision: "paid_repair",
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
        isPaidRepair: true,
        estimatedCost: estimateTotal(approved.lines),
      },
    });
    return { approved, shortages };
  });

  for (const shortage of result.shortages) {
    await createPartOrder({ sparePartId: shortage.partId, quantity: shortage.quantity, serviceRequestId: request.id, note: "Needed for an approved estimate" });
  }
  for (const line of result.approved.lines) if (line.sparePartId) await maybeAlertLowStock(line.sparePartId);

  await writeAudit({
    actor: { id: input.by.id, type: input.by.kind === "customer" ? "customer" : "staff", name: input.by.name },
    action: "estimate.approve",
    entityType: "ServiceRequest",
    entityId: request.id,
    newValue: { estimateId: estimate.id, total: estimateTotal(result.approved.lines), by: input.by.kind },
  });
  await notifyAdmins({
    message: `Estimate for ${formatRequestId(request.displayId)} was approved`,
    code: "estimateApproved",
    serviceRequestId: request.id,
    params: { displayId: request.displayId, by: input.by.kind },
  });
  return { estimate: result.approved, waitingForParts: result.shortages.length > 0 };
}

export async function declineEstimate(input: { estimateId: string; reason: string; by: { kind: "customer" | "staff"; id: string; name: string } }) {
  const estimate = await prisma.estimate.findUnique({ where: { id: input.estimateId } });
  if (!estimate) throw new HttpError(404, "Estimate not found");
  if (estimate.status !== "sent") throw new HttpError(400, "This estimate is not waiting for approval", "estimateNotPending");
  const request = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: estimate.serviceRequestId } });
  const updated = await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: "declined", declinedAt: new Date(), declineReason: input.reason.trim() || null },
    include: estimateInclude,
  });
  await writeAudit({
    actor: { id: input.by.id, type: input.by.kind === "customer" ? "customer" : "staff", name: input.by.name },
    action: "estimate.decline",
    entityType: "ServiceRequest",
    entityId: request.id,
    newValue: { estimateId: estimate.id, reason: input.reason, by: input.by.kind },
  });
  await notifyAdmins({
    message: `Estimate for ${formatRequestId(request.displayId)} was declined`,
    code: "estimateDeclined",
    serviceRequestId: request.id,
    params: { displayId: request.displayId, reason: input.reason },
  });
  return updated;
}

/** Part lines of an approved estimate that were waiting for stock: try again now that stock may have arrived. */
export async function fulfilPendingParts(requestId: string) {
  const estimate = await prisma.estimate.findFirst({
    where: { serviceRequestId: requestId, status: "approved" },
    orderBy: { createdAt: "desc" },
    include: estimateInclude,
  });
  if (!estimate) return { pending: 0 };
  let pending = 0;
  for (const line of estimate.lines.filter((item) => item.kind === "part" && item.isSelected && !item.isFulfilled && item.sparePartId)) {
    const done = await prisma.$transaction(async (tx) => {
      const part = await tx.sparePart.findUniqueOrThrow({ where: { id: line.sparePartId! } });
      if (!(await takeFromStock(tx, part.id, line.quantity))) return false;
      await tx.requestPartLine.create({
        data: { serviceRequestId: requestId, sparePartId: part.id, quantity: line.quantity, priceAtTime: line.unitPrice, costAtTime: part.costPrice },
      });
      await tx.estimateLine.update({ where: { id: line.id }, data: { isFulfilled: true } });
      return true;
    });
    if (done) await maybeAlertLowStock(line.sparePartId!);
    else pending += 1;
  }
  return { pending };
}

/** Expires estimates the customer never answered. */
export async function expireOldEstimates() {
  const old = await prisma.estimate.findMany({ where: { status: "sent", validUntil: { lt: new Date() } }, include: { serviceRequest: true } });
  for (const estimate of old) {
    await prisma.estimate.update({ where: { id: estimate.id }, data: { status: "expired" } });
    await createCustomerNotification(estimate.serviceRequest.customerId, estimate.serviceRequestId, `Estimate for ${formatRequestId(estimate.serviceRequest.displayId)} expired`, "estimateExpired", {
      displayId: estimate.serviceRequest.displayId,
    });
  }
  return old.length;
}

export async function publishFresh(requestId: string) {
  const fresh = await prisma.serviceRequest.findUnique({ where: { id: requestId }, include: requestInclude });
  if (fresh) publishRequest("request:updated", serializeRequest(fresh));
}
