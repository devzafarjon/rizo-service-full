import type { Prisma, RequestStatus } from "@prisma/client";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";

/**
 * First-tier work is a RIZO product or anything still under warranty. Second-tier work (another maker, paid)
 * waits while its technician has first-tier jobs that need them: New, Diagnostics or In progress.
 * Parts-waiting and paused jobs do not block, so a technician is never idle just because a part is late.
 */
export const FIRST_TIER_BUSY: RequestStatus[] = ["new", "diagnosing", "in_progress"];

export const firstTierWhere: Prisma.ServiceRequestWhereInput = {
  OR: [{ warrantyStatus: "in_warranty" }, { product: { brand: { isOwn: true } } }],
};

export function isFirstTier(request: { warrantyStatus: string; product: { brand?: { isOwn: boolean } | null } }) {
  return request.warrantyStatus === "in_warranty" || request.product.brand?.isOwn !== false;
}

export function hasQueueOverride(request: { queueOverrideAt?: Date | null }) {
  return Boolean(request.queueOverrideAt);
}

/** How many first-tier jobs the technician has to get through before second-tier work may start. */
export async function firstTierBacklog(technicianId: string, excludeId?: string) {
  return prisma.serviceRequest.count({
    where: { assignedTechnicianId: technicianId, status: { in: FIRST_TIER_BUSY }, ...firstTierWhere, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

type QueueSubject = {
  id: string;
  status: RequestStatus;
  assignedTechnicianId: string | null;
  warrantyStatus: string;
  queueOverrideAt?: Date | null;
  product: { brand?: { isOwn: boolean } | null };
};

/** True while this job must wait for its technician's first-tier jobs. `backlog` can be passed in when already counted. */
export async function isWaitingForFirstTier(job: QueueSubject, backlog?: number) {
  if (isFirstTier(job) || hasQueueOverride(job) || job.status !== "new" || !job.assignedTechnicianId) return false;
  return (backlog ?? (await firstTierBacklog(job.assignedTechnicianId, job.id))) > 0;
}

export async function assertQueueOpen(job: QueueSubject) {
  if (await isWaitingForFirstTier(job)) {
    const count = await firstTierBacklog(job.assignedTechnicianId!, job.id);
    throw new HttpError(409, "Finish the RIZO and warranty jobs first", "waitingForWarranty", { count });
  }
}
