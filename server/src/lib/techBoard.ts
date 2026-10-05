import type { RequestStatus } from "@prisma/client";

export type TechColumn = "new" | "in_progress" | "paused" | "completed";

export function techColumn(status: RequestStatus): TechColumn {
  if (status === "completed" || status === "picked_up" || status === "cancelled") return "completed";
  if (status === "paused") return "paused";
  if (status === "in_progress") return "in_progress";
  return "new";
}

export { isDoneStatus, isTerminalStatus } from "./status.js";

export const NEW_TIMER_MS = 24 * 60 * 60 * 1000;
export const PROGRESS_TIMER_MS = 3 * 24 * 60 * 60 * 1000;

type PauseLike = { pausedAt: Date; customTimerHours: { toString(): string } | number };

/** Countdown for a job: 1 day for New, 3 days for In progress, technician-set for Paused. */
export function jobTimer(
  status: RequestStatus,
  job: { createdAt: Date; assignedAt: Date | null; acceptedAt: Date | null },
  activePause: PauseLike | null,
) {
  const column = techColumn(status);
  if (column === "completed") return null;
  if (column === "paused" && activePause) {
    return {
      startsAt: activePause.pausedAt,
      durationMs: Number(activePause.customTimerHours) * 60 * 60 * 1000,
    };
  }
  if (column === "new") {
    return { startsAt: job.assignedAt ?? job.createdAt, durationMs: NEW_TIMER_MS };
  }
  return { startsAt: job.acceptedAt ?? job.createdAt, durationMs: PROGRESS_TIMER_MS };
}
