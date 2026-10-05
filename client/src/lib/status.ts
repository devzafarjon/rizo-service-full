import i18n from "../i18n";
import type { LocationType, RequestStatus, ServiceType, StaffRole } from "./types";

// Repairs follow the full chain; installations use the short one. Mirrors server/src/lib/status.ts.
export const ALL_STATUSES: RequestStatus[] = [
  "new",
  "diagnosing",
  "awaiting_decision",
  "awaiting_parts",
  "in_progress",
  "paused",
  "ready",
  "completed",
  "picked_up",
  "replaced",
  "refunded",
  "rejected",
  "cancelled",
];

export const BOARD_COLUMNS: Record<ServiceType | "all", RequestStatus[]> = {
  installation: ["new", "in_progress", "paused", "completed"],
  repair: ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused", "ready", "picked_up", "replaced", "refunded", "rejected"],
  all: ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused", "ready", "completed", "picked_up", "replaced", "refunded", "rejected"],
};

export function statusLabel(status: string) {
  return i18n.t(`status.${status}`, { defaultValue: status.replaceAll("_", " ") });
}

/** Friendly wording for customers. Staff keep the plain status names. */
export function customerStatusLabel(status: string) {
  return i18n.t(`customerStatus.${status}`, { defaultValue: statusLabel(status) });
}

/** The work produced a result (counts for ratings and revenue). */
export function isDoneStatus(status: RequestStatus) {
  return status === "ready" || status === "completed" || status === "picked_up" || status === "replaced";
}

/** Finished or closed without work: no more work and no timer. */
export function isTerminalStatus(status: RequestStatus) {
  return isDoneStatus(status) || status === "refunded" || status === "rejected" || status === "cancelled";
}

export type TechColumn = "new" | "in_progress" | "paused" | "completed";

export function techColumnOf(status: RequestStatus): TechColumn {
  if (isTerminalStatus(status)) return "completed";
  if (status === "paused" || status === "awaiting_decision" || status === "awaiting_parts") return "paused";
  if (status === "in_progress" || status === "diagnosing") return "in_progress";
  return "new";
}

type Table = Partial<Record<RequestStatus, RequestStatus[]>>;

const REPAIR_OFFICE: Table = {
  new: ["diagnosing", "in_progress", "awaiting_decision", "paused", "rejected", "cancelled"],
  diagnosing: ["awaiting_decision", "awaiting_parts", "in_progress", "paused", "rejected", "cancelled"],
  awaiting_decision: ["diagnosing", "awaiting_parts", "in_progress", "replaced", "refunded", "rejected", "cancelled"],
  awaiting_parts: ["in_progress", "paused", "diagnosing", "cancelled"],
  in_progress: ["awaiting_parts", "awaiting_decision", "paused", "ready", "completed", "replaced", "cancelled"],
  paused: ["in_progress", "diagnosing", "cancelled"],
  ready: ["picked_up", "in_progress"],
  completed: ["in_progress", "picked_up"],
  cancelled: ["new"],
};

const INSTALL_OFFICE: Table = {
  new: ["in_progress", "paused", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
  completed: ["in_progress"],
  cancelled: ["new"],
};

const REPAIR_TECH: Table = {
  new: ["diagnosing", "in_progress", "paused"],
  diagnosing: ["awaiting_decision", "awaiting_parts", "in_progress", "paused"],
  awaiting_parts: ["in_progress", "paused"],
  in_progress: ["awaiting_parts", "awaiting_decision", "paused", "ready", "completed", "replaced"],
  paused: ["in_progress", "diagnosing"],
};

const INSTALL_TECH: Table = {
  new: ["in_progress", "paused"],
  in_progress: ["paused", "completed"],
  paused: ["in_progress"],
};

export type MovableRequest = {
  status: RequestStatus;
  type: ServiceType;
  locationType: LocationType;
  pickupConfirmedAt: string | null;
};

/** What the signed-in role may move a request to (the server enforces the same rules). */
export function nextStatuses(role: StaffRole, request: MovableRequest): RequestStatus[] {
  const office = role !== "technician";
  const table = request.type === "repair" ? (office ? REPAIR_OFFICE : REPAIR_TECH) : office ? INSTALL_OFFICE : INSTALL_TECH;
  return (table[request.status] ?? []).filter(
    // Only finished in-shop jobs are collected at the counter.
    (next) => next !== "picked_up" || (request.locationType === "in_shop" && !request.pickupConfirmedAt),
  );
}

export function canMove(role: StaffRole, request: MovableRequest, next: RequestStatus) {
  return nextStatuses(role, request).includes(next);
}

export function adminNextStatuses(request: MovableRequest) {
  return nextStatuses("admin", request);
}

export function canAdminMove(request: MovableRequest, next: RequestStatus) {
  return canMove("admin", request, next);
}
