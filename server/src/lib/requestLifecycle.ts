import { Prisma } from "@prisma/client";
import type { RequestStatus } from "@prisma/client";
import type { RequestRecord } from "./serializeRequest.js";
import { isDoneStatus } from "./status.js";

/** Timestamp updates that go with a status change. Arrival on site is recorded explicitly by the technician. */
export function statusPatch(
  existing: Pick<RequestRecord, "status" | "acceptedAt" | "completedAt">,
  next: RequestStatus,
  now: Date,
) {
  const data: Prisma.ServiceRequestUpdateInput = { status: next, statusChangedAt: now };
  if ((next === "in_progress" || next === "diagnosing") && !existing.acceptedAt) {
    data.acceptedAt = now;
  }
  if (isDoneStatus(next) || next === "rejected" || next === "refunded") {
    data.completedAt = existing.completedAt ?? now;
    if (!existing.acceptedAt && isDoneStatus(next)) {
      data.acceptedAt = now;
    }
  }
  return data;
}
