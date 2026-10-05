import i18n from "../i18n";
import type { RequestStatus } from "./types";

// One status model for repair and installation.
export const ALL_STATUSES: RequestStatus[] = ["new", "in_progress", "paused", "completed", "picked_up", "cancelled"];

// Columns on the admin board; cancelled requests leave the board.
export const KANBAN_COLUMNS: RequestStatus[] = ["new", "in_progress", "paused", "completed", "picked_up"];

export function statusLabel(status: string) {
  return i18n.t(`status.${status}`, { defaultValue: status.replaceAll("_", " ") });
}

/** Friendly wording for customers. Staff keep the plain status names. */
export function customerStatusLabel(status: string) {
  return i18n.t(`customerStatus.${status}`, { defaultValue: statusLabel(status) });
}

/** The work is finished (completed or collected). */
export function isDoneStatus(status: RequestStatus) {
  return status === "completed" || status === "picked_up";
}

/** Finished or cancelled: no more work and no timer. */
export function isTerminalStatus(status: RequestStatus) {
  return isDoneStatus(status) || status === "cancelled";
}

// What an admin / dispatcher may move a request to (mirrors the server rules).
const ADMIN_NEXT: Record<RequestStatus, RequestStatus[]> = {
  new: ["in_progress", "paused", "completed", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "completed", "cancelled"],
  completed: ["in_progress", "picked_up"],
  picked_up: [],
  cancelled: ["new"],
};

export function adminNextStatuses(request: { status: RequestStatus; locationType: "in_shop" | "on_site"; pickupConfirmedAt: string | null }) {
  return ADMIN_NEXT[request.status].filter(
    // Only finished in-shop jobs are collected at the counter.
    (next) => next !== "picked_up" || (request.locationType === "in_shop" && !request.pickupConfirmedAt),
  );
}

export function canAdminMove(
  request: { status: RequestStatus; locationType: "in_shop" | "on_site"; pickupConfirmedAt: string | null },
  next: RequestStatus,
) {
  return adminNextStatuses(request).includes(next);
}
