import type { RequestStatus, ServiceType } from "@prisma/client";

// Repairs follow the full chain; installations use the short one (see FLOW_BY_TYPE).
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

/** Open work: a timer runs and the job sits on a board. */
export const OPEN_STATUSES: RequestStatus[] = ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused"];

/** The job produced a finished result (counts for revenue, ratings and resolution time). */
export const DONE_STATUSES: RequestStatus[] = ["ready", "completed", "picked_up", "replaced"];

export const TERMINAL_STATUSES: RequestStatus[] = [...DONE_STATUSES, "refunded", "rejected", "cancelled"];

/** Columns of the admin board per service type; cancelled jobs leave the board. */
export const BOARD_COLUMNS: Record<ServiceType | "all", RequestStatus[]> = {
  installation: ["new", "in_progress", "paused", "completed"],
  repair: ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused", "ready", "picked_up", "replaced", "refunded", "rejected"],
  all: ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused", "ready", "completed", "picked_up", "replaced", "refunded", "rejected"],
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  diagnosing: "Diagnosing",
  awaiting_decision: "Awaiting decision",
  awaiting_parts: "Awaiting parts",
  in_progress: "In progress",
  paused: "Paused",
  ready: "Ready",
  completed: "Completed",
  picked_up: "Picked up",
  replaced: "Replaced",
  refunded: "Refunded",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export function statusLabel(status: RequestStatus | string) {
  return STATUS_LABELS[status as RequestStatus] ?? String(status).replaceAll("_", " ");
}

export const isDoneStatus = (status: RequestStatus) => DONE_STATUSES.includes(status);
export const isTerminalStatus = (status: RequestStatus) => TERMINAL_STATUSES.includes(status);
export const isOpenStatus = (status: RequestStatus) => OPEN_STATUSES.includes(status);

type Table = Record<RequestStatus, RequestStatus[]>;
const none: RequestStatus[] = [];

const REPAIR_OFFICE: Table = {
  new: ["diagnosing", "in_progress", "awaiting_decision", "paused", "rejected", "cancelled"],
  diagnosing: ["awaiting_decision", "awaiting_parts", "in_progress", "paused", "rejected", "cancelled"],
  awaiting_decision: ["diagnosing", "awaiting_parts", "in_progress", "replaced", "refunded", "rejected", "cancelled"],
  awaiting_parts: ["in_progress", "paused", "diagnosing", "cancelled"],
  in_progress: ["awaiting_parts", "awaiting_decision", "paused", "ready", "completed", "replaced", "cancelled"],
  paused: ["in_progress", "diagnosing", "cancelled"],
  ready: ["picked_up", "in_progress"],
  completed: ["in_progress", "picked_up"],
  picked_up: none,
  replaced: none,
  refunded: none,
  rejected: none,
  cancelled: ["new"],
};

const INSTALL_OFFICE: Table = {
  new: ["in_progress", "paused", "cancelled"],
  diagnosing: none,
  awaiting_decision: none,
  awaiting_parts: none,
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
  ready: none,
  completed: ["in_progress"],
  picked_up: none,
  replaced: none,
  refunded: none,
  rejected: none,
  cancelled: ["new"],
};

// Technicians move work forward; decisions (refund, reject, cancel) stay with the office.
const REPAIR_TECH: Table = {
  new: ["diagnosing", "in_progress", "paused"],
  diagnosing: ["awaiting_decision", "awaiting_parts", "in_progress", "paused"],
  awaiting_decision: none,
  awaiting_parts: ["in_progress", "paused"],
  in_progress: ["awaiting_parts", "awaiting_decision", "paused", "ready", "completed", "replaced"],
  paused: ["in_progress", "diagnosing"],
  ready: none,
  completed: none,
  picked_up: none,
  replaced: none,
  refunded: none,
  rejected: none,
  cancelled: none,
};

const INSTALL_TECH: Table = {
  new: ["in_progress", "paused"],
  diagnosing: none,
  awaiting_decision: none,
  awaiting_parts: none,
  in_progress: ["paused", "completed"],
  paused: ["in_progress"],
  ready: none,
  completed: none,
  picked_up: none,
  replaced: none,
  refunded: none,
  rejected: none,
  cancelled: none,
};

export type StaffRoleName = "admin" | "receptionist" | "technician";

export function allowedNext(role: StaffRoleName, type: ServiceType, from: RequestStatus): RequestStatus[] {
  const office = role !== "technician";
  const table = type === "repair" ? (office ? REPAIR_OFFICE : REPAIR_TECH) : office ? INSTALL_OFFICE : INSTALL_TECH;
  return table[from];
}

export function canTransition(role: StaffRoleName, type: ServiceType, from: RequestStatus, to: RequestStatus) {
  return allowedNext(role, type, from).includes(to);
}

/** The status a finished job lands in: repairs left at the counter wait for pickup, everything else is completed. */
export function finishedStatusFor(type: ServiceType, locationType: "in_shop" | "on_site", resolution: "repair" | "replace" | "refund" | null) {
  if (resolution === "replace") return "replaced" as const;
  if (type === "repair" && locationType === "in_shop") return "ready" as const;
  return "completed" as const;
}
