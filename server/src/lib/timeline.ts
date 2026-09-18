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
  acceptedAt: Date | null;
  arrivedAt: Date | null;
  completedAt: Date | null;
  pauses: PauseRecord[];
};

export type TimelineEvent = {
  key: string;
  kind: "created" | "received" | "accepted" | "arrived" | "paused" | "resumed" | "completed";
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
  const receivedAt = request.receivedAt;
  const mergeReceived = Boolean(receivedAt && closeInTime(request.createdAt, receivedAt));
  const createdReceived = mergeReceived && request.type === "repair";

  events.push({
    key: "created",
    kind: "created",
    at: request.createdAt.toISOString(),
    title: createdReceived ? "Created · received" : "Request created",
    detail: null,
    titleKey: createdReceived ? "timeline.createdReceived" : "timeline.created",
    detailKey: null,
    params: null,
  });

  if (receivedAt && !mergeReceived) {
    events.push({
      key: "received",
      kind: "received",
      at: receivedAt.toISOString(),
      title: "Received",
      detail: null,
      titleKey: "timeline.received",
      detailKey: null,
      params: null,
    });
  }

  if (request.acceptedAt) {
    events.push({
      key: "accepted",
      kind: "accepted",
      at: request.acceptedAt.toISOString(),
      title: "Work started",
      detail: null,
      titleKey: "timeline.accepted",
      detailKey: null,
      params: null,
    });
  }

  if (request.arrivedAt) {
    events.push({
      key: "arrived",
      kind: "arrived",
      at: request.arrivedAt.toISOString(),
      title: "Arrived on site",
      detail: null,
      titleKey: "timeline.arrived",
      detailKey: null,
      params: null,
    });
  }

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
    if (pause.resumedAt) {
      events.push({
        key: `resumed-${pause.id}`,
        kind: "resumed",
        at: pause.resumedAt,
        title: "Resumed",
        detail: null,
        titleKey: "timeline.resumed",
        detailKey: null,
        params: null,
      });
    }
  }

  if (request.completedAt) {
    events.push({
      key: "completed",
      kind: "completed",
      at: request.completedAt.toISOString(),
      title: completedTitle(request.status),
      detail: null,
      titleKey: completedKey(request.status),
      detailKey: null,
      params: { status: request.status },
    });
  }

  return events.sort((a, b) => {
    const diff = a.at.localeCompare(b.at);
    if (diff !== 0) return diff;
    return kindOrder(a.kind) - kindOrder(b.kind);
  });
}

function completedTitle(status: RequestStatus) {
  if (status === "replaced") return "Replaced";
  if (status === "closed") return "Closed";
  return "Completed";
}

function completedKey(status: RequestStatus) {
  if (status === "replaced") return "timeline.replaced";
  if (status === "closed") return "timeline.closed";
  return "timeline.completed";
}

function closeInTime(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) < 2000;
}

function kindOrder(kind: TimelineEvent["kind"]) {
  const order: Record<TimelineEvent["kind"], number> = {
    created: 0,
    received: 1,
    accepted: 2,
    arrived: 3,
    paused: 4,
    resumed: 5,
    completed: 6,
  };
  return order[kind];
}
