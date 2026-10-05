import type { RequestStatus, ServiceType } from "@prisma/client";
import { formatDurationHours, formatDurationMs } from "./durationFormat.js";
import { prisma } from "./prisma.js";

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
  enRouteAt?: Date | null;
  completedAt: Date | null;
  pickupConfirmedAt?: Date | null;
  pauses: PauseRecord[];
};

export type TimelineEvent = {
  key: string;
  kind: "created" | "received" | "assigned" | "accepted" | "en_route" | "arrived" | "paused" | "resumed" | "completed" | "picked_up" | "status" | "decision" | "estimate";
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
  if (request.enRouteAt) simple("en_route", "en_route", request.enRouteAt, "Technician on the way", "timeline.enRoute");
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

  if (request.completedAt && (request.status === "completed" || request.status === "picked_up")) {
    simple("completed", "completed", request.completedAt, "Completed", "timeline.completed");
  }
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
    en_route: 4,
    arrived: 5,
    paused: 6,
    resumed: 7,
    status: 8,
    decision: 8,
    estimate: 8,
    completed: 9,
    picked_up: 10,
  };
  return order[kind];
}

const AUDIT_STATUSES = new Set(["diagnosing", "awaiting_decision", "awaiting_parts", "ready", "replaced", "refunded", "rejected", "cancelled"]);

/** The timeline from the request's own timestamps plus the detailed steps recorded in the audit log. */
export async function loadTimeline(request: TimelineSource & { id: string }, options?: { customerSafe?: boolean }): Promise<TimelineEvent[]> {
  const events = buildTimeline(request);
  const logs = await prisma.auditLog.findMany({
    where: { entityType: "ServiceRequest", entityId: request.id, action: { in: ["request.status", "request.decision", "estimate.create", "estimate.send", "estimate.approve", "estimate.decline"] } },
    orderBy: { createdAt: "asc" },
  });
  for (const log of logs) {
    const next = (log.newValue ?? {}) as Record<string, unknown>;
    const reason = typeof next.reason === "string" && next.reason ? next.reason : null;
    if (log.action === "request.status" && typeof next.status === "string" && AUDIT_STATUSES.has(next.status)) {
      events.push({
        key: `status-${log.id}`,
        kind: "status",
        at: log.createdAt.toISOString(),
        title: next.status,
        detail: reason,
        titleKey: `timeline.status.${next.status}`,
        detailKey: null,
        params: reason ? { reason } : null,
      });
    } else if (log.action === "request.decision" && typeof next.decision === "string" && !options?.customerSafe) {
      events.push({ key: `decision-${log.id}`, kind: "decision", at: log.createdAt.toISOString(), title: next.decision, detail: null, titleKey: `timeline.decision.${next.decision}`, detailKey: null, params: null });
    } else if (log.action.startsWith("estimate.")) {
      const step = log.action.slice(9);
      if (options?.customerSafe && step === "create") continue;
      events.push({ key: `estimate-${log.id}`, kind: "estimate", at: log.createdAt.toISOString(), title: step, detail: null, titleKey: `timeline.estimate.${step}`, detailKey: null, params: null });
    }
  }
  return events.sort((a, b) => a.at.localeCompare(b.at) || kindOrder(a.kind) - kindOrder(b.kind));
}
