import type { PaymentStatus, RequestStatus, ServiceType, TechnicianType, WarrantyStatus } from "@prisma/client";
import { tashkentCalendarDate } from "./displayId.js";
import { prisma } from "./prisma.js";

const OPEN_STATUSES: RequestStatus[] = [
  "scheduled",
  "in_progress",
  "received",
  "diagnosing",
  "awaiting_parts",
  "repairing",
  "ready_for_pickup",
];

export function initialStatusFor(type: ServiceType): RequestStatus {
  if (type === "installation") return "scheduled";
  return "received";
}

export function paymentFor(type: ServiceType, warranty: WarrantyStatus) {
  const covered = warranty === "in_warranty";
  return {
    isPaidRepair: type === "repair" && !covered,
    paymentStatus: (covered ? "not_required" : "pending") as PaymentStatus,
  };
}

function tashkentHHmm(at = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

function isOffNow(row: { isWorking: boolean; startTime: string | null; endTime: string | null }, now = tashkentHHmm()) {
  if (!row.isWorking) return true;
  if (row.startTime && row.endTime && (now < row.startTime || now > row.endTime)) return true;
  return false;
}

export async function pickAvailableTechnician(technicianType: TechnicianType) {
  const today = new Date(`${tashkentCalendarDate(new Date())}T00:00:00.000Z`);
  const todayRows = await prisma.technicianSchedule.findMany({
    where: { date: today },
    select: { technicianId: true, isWorking: true, startTime: true, endTime: true },
  });
  const offIds = todayRows.filter((row) => isOffNow(row)).map((row) => row.technicianId);
  const technicians = await prisma.staffUser.findMany({
    where: {
      role: "technician",
      technicianType,
      isAvailable: true,
      ...(offIds.length ? { id: { notIn: offIds } } : {}),
    },
    select: { id: true, name: true, phone: true, technicianType: true, isAvailable: true },
  });
  if (technicians.length === 0) {
    return null;
  }

  const counts = await prisma.serviceRequest.groupBy({
    by: ["assignedTechnicianId"],
    where: {
      assignedTechnicianId: { in: technicians.map((tech) => tech.id) },
      status: { in: OPEN_STATUSES },
    },
    _count: { _all: true },
  });
  const openJobs = new Map(counts.map((row) => [row.assignedTechnicianId, row._count._all]));

  technicians.sort((a, b) => {
    const diff = (openJobs.get(a.id) ?? 0) - (openJobs.get(b.id) ?? 0);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });

  const chosen = technicians[0];
  return {
    ...chosen,
    openJobCount: openJobs.get(chosen.id) ?? 0,
  };
}

export async function technicianWorkload(ids: string[]) {
  if (ids.length === 0) return new Map<string, number>();
  const counts = await prisma.serviceRequest.groupBy({
    by: ["assignedTechnicianId"],
    where: { assignedTechnicianId: { in: ids }, status: { in: OPEN_STATUSES } },
    _count: { _all: true },
  });
  return new Map(counts.map((row) => [row.assignedTechnicianId as string, row._count._all]));
}
