import type { PaymentStatus, RequestStatus, ServiceType, TechnicianType, WarrantyStatus } from "@prisma/client";
import { OPEN_STATUSES } from "./status.js";
import { tashkentCalendarDate } from "./displayId.js";
import { prisma } from "./prisma.js";

export function initialStatusFor(): RequestStatus {
  return "new";
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

type GeoPoint = { lat?: number | null; lng?: number | null };

/** Straight-line distance in kilometres, or null when either point has no coordinates. */
export function distanceKm(a: GeoPoint, b: GeoPoint) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Picks the technician for a new job: right type, working today, able to repair this product category
 * (a technician with no skills listed takes anything) and then the best of load and distance:
 * every open job counts as one point and every 10 km from the technician's base as another.
 */
export async function pickAvailableTechnician(
  technicianType: TechnicianType,
  options?: { serviceCenterId?: string | null; productCategory?: string | null; location?: GeoPoint | null },
) {
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
      isActive: true,
      // A request for a specific service center goes to that center's technicians when it has any.
      ...(options?.serviceCenterId && technicianType === "service_center" ? { serviceCenterId: options.serviceCenterId } : {}),
      ...(offIds.length ? { id: { notIn: offIds } } : {}),
    },
    select: { id: true, name: true, phone: true, technicianType: true, isAvailable: true, skillCategories: true, baseLat: true, baseLng: true, serviceCenter: { select: { lat: true, lng: true } } },
  });
  const category = options?.productCategory;
  const skilled = category ? technicians.filter((tech) => tech.skillCategories.length === 0 || tech.skillCategories.includes(category)) : technicians;
  technicians.splice(0, technicians.length, ...skilled);
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

  const score = (tech: (typeof technicians)[number]) => {
    const km = options?.location ? distanceKm({ lat: tech.baseLat ?? tech.serviceCenter?.lat, lng: tech.baseLng ?? tech.serviceCenter?.lng }, options.location) : null;
    return (openJobs.get(tech.id) ?? 0) + (km == null ? 0 : km / 10);
  };
  technicians.sort((a, b) => {
    const diff = score(a) - score(b);
    if (Math.abs(diff) > 1e-9) return diff;
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
