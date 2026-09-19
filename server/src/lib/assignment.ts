import type { PaymentStatus, RequestStatus, ServiceType, TechnicianType, WarrantyStatus } from "@prisma/client";
import { prisma } from "./prisma.js";

const OPEN_STATUSES: RequestStatus[] = [
  "scheduled",
  "in_progress",
  "received",
  "diagnosing",
  "awaiting_parts",
  "repairing",
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

export async function pickAvailableTechnician(technicianType: TechnicianType) {
  const technicians = await prisma.staffUser.findMany({
    where: {
      role: "technician",
      technicianType,
      isAvailable: true,
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
