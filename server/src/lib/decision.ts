import type { RequestDecision } from "@prisma/client";
import { writeAudit, type AuditActor } from "./audit.js";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";
import { refreshPaymentStatus } from "./payments.js";
import { changeInclude, changeRequestStatus, isEffectivelyPaid, type StatusActor } from "./statusChange.js";
import type { StaffRoleName } from "./status.js";

const DECIDABLE = ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress"];

/**
 * The decision on a repair: warranty repair, paid repair, replacement, refund or rejection.
 * Rejections must carry a reason the customer can read.
 */
export async function applyDecision(input: {
  requestId: string;
  decision: RequestDecision;
  note?: string | null;
  rejectionReason?: string | null;
  refundAmount?: number | null;
  refundMethod?: "cash" | "card" | "transfer" | "payme" | "click" | "other";
  returnReasonId?: string | null;
  /** Grant a warranty repair even though the warranty has ended (goodwill); recorded in the audit log. */
  override?: boolean;
  replacement?: { productId: string; serialNumber: string } | null;
  actor: AuditActor;
  role: StaffRoleName;
}) {
  const request = await prisma.serviceRequest.findUnique({ where: { id: input.requestId }, include: changeInclude });
  if (!request) throw new HttpError(404, "Service request not found");
  if (request.type !== "repair") throw new HttpError(400, "Only repairs have a decision", "decisionRepairOnly");
  if (!DECIDABLE.includes(request.status)) throw new HttpError(400, "This request is already closed", "requestClosed");

  const statusActor: StatusActor = { audit: input.actor, role: "system" };
  const now = new Date();
  const common = { decision: input.decision, decisionNote: input.note?.trim() || null, decidedAt: now };

  switch (input.decision) {
    case "warranty_repair": {
      const warranty = isEffectivelyPaid({ ...request, decision: null });
      if (warranty && !input.override) throw new HttpError(400, "The warranty has ended. Choose a paid repair or grant it as goodwill.", "warrantyEnded");
      await prisma.serviceRequest.update({ where: { id: request.id }, data: { ...common, isPaidRepair: false, paymentStatus: "not_required" } });
      if (["new", "diagnosing", "awaiting_decision"].includes(request.status)) {
        await changeRequestStatus({ requestId: request.id, next: "in_progress", actor: statusActor });
      }
      break;
    }
    case "paid_repair": {
      await prisma.serviceRequest.update({ where: { id: request.id }, data: { ...common, isPaidRepair: true, paymentStatus: "pending" } });
      // The customer must agree to an estimate before work starts, so the request waits for that decision.
      if (["new", "diagnosing"].includes(request.status)) {
        await changeRequestStatus({ requestId: request.id, next: "awaiting_decision", actor: statusActor });
      }
      break;
    }
    case "replace": {
      await prisma.serviceRequest.update({ where: { id: request.id }, data: { ...common, resolutionType: "replace" } });
      if (input.replacement) {
        const product = await prisma.product.findUnique({ where: { id: input.replacement.productId } });
        if (!product) throw new HttpError(400, "Replacement product not found");
        await prisma.replacementItem.upsert({
          where: { serviceRequestId: request.id },
          update: { productId: product.id, serialNumber: input.replacement.serialNumber.trim() },
          create: { serviceRequestId: request.id, productId: product.id, serialNumber: input.replacement.serialNumber.trim() },
        });
        await changeRequestStatus({ requestId: request.id, next: "replaced", actor: statusActor });
      } else if (["new", "diagnosing", "awaiting_decision"].includes(request.status)) {
        // The technician records the new product and serial number when handing it over.
        await changeRequestStatus({ requestId: request.id, next: "in_progress", actor: statusActor });
      }
      break;
    }
    case "refund": {
      await prisma.serviceRequest.update({
        where: { id: request.id },
        data: { ...common, resolutionType: "refund", returnReasonId: input.returnReasonId ?? null },
      });
      if (input.refundAmount && input.refundAmount > 0) {
        await prisma.payment.create({
          data: {
            serviceRequestId: request.id,
            kind: "refund",
            method: input.refundMethod ?? "cash",
            amount: input.refundAmount,
            note: input.note?.trim() || "Refund",
            createdById: input.actor.id,
            createdByName: input.actor.name ?? null,
          },
        });
      }
      await changeRequestStatus({ requestId: request.id, next: "refunded", actor: statusActor });
      await refreshPaymentStatus(request.id);
      break;
    }
    case "reject": {
      const reason = (input.rejectionReason ?? "").trim();
      if (!reason) throw new HttpError(400, "Explain why the request is rejected", "rejectionReasonRequired");
      await prisma.serviceRequest.update({ where: { id: request.id }, data: { ...common, rejectionReason: reason } });
      await changeRequestStatus({ requestId: request.id, next: "rejected", actor: statusActor, reason });
      break;
    }
  }

  await writeAudit({
    actor: input.actor,
    action: "request.decision",
    entityType: "ServiceRequest",
    entityId: request.id,
    oldValue: { decision: request.decision },
    newValue: { decision: input.decision, ...(input.override ? { override: true } : {}), ...(input.note ? { note: input.note } : {}) },
  });
  return prisma.serviceRequest.findUniqueOrThrow({ where: { id: request.id }, include: changeInclude });
}
