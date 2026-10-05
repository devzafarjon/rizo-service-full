import type { Prisma, RequestStatus } from "@prisma/client";
import { writeAudit, type AuditActor } from "./audit.js";
import { HttpError } from "./httpError.js";
import { completionGaps, resolveJobFinancials, workInclude } from "./jobWork.js";
import { notifyRequestStatus } from "./notifyCustomer.js";
import { prisma } from "./prisma.js";
import { publishRequest } from "./realtime.js";
import { statusPatch } from "./requestLifecycle.js";
import { requestInclude, serializeRequest } from "./serializeRequest.js";
import { isTerminalStatus } from "./status.js";
import { tashkentCalendarDate } from "./displayId.js";
import { addMonths, parseDateOnly } from "./warranty.js";

export type StatusActor = { audit: AuditActor; role: "admin" | "technician" };

export const changeInclude = {
  ...requestInclude,
  ...workInclude,
  pauses: { orderBy: { pausedAt: "desc" as const } },
} satisfies Prisma.ServiceRequestInclude;

export type ChangeRecord = Prisma.ServiceRequestGetPayload<{ include: typeof changeInclude }>;

const ADMIN_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  new: ["in_progress", "paused", "completed", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "completed", "cancelled"],
  completed: ["in_progress", "picked_up"],
  picked_up: [],
  cancelled: ["new"],
};

const TECHNICIAN_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  new: ["in_progress", "paused", "completed"],
  in_progress: ["paused", "completed"],
  paused: ["in_progress", "completed"],
  completed: [],
  picked_up: [],
  cancelled: [],
};

export function canTransition(role: "admin" | "technician", from: RequestStatus, to: RequestStatus) {
  const table = role === "admin" ? ADMIN_TRANSITIONS : TECHNICIAN_TRANSITIONS;
  return table[from].includes(to);
}

export type PauseInput = { reason?: string; hours?: number };

/**
 * Moves a request to a new status: validates the transition, keeps pauses and timestamps in step,
 * resolves cost and warranty on completion, then notifies, audits and broadcasts.
 */
export async function changeRequestStatus(input: {
  requestId: string;
  next: RequestStatus;
  actor: StatusActor;
  pause?: PauseInput;
}): Promise<{ before: ChangeRecord; after: ChangeRecord }> {
  const before = await prisma.serviceRequest.findUnique({
    where: { id: input.requestId },
    include: changeInclude,
  });
  if (!before) throw new HttpError(404, "Service request not found");
  if (before.status === input.next) return { before, after: before };

  if (!canTransition(input.actor.role, before.status, input.next)) {
    throw new HttpError(400, "This status change is not allowed", "statusNotAllowed", {
      from: before.status,
      to: input.next,
    });
  }

  const now = new Date();
  const activePause = before.pauses.find((pause) => pause.resumedAt == null) ?? null;
  const data: Prisma.ServiceRequestUpdateInput = statusPatch(before, input.next, now);

  if (input.next === "paused") {
    if (!input.pause?.reason) throw new HttpError(400, "A pause reason is required", "pauseReasonRequired");
    if (input.pause.hours == null) throw new HttpError(400, "Set how long this pause should last", "pauseHoursRequired");
  }

  if (input.next === "completed") {
    const catalogServices = await prisma.serviceCatalogItem.count({
      where: { productCategories: { has: before.product.category } },
    });
    const gaps = completionGaps(before, { requireService: catalogServices > 0 });
    if (gaps.length > 0) {
      throw new HttpError(400, `Add ${joinGaps(gaps)} before completing`, "jobIncomplete", { gaps });
    }
    const financials = resolveJobFinancials(before, before.type, before.sale);
    Object.assign(data, {
      warrantyStatus: financials.warrantyStatus,
      isPaidRepair: financials.isPaidRepair,
      estimatedCost: financials.estimatedCost,
      finalCost: financials.finalCost,
      paymentStatus: financials.paymentStatus,
      resolutionType: before.type === "repair" ? before.resolutionType ?? "repair" : null,
    });
  }

  if (before.status === "completed" && input.next === "in_progress") {
    data.completedAt = null;
  }

  await prisma.$transaction(async (tx) => {
    if (activePause) {
      await tx.requestPause.update({ where: { id: activePause.id }, data: { resumedAt: now } });
    }
    if (input.next === "paused") {
      await tx.requestPause.create({
        data: {
          serviceRequestId: before.id,
          reason: input.pause!.reason!,
          customTimerHours: input.pause!.hours!,
          pausedAt: now,
        },
      });
    }
    await tx.serviceRequest.update({ where: { id: before.id }, data });
    if (input.next === "completed" && before.type === "installation" && before.saleId && before.sale) {
      // Warranty runs from the day the product was installed.
      const installedOn = parseDateOnly(tashkentCalendarDate(now));
      await tx.sale.update({
        where: { id: before.saleId },
        data: {
          installationDate: installedOn,
          warrantyExpiry: addMonths(installedOn, before.sale.warrantyMonths),
        },
      });
    }
  });

  const after = await prisma.serviceRequest.findUniqueOrThrow({
    where: { id: before.id },
    include: changeInclude,
  });

  publishRequest("request:updated", serializeRequest(after));
  await notifyRequestStatus(after);
  await writeAudit({
    actor: input.actor.audit,
    action: "request.status",
    entityType: "ServiceRequest",
    entityId: after.id,
    oldValue: { status: before.status },
    newValue: {
      status: after.status,
      ...(input.next === "completed" ? { finalCost: after.finalCost == null ? null : Number(after.finalCost) } : {}),
    },
  });
  if (
    input.next === "completed" &&
    (before.estimatedCost?.toString() !== after.estimatedCost?.toString() ||
      before.finalCost?.toString() !== after.finalCost?.toString())
  ) {
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

export { isTerminalStatus };
