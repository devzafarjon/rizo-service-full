import { NEW_TIMER_MS, PROGRESS_TIMER_MS, isDoneStatus, techColumn } from "./techBoard.js";
import { writeAudit } from "./audit.js";
import { notifyAdmins } from "./notifyStaff.js";
import { formatRequestId } from "./displayId.js";
import { prisma } from "./prisma.js";

type TimerInput = {
  id: string;
  displayId: string;
  type: "installation" | "repair";
  status: Parameters<typeof isDoneStatus>[0];
  createdAt: Date;
  acceptedAt: Date | null;
  pauses: Array<{ resumedAt: Date | null; pausedAt: Date; customTimerHours: { toString(): string } | number }>;
};

export function slaTimerFor(job: TimerInput, now = Date.now()) {
  const activePause = job.pauses.find((pause) => pause.resumedAt == null) ?? null;
  const column = techColumn(job.type, job.status, Boolean(activePause));
  if (column === "completed") return null;
  const startsAt =
    column === "paused" && activePause
      ? activePause.pausedAt
      : column === "new"
        ? job.createdAt
        : job.acceptedAt ?? job.createdAt;
  const durationMs =
    column === "paused" && activePause
      ? Number(activePause.customTimerHours) * 60 * 60 * 1000
      : column === "new"
        ? NEW_TIMER_MS
        : PROGRESS_TIMER_MS;
  const remaining = startsAt.getTime() + durationMs - now;
  return {
    startsAt: startsAt.toISOString(),
    durationMs,
    remainingMs: remaining,
    overdueMs: remaining < 0 ? -remaining : 0,
    isOverdue: remaining <= 0,
  };
}

export async function syncOverdueRequests() {
  const open = await prisma.serviceRequest.findMany({
    where: { status: { notIn: ["completed", "closed", "replaced"] } },
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
