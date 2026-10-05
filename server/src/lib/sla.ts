import { jobTimer } from "./techBoard.js";
import { OPEN_STATUSES, isTerminalStatus } from "./status.js";
import { writeAudit } from "./audit.js";
import { notifyAdmins } from "./notifyStaff.js";
import { formatRequestId } from "./displayId.js";
import { prisma } from "./prisma.js";
import { expireOldEstimates } from "./estimates.js";
import { createCustomerNotification } from "./notifyCustomer.js";
import type { RequestStatus } from "@prisma/client";

type TimerInput = {
  status: RequestStatus;
  createdAt: Date;
  statusChangedAt?: Date | null;
  assignedAt: Date | null;
  acceptedAt: Date | null;
  pauses: Array<{ resumedAt: Date | null; pausedAt: Date; customTimerHours: { toString(): string } | number }>;
};

export function slaTimerFor(job: TimerInput, now = Date.now()) {
  const activePause = job.pauses.find((pause) => pause.resumedAt == null) ?? null;
  const timer = jobTimer(job.status, job, activePause);
  if (!timer) return null;
  const remaining = timer.startsAt.getTime() + timer.durationMs - now;
  return {
    startsAt: timer.startsAt.toISOString(),
    durationMs: timer.durationMs,
    remainingMs: remaining,
    overdueMs: remaining < 0 ? -remaining : 0,
    isOverdue: remaining <= 0,
  };
}

export async function syncOverdueRequests() {
  const open = await prisma.serviceRequest.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: { pauses: true, product: true },
  });
  const now = Date.now();
  let flagged = 0;
  for (const job of open) {
    const timer = slaTimerFor(job, now);
    if (!timer?.isOverdue) {
      if (job.overdueAt) {
        await prisma.serviceRequest.update({
          where: { id: job.id },
          data: { overdueAt: null },
        });
      }
      continue;
    }
    if (!job.overdueAt) {
      await prisma.serviceRequest.update({
        where: { id: job.id },
        data: { overdueAt: new Date(now - timer.overdueMs) },
      });
      flagged += 1;
    }
    if (!job.overdueNotifiedAt) {
      await prisma.serviceRequest.update({
        where: { id: job.id },
        data: { overdueNotifiedAt: new Date() },
      });
      await notifyAdmins({
        message: `${formatRequestId(job.displayId)} is overdue`,
        code: "overdue",
        serviceRequestId: job.id,
        params: {
          displayId: job.displayId,
          product: job.product.name,
          overdueMs: timer.overdueMs,
        },
      });
      await writeAudit({
        actor: { id: "system", type: "system", name: "sla" },
        action: "request.overdue",
        entityType: "ServiceRequest",
        entityId: job.id,
        newValue: { displayId: job.displayId, overdueMs: timer.overdueMs },
      });
    }
  }
  return { scanned: open.length, flagged };
}

export { isTerminalStatus };

/** A reminder the day before a scheduled visit (sent once per request). */
export async function sendVisitReminders() {
  const soon = new Date(Date.now() + 24 * 3_600_000);
  const due = await prisma.serviceRequest.findMany({
    where: { scheduledAt: { gt: new Date(), lte: soon }, status: { in: OPEN_STATUSES } },
    include: { product: true },
  });
  let sent = 0;
  for (const request of due) {
    const already = await prisma.notification.count({ where: { serviceRequestId: request.id, code: "visitReminder" } });
    if (already > 0) continue;
    await createCustomerNotification(request.customerId, request.id, `Reminder: your visit for ${formatRequestId(request.displayId)} is scheduled soon`, "visitReminder", {
      displayId: request.displayId,
      at: request.scheduledAt?.toISOString(),
    });
    sent += 1;
  }
  return sent;
}

export async function runHousekeeping() {
  const expired = await expireOldEstimates();
  const reminders = await sendVisitReminders();
  return { expired, reminders };
}
