import { Prisma } from "@prisma/client";
import type { RequestStatus } from "@prisma/client";
import type { RequestRecord } from "./serializeRequest.js";

/** Timestamp updates that go with a status change. Arrival on site is recorded explicitly by the technician. */
export function statusPatch(
  existing: Pick<RequestRecord, "status" | "acceptedAt" | "completedAt">,
  next: RequestStatus,
  now: Date,
) {
  const data: Prisma.ServiceRequestUpdateInput = { status: next };
  if (next === "in_progress" && !existing.acceptedAt) {
    data.acceptedAt = now;
  }
  if (next === "completed" || next === "picked_up") {
    data.completedAt = existing.completedAt ?? now;
    if (!existing.acceptedAt) {
      data.acceptedAt = now;
    }
  }
  return data;
}
