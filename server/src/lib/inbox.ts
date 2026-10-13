import { prisma } from "./prisma.js";
import { partsOverview } from "./partsControl.js";
import { OPEN_STATUSES } from "./status.js";

export type InboxItem = {
  key: string;
  count: number;
  /** red = something is late or at risk, orange = needs a decision, blue = routine. */
  tone: "red" | "orange" | "blue";
  /** The website path the row opens (the apps map the key to their own screen). */
  to: string;
};

/**
 * "My work": what is waiting for the admin right now. Everything is counted from the live data, so a row disappears by
 * itself when it is dealt with (nothing to mark as read).
 */
export async function adminInbox(now = new Date()): Promise<{ items: InboxItem[]; total: number }> {
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const [unassigned, decision, overdue, legal, parts, pendingBrands, pendingModels, lowRatings, transfers] = await Promise.all([
    prisma.serviceRequest.count({ where: { assignedTechnicianId: null, status: { in: OPEN_STATUSES } } }),
    prisma.serviceRequest.count({ where: { status: "awaiting_decision" } }),
    prisma.serviceRequest.count({ where: { overdueAt: { not: null }, status: { in: OPEN_STATUSES } } }),
    prisma.serviceRequest.count({ where: { legalDueAt: { lt: now }, status: { in: OPEN_STATUSES } } }),
    partsOverview(),
    prisma.brand.count({ where: { approved: false } }),
    prisma.product.count({ where: { approved: false, brand: { approved: true } } }),
    prisma.feedback.count({ where: { rating: { lte: 2 }, createdAt: { gte: since } } }),
    prisma.stockTransfer.count({ where: { status: "requested" } }),
  ]);
  const rows: InboxItem[] = [
    { key: "legal", count: legal, tone: "red", to: "/app/requests?legal=1" },
    { key: "overdue", count: overdue, tone: "red", to: "/app/requests?overdue=1" },
    { key: "unassigned", count: unassigned, tone: "orange", to: "/app/requests?technicianId=unassigned" },
    { key: "decision", count: decision, tone: "orange", to: "/app/requests?status=awaiting_decision" },
    { key: "partsNoOrder", count: parts.noOrder, tone: "red", to: "/app/part-orders" },
    { key: "partsLate", count: parts.lateOrders, tone: "red", to: "/app/part-orders?tab=orders" },
    { key: "partsToOrder", count: parts.toOrder, tone: "orange", to: "/app/part-orders?tab=recommend" },
    { key: "transfers", count: transfers, tone: "blue", to: "/app/warehouses" },
    { key: "catalogPending", count: pendingBrands + pendingModels, tone: "blue", to: "/app/directory" },
    { key: "lowRatings", count: lowRatings, tone: "orange", to: "/app/reports/feedback" },
  ];
  const items = rows.filter((row) => row.count > 0);
  return { items, total: items.reduce((sum, row) => sum + row.count, 0) };
}
