import type { RequestStatus } from "@prisma/client";

// One status model for both repair and installation.
export const ALL_STATUSES: RequestStatus[] = ["new", "in_progress", "paused", "completed", "picked_up", "cancelled"];

// Columns on the admin kanban board. Cancelled jobs leave the board.
export const KANBAN_COLUMNS: RequestStatus[] = ["new", "in_progress", "paused", "completed", "picked_up"];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: "New",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  picked_up: "Picked up",
  cancelled: "Cancelled",
};

export function statusLabel(status: RequestStatus | string) {
  return STATUS_LABELS[status as RequestStatus] ?? String(status).replaceAll("_", " ");
}

/** The work itself is finished (counts toward revenue and resolution-time reports). */
export function isDoneStatus(status: RequestStatus) {
  return status === "completed" || status === "picked_up";
}

/** No further work or timers: finished or cancelled. */
export function isTerminalStatus(status: RequestStatus) {
  return status === "completed" || status === "picked_up" || status === "cancelled";
}

export const TERMINAL_STATUSES: RequestStatus[] = ["completed", "picked_up", "cancelled"];
export const OPEN_STATUSES: RequestStatus[] = ["new", "in_progress", "paused"];
