import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";
import { money } from "./warranty.js";

type Db = PrismaClient | Prisma.TransactionClient;

export type PaymentSummary = {
  due: number;
  paid: number;
  refunded: number;
  net: number;
  balance: number;
};

/** What the customer owes: the final cost once the job is done, otherwise the agreed or estimated cost. */
export async function paymentSummary(requestId: string, db: Db = prisma): Promise<PaymentSummary> {
  const request = await db.serviceRequest.findUnique({
    where: { id: requestId },
    select: { finalCost: true, estimatedCost: true, status: true, isPaidRepair: true },
  });
  const rows = await db.payment.groupBy({ by: ["kind"], where: { serviceRequestId: requestId }, _sum: { amount: true } });
  const paid = money(rows.find((row) => row.kind === "payment")?._sum.amount ?? 0);
  const refunded = money(rows.find((row) => row.kind === "refund")?._sum.amount ?? 0);
  const due = request ? money(request.finalCost ?? request.estimatedCost ?? 0) : 0;
  const net = paid - refunded;
  return { due, paid, refunded, net, balance: Math.max(0, due - net) };
}

/** Keeps `payment_status` in step with the recorded payments. */
export async function refreshPaymentStatus(requestId: string, db: Db = prisma) {
  const summary = await paymentSummary(requestId, db);
  const request = await db.serviceRequest.findUnique({ where: { id: requestId }, select: { finalCost: true, status: true } });
  const closed = request?.finalCost != null;
  let status: "not_required" | "pending" | "partial" | "paid";
  if (summary.due === 0 && summary.net <= 0) status = "not_required";
  else if (summary.balance <= 0) status = "paid";
  else if (summary.net > 0) status = "partial";
  else status = "pending";
  // While the job is still being estimated, nothing is owed yet.
  if (!closed && summary.due === 0) status = "not_required";
  await db.serviceRequest.update({ where: { id: requestId }, data: { paymentStatus: status } });
  return { ...summary, status };
}
