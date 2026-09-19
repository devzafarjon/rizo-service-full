import type { RequestStatus, ServiceType } from "@prisma/client";

export const STATUSES_BY_TYPE: Record<ServiceType, RequestStatus[]> = {
  installation: ["scheduled", "in_progress", "completed"],
  repair: ["received", "diagnosing", "awaiting_parts", "repairing", "ready_for_pickup", "replaced", "closed"],
};

export const KANBAN_COLUMNS: RequestStatus[] = [
  "scheduled",
  "received",
  "diagnosing",
  "awaiting_parts",
  "repairing",
  "in_progress",
  "ready_for_pickup",
  "replaced",
  "completed",
  "closed",
];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  scheduled: "Scheduled",
  received: "Received",
  diagnosing: "Diagnosing",
  awaiting_parts: "Awaiting parts",
  repairing: "Repairing",
  in_progress: "In progress",
  ready_for_pickup: "Ready for pickup",
  replaced: "Replaced",
  completed: "Completed",
  closed: "Closed",
};

export function statusLabel(status: RequestStatus | string) {
  return STATUS_LABELS[status as RequestStatus] ?? String(status).replaceAll("_", " ");
}

export function isAllowedStatus(type: ServiceType, status: RequestStatus) {
  return STATUSES_BY_TYPE[type].includes(status);
}

export function isDoneStatus(status: RequestStatus) {
  return status === "completed" || status === "closed" || status === "replaced";
}
