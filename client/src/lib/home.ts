import type { StaffRole } from "./types";

/** Where each role lands after signing in. */
export function homePathFor(role: StaffRole) {
  if (role === "technician") return "/app/my-jobs";
  if (role === "receptionist") return "/app/kanban";
  if (role === "accountant") return "/app/reports";
  if (role === "warehouse") return "/app/tech-stock";
  return "/app";
}
