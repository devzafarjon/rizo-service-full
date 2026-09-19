import { Prisma } from "@prisma/client";
import type { RequestStatus } from "@prisma/client";
import type { RequestRecord } from "./serializeRequest.js";

export function statusPatch(
  existing: Pick<
    RequestRecord,
    "type" | "status" | "locationType" | "receivedAt" | "acceptedAt" | "arrivedAt" | "completedAt"
  >,
  next: RequestStatus,
  now: Date,
) {
  const data: Prisma.ServiceRequestUpdateInput = { status: next };
  if (next === "received" && !existing.receivedAt) {
    data.receivedAt = now;
  }
  const enteringWork =
    next === "in_progress" || next === "diagnosing" || next === "repairing" || next === "awaiting_parts";
  if (enteringWork && !existing.acceptedAt) {
    data.acceptedAt = now;
  }
  if (
    existing.locationType === "on_site" &&
    !existing.arrivedAt &&
    (enteringWork || next === "completed" || next === "closed" || next === "replaced")
  ) {
    data.arrivedAt = existing.acceptedAt ?? now;
  }
  if (next === "completed" || next === "closed" || next === "replaced") {
    data.completedAt = existing.completedAt ?? now;
    if (!existing.acceptedAt) {
      data.acceptedAt = now;
    }
  }
  return data;
}
