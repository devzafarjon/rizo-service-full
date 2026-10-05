import type { RequestStatus, ServiceType } from "@prisma/client";
import { formatDurationHours, formatDurationMs } from "./durationFormat.js";

export type PauseRecord = {
  id: string;
  pausedAt: Date;
  resumedAt: Date | null;
  reason: string;
  customTimerHours: { toString(): string } | number;
};

export type TimelineSource = {
  id: string;
  type: ServiceType;
  status: RequestStatus;
  createdAt: Date;
  receivedAt: Date | null;
  assignedAt?: Date | null;
  acceptedAt: Date | null;
  arrivedAt: Date | null;
  completedAt: Date | null;
  pickupConfirmedAt?: Date | null;
  pauses: PauseRecord[];
};

export type TimelineEvent = {
  key: string;
  kind: "created" | "received" | "assigned" | "accepted" | "arrived" | "paused" | "resumed" | "completed" | "picked_up";
  at: string;
  title: string;
  detail: string | null;
  titleKey: string;
  detailKey: string | null;
  params: Record<string, unknown> | null;
};

export function serializePauses(pauses: PauseRecord[]) {
  return [...pauses]
    .sort((a, b) => a.pausedAt.getTime() - b.pausedAt.getTime())
    .map((pause) => ({
      id: pause.id,
      pausedAt: pause.pausedAt.toISOString(),
      resumedAt: pause.resumedAt?.toISOString() ?? null,
      reason: pause.reason,
      customTimerHours: Number(pause.customTimerHours),
      durationMs: pause.resumedAt ? pause.resumedAt.getTime() - pause.pausedAt.getTime() : null,
    }));
}

export function buildTimeline(request: TimelineSource): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const simple = (
    key: string,
    kind: TimelineEvent["kind"],
    at: Date,
    title: string,
    titleKey: string,
    params: Record<string, unknown> | null = null,
  ) => events.push({ key, kind, at: at.toISOString(), title, detail: null, titleKey, detailKey: null, params });

  simple("created", "created", request.createdAt, "Request created", "timeline.created");
  if (request.assignedAt) simple("assigned", "assigned", request.assignedAt, "Assigned to technician", "timeline.assigned");
  if (request.acceptedAt) simple("accepted", "accepted", request.acceptedAt, "Work started", "timeline.accepted");
  if (request.arrivedAt) simple("arrived", "arrived", request.arrivedAt, "Arrived on site", "timeline.arrived");

  for (const pause of serializePauses(request.pauses)) {
    const planned = formatDurationHours(pause.customTimerHours);
    const lasted = pause.durationMs != null ? formatDurationMs(pause.durationMs) : null;
    events.push({
      key: `paused-${pause.id}`,
      kind: "paused",
      at: pause.pausedAt,
      title: "Paused",
      detail: pause.resumedAt
        ? `${pause.reason} · planned ${planned} · lasted ${lasted}`
        : `${pause.reason} · planned ${planned} · still paused`,
      titleKey: "timeline.paused",
      detailKey: pause.resumedAt ? "timeline.pauseDone" : "timeline.pauseActive",
      params: {
        reason: pause.reason,
        hours: pause.customTimerHours,
        durationMs: pause.durationMs,
      },
    });
    if (pause.resumedAt) simple(`resumed-${pause.id}`, "resumed", new Date(pause.resumedAt), "Resumed", "timeline.resumed");
  }

  if (request.completedAt) simple("completed", "completed", request.completedAt, "Completed", "timeline.completed");
  if (request.pickupConfirmedAt) simple("picked_up", "picked_up", request.pickupConfirmedAt, "Picked up", "timeline.pickedUp");

  return events.sort((a, b) => {
    const diff = a.at.localeCompare(b.at);
    if (diff !== 0) return diff;
    return kindOrder(a.kind) - kindOrder(b.kind);
  });
}

function kindOrder(kind: TimelineEvent["kind"]) {
  const order: Record<TimelineEvent["kind"], number> = {
    created: 0,
    received: 1,
    assigned: 2,
    accepted: 3,
    arrived: 4,
    paused: 5,
    resumed: 6,
    completed: 7,
    picked_up: 8,
  };
  return order[kind];
}
