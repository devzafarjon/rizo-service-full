import type { StaffRole } from "./types";

/** Where each role lands after signing in. */
export function homePathFor(role: StaffRole) {
  if (role === "technician") return "/app/my-jobs";
  if (role === "receptionist") return "/app/kanban";
  return "/app";
}
