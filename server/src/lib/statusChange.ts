import type { Prisma, RequestStatus } from "@prisma/client";
import { writeAudit, type AuditActor } from "./audit.js";
import { HttpError } from "./httpError.js";
import { completionGaps, coverageOf, resolveJobFinancials, workInclude } from "./jobWork.js";
import { notifyRequestStatus } from "./notifyCustomer.js";
import { prisma } from "./prisma.js";
import { publishRequest } from "./realtime.js";
import { statusPatch } from "./requestLifecycle.js";
import { requestInclude, serializeRequest } from "./serializeRequest.js";
import { canTransition, isDoneStatus, type StaffRoleName } from "./status.js";
import { tashkentCalendarDate } from "./displayId.js";
import { getSetting, repairWarrantyDays } from "./settings.js";
import { refreshPaymentStatus } from "./payments.js";
import { addMonths, computeWarrantyStatus, parseDateOnly, warrantyExpiryFor } from "./warranty.js";

export type StatusActor = { audit: AuditActor; role: StaffRoleName | "system" };

export const changeInclude = {
  ...requestInclude,
  ...workInclude,
  pauses: { orderBy: { pausedAt: "desc" as const } },
} satisfies Prisma.ServiceRequestInclude;

export type ChangeRecord = Prisma.ServiceRequestGetPayload<{ include: typeof changeInclude }>;

export type PauseInput = { reason?: string; hours?: number };

const FINISHING: RequestStatus[] = ["ready", "completed", "replaced"];

/** Whether the customer would pay for this repair, taking a staff decision into account. */
export function isEffectivelyPaid(request: { decision: string | null; warrantyStatus: string; sale: { warrantyMonths: number; warrantyExpiry: Date } | null; type: string }) {
  if (request.type !== "repair") return false;
  if (request.decision === "paid_repair") return true;
  if (request.decision === "warranty_repair") return false;
  const status = request.sale ? computeWarrantyStatus(request.sale.warrantyMonths, request.sale.warrantyExpiry) : request.warrantyStatus;
  return status !== "in_warranty";
}

/**
 * Moves a request to a new status: validates the transition for the actor's role, keeps pauses and timestamps
 * in step, resolves cost and warranty when the work finishes, then notifies, audits and broadcasts.
 */
export async function changeRequestStatus(input: {
  requestId: string;
  next: RequestStatus;
  actor: StatusActor;
  pause?: PauseInput;
  /** Reason shown to the customer for rejected / cancelled requests. */
  reason?: string;
}): Promise<{ before: ChangeRecord; after: ChangeRecord }> {
  const before = await prisma.serviceRequest.findUnique({ where: { id: input.requestId }, include: changeInclude });
  if (!before) throw new HttpError(404, "Service request not found");
  if (before.status === input.next) return { before, after: before };

  const system = input.actor.role === "system";
  if (!system && !canTransition(input.actor.role as StaffRoleName, before.type, before.status, input.next)) {
    throw new HttpError(400, "This status change is not allowed", "statusNotAllowed", { from: before.status, to: input.next });
  }

  const now = new Date();
  const activePause = before.pauses.find((pause) => pause.resumedAt == null) ?? null;
  const data: Prisma.ServiceRequestUpdateInput = statusPatch(before, input.next, now);

  if (input.next === "paused") {
    if (!input.pause?.reason) throw new HttpError(400, "A pause reason is required", "pauseReasonRequired");
    if (input.pause.hours == null) throw new HttpError(400, "Set how long this pause should last", "pauseHoursRequired");
  }

  // A paid repair does not start until the customer has agreed to an estimate.
  if (
    !system &&
    before.type === "repair" &&
    (input.next === "in_progress" || input.next === "awaiting_parts") &&
    ["new", "diagnosing", "awaiting_decision"].includes(before.status) &&
    isEffectivelyPaid(before) &&
    (await getSetting("require_estimate_for_paid_repair")) !== "false"
  ) {
    const approved = await prisma.estimate.count({ where: { serviceRequestId: before.id, status: "approved" } });
    if (approved === 0) throw new HttpError(400, "A paid repair needs an approved estimate first", "estimateRequired");
  }

  if (input.next === "rejected") {
    const reason = (input.reason ?? before.rejectionReason ?? "").trim();
    if (!reason) throw new HttpError(400, "Explain why the request is rejected", "rejectionReasonRequired");
    data.rejectionReason = reason;
  }

  if (FINISHING.includes(input.next)) {
    const catalogServices = await prisma.serviceCatalogItem.count({ where: { productCategories: { has: before.product.category } } });
    const asReplacement = input.next === "replaced";
    const gaps = completionGaps({ ...before, resolutionType: asReplacement ? "replace" : before.resolutionType }, { requireService: catalogServices > 0 });
    // Office decisions (a replacement handed over at the counter) are recorded by the system and skip the field checklist.
    if (!system && gaps.length > 0) throw new HttpError(400, `Add ${joinGaps(gaps)} before completing`, "jobIncomplete", { gaps });
    const financials = resolveJobFinancials(before, before.type, before.sale, {
      coverage: coverageOf(before.product),
      forcePaid: before.decision === "paid_repair",
      forceFree: before.decision === "warranty_repair",
    });
    const paused = before.pauses.reduce((sum, pause) => sum + ((pause.resumedAt ?? now).getTime() - pause.pausedAt.getTime()), 0);
    const worked = before.acceptedAt ? Math.max(0, Math.round((now.getTime() - before.acceptedAt.getTime() - paused) / 60_000)) : null;
    Object.assign(data, {
      warrantyStatus: financials.warrantyStatus,
      isPaidRepair: financials.isPaidRepair,
      estimatedCost: financials.estimatedCost,
      finalCost: financials.finalCost,
      paymentStatus: financials.paymentStatus,
      resolutionType: asReplacement ? "replace" : before.type === "repair" ? (before.resolutionType ?? "repair") : null,
      workedMinutes: worked,
    });
    if (before.type === "repair" && !asReplacement) {
      // The repair itself carries a short warranty; a repeat failure inside it is free.
      const days = await repairWarrantyDays();
      data.repairWarrantyUntil = new Date(parseDateOnly(tashkentCalendarDate(now)).getTime() + days * 86_400_000);
    }
  }

  if (before.status === "ready" || before.status === "completed") {
    if (input.next === "in_progress") data.completedAt = null;
  }

  await prisma.$transaction(async (tx) => {
    if (activePause) await tx.requestPause.update({ where: { id: activePause.id }, data: { resumedAt: now } });
    if (input.next === "paused") {
      await tx.requestPause.create({
        data: { serviceRequestId: before.id, reason: input.pause!.reason!, customTimerHours: input.pause!.hours!, pausedAt: now },
      });
    }
    await tx.serviceRequest.update({ where: { id: before.id }, data });
    if (isDoneStatus(input.next) && before.type === "installation" && before.saleId && before.sale && before.product.warrantyStartsOn === "installation") {
      // Warranty runs from the day the product was installed.
      const installedOn = parseDateOnly(tashkentCalendarDate(now));
      await tx.sale.update({
        where: { id: before.saleId },
        data: {
          installationDate: installedOn,
          warrantyExpiry: addMonths(installedOn, before.sale.warrantyMonths + before.sale.extensionMonths),
        },
      });
    }
  });

  const after = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: before.id }, include: changeInclude });
  if (FINISHING.includes(input.next)) await refreshPaymentStatus(after.id);

  publishRequest("request:updated", serializeRequest(after));
  await notifyRequestStatus(after, input.next === "rejected" || input.next === "cancelled" ? { reason: input.reason ?? after.rejectionReason ?? "" } : undefined);
  await writeAudit({
    actor: input.actor.audit,
    action: "request.status",
    entityType: "ServiceRequest",
    entityId: after.id,
    oldValue: { status: before.status },
    newValue: {
      status: after.status,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(FINISHING.includes(input.next) ? { finalCost: after.finalCost == null ? null : Number(after.finalCost) } : {}),
    },
  });
  if (FINISHING.includes(input.next) && (before.estimatedCost?.toString() !== after.estimatedCost?.toString() || before.finalCost?.toString() !== after.finalCost?.toString())) {
    await writeAudit({
      actor: input.actor.audit,
      action: "request.cost",
      entityType: "ServiceRequest",
      entityId: after.id,
      oldValue: {
        estimatedCost: before.estimatedCost == null ? null : Number(before.estimatedCost),
        finalCost: before.finalCost == null ? null : Number(before.finalCost),
      },
      newValue: {
        estimatedCost: after.estimatedCost == null ? null : Number(after.estimatedCost),
        finalCost: after.finalCost == null ? null : Number(after.finalCost),
      },
    });
  }
  return { before, after };
}

function joinGaps(gaps: string[]) {
  const labels: Record<string, string> = {
    service: "at least one service",
    part: "at least one spare part",
    photo: "at least one photo",
    replacement: "the replacement product and serial number",
  };
  const text = gaps.map((gap) => labels[gap] ?? gap);
  if (text.length === 1) return text[0];
  if (text.length === 2) return `${text[0]} and ${text[1]}`;
  return `${text.slice(0, -1).join(", ")}, and ${text[text.length - 1]}`;
}

export { warrantyExpiryFor };
