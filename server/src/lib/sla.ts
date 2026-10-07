import { jobTimer } from "./techBoard.js";
import { OPEN_STATUSES, isTerminalStatus } from "./status.js";
import { writeAudit } from "./audit.js";
import { notifyAdmins } from "./notifyStaff.js";
import { formatRequestId } from "./displayId.js";
import { prisma } from "./prisma.js";
import { expireOldEstimates } from "./estimates.js";
import { createCustomerNotification } from "./notifyCustomer.js";
import { getAppSettings } from "./settings.js";
import { tashkentCalendarDate } from "./displayId.js";
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
      if (job.overdueAt || job.escalationLevel > 0) {
        await prisma.serviceRequest.update({
          where: { id: job.id },
          data: { overdueAt: null, escalationLevel: 0, escalatedAt: null },
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
  return { scanned: open.length, flagged, escalated: await escalateOverdueRequests(open, now) };
}

/**
 * Overdue first tells the admins (above). If nobody has moved the job after `escalation_hours` it is escalated
 * (a second alert that also goes to the admin chat); after `escalation_hours_urgent` it becomes urgent.
 */
async function escalateOverdueRequests(open: Array<{ id: string; displayId: string; priority: string; escalationLevel: number; product: { name: string }; assignedTechnicianId: string | null }>, now: number) {
  const { escalationHours, escalationHoursUrgent } = await getAppSettings();
  let escalated = 0;
  for (const job of open) {
    const fresh = await prisma.serviceRequest.findUnique({ where: { id: job.id }, select: { overdueAt: true, escalationLevel: true } });
    if (!fresh?.overdueAt) continue;
    const overdueHours = (now - fresh.overdueAt.getTime()) / 3_600_000;
    const level = overdueHours >= escalationHoursUrgent ? 2 : overdueHours >= escalationHours ? 1 : 0;
    if (level <= fresh.escalationLevel) continue;
    await prisma.serviceRequest.update({
      where: { id: job.id },
      data: { escalationLevel: level, escalatedAt: new Date(), ...(level === 2 && job.priority !== "urgent" ? { priority: "urgent" } : {}) },
    });
    await notifyAdmins({
      message: `${formatRequestId(job.displayId)} is still overdue (level ${level})`,
      code: "escalation",
      serviceRequestId: job.id,
      params: { displayId: job.displayId, product: job.product.name, level, hours: Math.floor(overdueHours) },
    });
    await writeAudit({
      actor: { id: "system", type: "system", name: "sla" },
      action: "request.escalated",
      entityType: "ServiceRequest",
      entityId: job.id,
      newValue: { level, hours: Math.floor(overdueHours) },
    });
    escalated += 1;
  }
  return escalated;
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

/** Tells a customer once, a few weeks ahead, that the warranty of a product is about to end (and that a plan is available). */
export async function sendWarrantyExpiryNotices() {
  const { warrantyExpiryNoticeDays } = await getAppSettings();
  if (warrantyExpiryNoticeDays <= 0) return 0;
  const today = new Date(`${tashkentCalendarDate(new Date())}T00:00:00.000Z`);
  const until = new Date(today.getTime() + warrantyExpiryNoticeDays * 86_400_000);
  const sales = await prisma.sale.findMany({
    where: { voidedAt: null, warrantyMonths: { gt: 0 }, warrantyExpiry: { gte: today, lte: until } },
    include: { product: true },
  });
  let sent = 0;
  for (const sale of sales) {
    const already = await prisma.notification.count({ where: { customerId: sale.customerId, code: "warrantyExpiring", params: { path: ["saleId"], equals: sale.id } } });
    if (already > 0) continue;
    const expiry = sale.warrantyExpiry.toISOString().slice(0, 10);
    await createCustomerNotification(sale.customerId, null, `The warranty for ${sale.product.name} ends on ${expiry}.`, "warrantyExpiring", { saleId: sale.id, product: sale.product.name, until: expiry });
    sent += 1;
  }
  return sent;
}

export async function runHousekeeping() {
  const expired = await expireOldEstimates();
  const reminders = await sendVisitReminders();
  const warrantyNotices = await sendWarrantyExpiryNotices();
  return { expired, reminders, warrantyNotices };
}
