import type { TFunction } from "i18next";
import { formatRequestId } from "./format";
import { localizedName } from "./localized";
import type { PortalNotification, StaffAlert } from "./types";

// Notifications written before the status model was simplified carry the old status names.
const LEGACY_STATUS: Record<string, string> = {
  scheduled: "new",
  received: "new",
  repairing: "in_progress",
  ready_for_pickup: "ready",
  closed: "completed",
};

const STATUS_FROM_EN: Record<string, string> = {
  New: "new",
  Scheduled: "scheduled",
  Received: "received",
  Diagnosing: "diagnosing",
  "Awaiting parts": "awaiting_parts",
  Repairing: "repairing",
  "In progress": "in_progress",
  Paused: "paused",
  "Ready for pickup": "ready",
  Replaced: "replaced",
  Refunded: "refunded",
  Rejected: "rejected",
  "Awaiting decision": "awaiting_decision",
  Completed: "completed",
  "Picked up": "picked_up",
  Cancelled: "cancelled",
  Closed: "closed",
};

function inferredFields(item: { message: string }) {
  const message = item.message;
  const customer = message.match(/^We received your (\w+) request for (.+)\.$/);
  if (customer) {
    return { code: "createdByCustomer", type: customer[1], productName: customer[2], status: "" };
  }
  const staff = message.match(/^A (\w+) request was created for your (.+)\.$/);
  if (staff) {
    return { code: "createdByStaff", type: staff[1], productName: staff[2], status: "" };
  }
  const status = message.match(/^Your (\w+) for (.+) is now (.+)\.$/);
  if (status) {
    return {
      code: "status",
      type: status[1],
      productName: status[2],
      status: STATUS_FROM_EN[status[3]] ?? status[3],
    };
  }
  return null;
}

export function notificationText(item: PortalNotification | StaffAlert, t: TFunction, language?: string) {
  const inferred = item.code ? null : inferredFields(item);
  const code = item.code || inferred?.code;
  const product = localizedName(
    {
      name: String(item.params?.productName ?? item.params?.product ?? inferred?.productName ?? ""),
      nameUz: typeof item.params?.nameUz === "string" ? item.params.nameUz : null,
      nameRu: typeof item.params?.nameRu === "string" ? item.params.nameRu : null,
      nameEn: typeof item.params?.nameEn === "string" ? item.params.nameEn : null,
    },
    language,
  );
  const typeKey = typeof item.params?.type === "string" ? item.params.type : inferred?.type;
  const statusKey = typeof item.params?.status === "string" ? item.params.status : inferred?.status;
  const type = typeKey ? t(`type.${typeKey}`) : "";
  const status = statusKey ? t(`customerStatus.${LEGACY_STATUS[statusKey] ?? statusKey}`) : "";
  const displayId = typeof item.params?.displayId === "string" ? formatRequestId(item.params.displayId) : "";
  const count = item.params?.stockQuantity ?? item.params?.count;
  if (code) {
    return t(`notify.${code}`, { ...item.params, type, product, status, id: displayId, count, defaultValue: item.message });
  }
  return item.message;
}
