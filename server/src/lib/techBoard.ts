import type { RequestStatus, ServiceType } from "@prisma/client";

export type TechColumn = "new" | "in_progress" | "paused" | "completed";

export function techColumn(
  type: ServiceType,
  status: RequestStatus,
  hasActivePause: boolean,
): TechColumn {
  if (isDoneStatus(status)) return "completed";
  if (hasActivePause) return "paused";
  if (type === "installation") {
    if (status === "scheduled") return "new";
    if (status === "in_progress") return "in_progress";
  }
  if (type === "repair") {
    if (status === "received") return "new";
    if (status === "diagnosing" || status === "awaiting_parts" || status === "repairing" || status === "ready_for_pickup") {
      return "in_progress";
    }
  }
  if (status === "scheduled" || status === "received") return "new";
  return "in_progress";
}

export function isDoneStatus(status: RequestStatus) {
  return status === "completed" || status === "closed" || status === "replaced";
}

export function inProgressStatusFor(type: ServiceType, current: RequestStatus): RequestStatus {
  if (type === "installation") return "in_progress";
  return current === "received" ? "diagnosing" : current;
}

export function completedStatusFor(type: ServiceType): RequestStatus {
  return type === "repair" ? "closed" : "completed";
}

export const NEW_TIMER_MS = 24 * 60 * 60 * 1000;
export const PROGRESS_TIMER_MS = 3 * 24 * 60 * 60 * 1000;
