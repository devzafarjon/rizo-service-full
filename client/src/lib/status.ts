import i18n from "../i18n";
import type { RequestStatus, ServiceType } from "./types";

export const STATUSES_BY_TYPE: Record<ServiceType, RequestStatus[]> = {
  installation: ["scheduled", "in_progress", "completed"],
  repair: ["received", "diagnosing", "awaiting_parts", "repairing", "ready_for_pickup", "replaced", "closed"],
};

export const KANBAN_COLUMNS: RequestStatus[] = [
  "scheduled",
  "received",
  "diagnosing",
  "awaiting_parts",
  "repairing",
  "in_progress",
  "ready_for_pickup",
  "replaced",
  "completed",
  "closed",
];

export function statusLabel(status: string) {
  return i18n.t(`status.${status}`, { defaultValue: status.replaceAll("_", " ") });
}

export function outcomeLabel(status: RequestStatus, completedAt: string | null) {
  if (status === "replaced") return i18n.t("outcome.replaced");
  if (status === "closed") return i18n.t("outcome.closed");
  if (status === "completed") return i18n.t("outcome.completed");
  if (completedAt) return i18n.t("outcome.reopened");
  return i18n.t("outcome.open");
}

export function columnsForType(type: ServiceType | "") {
  if (!type) return KANBAN_COLUMNS;
  return STATUSES_BY_TYPE[type];
}

export function isDoneStatus(status: RequestStatus) {
  return status === "completed" || status === "closed" || status === "replaced";
}

export function isAllowedStatus(type: ServiceType, status: RequestStatus) {
  return STATUSES_BY_TYPE[type].includes(status);
}
