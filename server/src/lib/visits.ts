import type { TechnicianType } from "@prisma/client";
import { writeAudit, type AuditActor } from "./audit.js";
import { tashkentCalendarDate } from "./displayId.js";
import { HttpError } from "./httpError.js";
import { notifyAdmins } from "./notifyStaff.js";
import { createCustomerNotification } from "./notifyCustomer.js";
import { prisma } from "./prisma.js";
import { publishRequest } from "./realtime.js";
import { OPEN_STATUSES } from "./status.js";
import { getAppSettings, getVisitSlots } from "./settings.js";

const DAY_MS = 86_400_000;
export const MAX_BOOKING_DAYS = 30;

/** Uzbekistan has no daylight saving: Tashkent is always UTC+5. */
export function tashkentDayRange(date: string) {
  const from = new Date(`${date}T00:00:00+05:00`);
  return { from, to: new Date(from.getTime() + DAY_MS) };
}

export function slotStart(date: string, slot: string) {
  return new Date(`${date}T${slot.slice(0, 5)}:00+05:00`);
}

function assertDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00+05:00`).getTime())) {
    throw new HttpError(400, "Use a valid date (YYYY-MM-DD)");
  }
  const today = tashkentCalendarDate(new Date());
  if (date < today) throw new HttpError(400, "Choose a date that has not passed", "visitInPast");
  const last = tashkentCalendarDate(new Date(Date.now() + MAX_BOOKING_DAYS * DAY_MS));
  if (date > last) throw new HttpError(400, `Visits can be booked up to ${MAX_BOOKING_DAYS} days ahead`, "visitTooFar");
}

type SlotQuery = {
  date: string;
  technicianType: TechnicianType;
  serviceCenterId?: string | null;
  /** The request being moved: its own booking does not count against capacity. */
  ignoreRequestId?: string;
  /** Limit to one technician (the one already assigned). */
  technicianId?: string | null;
};

/** Booking windows of a day with how many visits can still be taken in each. */
export async function availableSlots(query: SlotQuery) {
  assertDate(query.date);
  const [slots, settings] = await Promise.all([getVisitSlots(), getAppSettings()]);
  const capacity = settings.visitsPerTechnicianPerDay;
  const { from, to } = tashkentDayRange(query.date);

  const technicians = await prisma.staffUser.findMany({
    where: {
      role: "technician",
      isActive: true,
      technicianType: query.technicianType,
      ...(query.technicianId ? { id: query.technicianId } : {}),
      ...(query.technicianType === "service_center" && query.serviceCenterId ? { serviceCenterId: query.serviceCenterId } : {}),
    },
    select: { id: true },
  });
  const ids = technicians.map((tech) => tech.id);
  const off = await prisma.technicianSchedule.findMany({
    where: { technicianId: { in: ids }, date: new Date(`${query.date}T00:00:00.000Z`), isWorking: false },
    select: { technicianId: true },
  });
  const offIds = new Set(off.map((row) => row.technicianId));
  const working = ids.filter((id) => !offIds.has(id));

  const booked = await prisma.serviceRequest.findMany({
    where: {
      scheduledAt: { gte: from, lt: to },
      status: { in: OPEN_STATUSES },
      technicianTypeRequired: query.technicianType,
      ...(query.ignoreRequestId ? { id: { not: query.ignoreRequestId } } : {}),
    },
    select: { assignedTechnicianId: true, scheduledAt: true, visitSlot: true },
  });
  const perTech = new Map<string, number>();
  const slotsByTech = new Map<string, Set<string>>();
  const unassignedBySlot = new Map<string, number>();
  for (const visit of booked) {
    const slot = visit.visitSlot ?? "";
    if (visit.assignedTechnicianId) {
      perTech.set(visit.assignedTechnicianId, (perTech.get(visit.assignedTechnicianId) ?? 0) + 1);
      const set = slotsByTech.get(visit.assignedTechnicianId) ?? new Set<string>();
      set.add(slot);
      slotsByTech.set(visit.assignedTechnicianId, set);
    } else {
      unassignedBySlot.set(slot, (unassignedBySlot.get(slot) ?? 0) + 1);
    }
  }

  const earliest = Date.now() + 60 * 60_000; // a slot that starts within the hour is no longer offered
  return slots.map((slot) => {
    const free = working.filter((id) => (perTech.get(id) ?? 0) < capacity && !slotsByTech.get(id)?.has(slot));
    const left = Math.max(0, free.length - (unassignedBySlot.get(slot) ?? 0));
    return { slot, left, free: left > 0 && slotStart(query.date, slot).getTime() > earliest, technicianIds: free };
  });
}

type ScheduleInput = {
  requestId: string;
  date: string;
  slot: string;
  actor: AuditActor;
  /** A customer is limited in how often and how late they may move a visit; staff are not. */
  byCustomer: boolean;
};

export async function scheduleVisit(input: ScheduleInput) {
  const request = await prisma.serviceRequest.findUnique({ where: { id: input.requestId }, include: { product: true } });
  if (!request) throw new HttpError(404, "Service request not found");
  if (!OPEN_STATUSES.includes(request.status)) throw new HttpError(400, "This request is closed", "requestClosed");
  const settings = await getAppSettings();
  const slots = await getVisitSlots();
  if (!slots.includes(input.slot)) throw new HttpError(400, "Choose one of the offered time windows", "slotInvalid");

  if (input.byCustomer) {
    if (request.visitSlot && request.visitRescheduleCount >= settings.rescheduleLimit) {
      throw new HttpError(400, "This visit was already moved the maximum number of times. Please call the service.", "rescheduleLimit", { limit: settings.rescheduleLimit });
    }
    if (request.scheduledAt && request.scheduledAt.getTime() - Date.now() < settings.cancelBeforeHours * 3_600_000) {
      throw new HttpError(400, "It is too late to move this visit. Please call the service.", "visitTooClose", { hours: settings.cancelBeforeHours });
    }
  }

  const options = await availableSlots({
    date: input.date,
    technicianType: request.technicianTypeRequired,
    serviceCenterId: request.serviceCenterId,
    ignoreRequestId: request.id,
    technicianId: request.assignedTechnicianId,
  });
  const chosen = options.find((option) => option.slot === input.slot);
  if (!chosen?.free) throw new HttpError(409, "This time window is no longer free", "slotTaken");

  const previous = request.scheduledAt;
  const moved = Boolean(previous);
  const updated = await prisma.serviceRequest.update({
    where: { id: request.id },
    data: {
      scheduledAt: slotStart(input.date, input.slot),
      visitSlot: input.slot,
      // A customer who picked the window has agreed to it; a window set by staff waits for the customer's confirmation.
      visitConfirmedAt: input.byCustomer ? new Date() : null,
      visitRescheduleCount: moved && input.byCustomer ? { increment: 1 } : undefined,
      // An unassigned request takes one of the free technicians so the slot is really held.
      ...(request.assignedTechnicianId ? {} : chosen.technicianIds[0] ? { assignedTechnicianId: chosen.technicianIds[0], assignedAt: new Date() } : {}),
    },
  });
  await writeAudit({
    actor: input.actor,
    action: moved ? "request.visitMoved" : "request.visitBooked",
    entityType: "ServiceRequest",
    entityId: request.id,
    oldValue: previous ? { scheduledAt: previous.toISOString(), slot: request.visitSlot } : null,
    newValue: { date: input.date, slot: input.slot },
  });
  publishRequest("request:updated", { id: request.id, customerId: request.customerId });
  if (input.byCustomer) {
    await notifyAdmins({
      message: `${request.displayId}: visit ${moved ? "moved to" : "booked for"} ${input.date} ${input.slot}`,
      code: "visitBooked",
      serviceRequestId: request.id,
      params: { displayId: request.displayId, date: input.date, slot: input.slot, moved },
    });
  } else {
    await createCustomerNotification(request.customerId, request.id, `Your visit for ${request.displayId} is set for ${input.date} ${input.slot}. Please confirm it.`, "visitScheduled", {
      displayId: request.displayId,
      date: input.date,
      slot: input.slot,
    });
  }
  return updated;
}

export async function confirmVisit(requestId: string, actor: AuditActor) {
  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new HttpError(404, "Service request not found");
  if (!request.scheduledAt) throw new HttpError(400, "No visit is booked for this request", "noVisit");
  if (!OPEN_STATUSES.includes(request.status)) throw new HttpError(400, "This request is closed", "requestClosed");
  if (request.visitConfirmedAt) return request;
  const updated = await prisma.serviceRequest.update({ where: { id: requestId }, data: { visitConfirmedAt: new Date() } });
  await writeAudit({ actor, action: "request.visitConfirmed", entityType: "ServiceRequest", entityId: requestId, newValue: { scheduledAt: request.scheduledAt.toISOString() } });
  publishRequest("request:updated", { id: requestId, customerId: request.customerId });
  return updated;
}

/** A customer may withdraw a request until a technician has started on it (and not at the last minute). */
export async function cancelRequestByCustomer(requestId: string, customer: { sub: string; name: string }, reason: string) {
  const request = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
  if (!request || request.customerId !== customer.sub) throw new HttpError(404, "Request not found");
  if (request.status !== "new") {
    throw new HttpError(400, "Work on this request has already started. Please call the service to cancel it.", "cancelNotAllowed");
  }
  const { cancelBeforeHours } = await getAppSettings();
  if (request.scheduledAt && request.scheduledAt.getTime() - Date.now() < cancelBeforeHours * 3_600_000) {
    throw new HttpError(400, "It is too late to cancel this visit. Please call the service.", "visitTooClose", { hours: cancelBeforeHours });
  }
  const { changeRequestStatus } = await import("./statusChange.js");
  await changeRequestStatus({
    requestId,
    next: "cancelled",
    actor: { audit: { id: customer.sub, type: "customer", name: customer.name }, role: "system" },
    reason: reason || "Cancelled by the customer",
  });
  await prisma.serviceRequest.update({ where: { id: requestId }, data: { scheduledAt: null, visitSlot: null, visitConfirmedAt: null } });
  await notifyAdmins({
    message: `${request.displayId} was cancelled by the customer`,
    code: "cancelledByCustomer",
    serviceRequestId: requestId,
    params: { displayId: request.displayId, reason },
  });
}
