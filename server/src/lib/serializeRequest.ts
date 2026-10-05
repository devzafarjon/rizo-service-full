import { Prisma } from "@prisma/client";
import { computeWarrantyStatus, money, toDateOnly } from "./warranty.js";
import { jobTimer } from "./techBoard.js";
import { isDoneStatus, isTerminalStatus } from "./status.js";

export const requestInclude = Prisma.validator<Prisma.ServiceRequestInclude>()({
  customer: { select: { id: true, name: true, phone: true, address: true, regionCode: true } },
  product: true,
  assignedTechnician: { select: { id: true, name: true, technicianType: true, isAvailable: true } },
  sale: { include: { product: true } },
  pauses: { where: { resumedAt: null }, take: 1 },
  payments: { select: { kind: true, amount: true } },
  estimates: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true, validUntil: true } },
  serviceCenter: { select: { id: true, name: true } },
});

export type RequestRecord = Prisma.ServiceRequestGetPayload<{ include: typeof requestInclude }>;

export type CustomerLocation = {
  address: string;
  lat: number | null;
  lng: number | null;
};

export function serializeLocation(value: Prisma.JsonValue | null): CustomerLocation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const loc = value as Record<string, unknown>;
  if (typeof loc.address !== "string" || !loc.address.trim()) {
    return null;
  }
  return {
    address: loc.address.trim(),
    lat: typeof loc.lat === "number" ? loc.lat : null,
    lng: typeof loc.lng === "number" ? loc.lng : null,
  };
}

function paymentBreakdown(request: Pick<RequestRecord, "payments" | "finalCost" | "estimatedCost">) {
  const paid = request.payments.filter((row) => row.kind === "payment").reduce((sum, row) => sum + money(row.amount), 0);
  const refunded = request.payments.filter((row) => row.kind === "refund").reduce((sum, row) => sum + money(row.amount), 0);
  const due = request.finalCost != null ? money(request.finalCost) : request.estimatedCost != null ? money(request.estimatedCost) : 0;
  const net = paid - refunded;
  return { due, paid, refunded, balance: Math.max(0, due - net) };
}

export function serializeRequest(request: RequestRecord) {
  const activePause = request.pauses.find((pause) => pause.resumedAt == null) ?? null;
  const timer = jobTimer(request.status, request, activePause);
  const warrantyStatus = request.sale
    ? computeWarrantyStatus(request.sale.warrantyMonths, request.sale.warrantyExpiry)
    : request.warrantyStatus;
  return {
    id: request.id,
    displayId: request.displayId,
    type: request.type,
    source: request.source,
    submittedByCustomer: request.submittedByCustomer,
    saleId: request.saleId,
    customerId: request.customerId,
    productId: request.productId,
    issueDescription: request.issueDescription,
    defectType: request.defectType,
    resolutionType: request.resolutionType,
    decision: request.decision,
    decisionNote: request.decisionNote,
    rejectionReason: request.rejectionReason,
    serialNumber: request.serialNumber,
    scheduledAt: request.scheduledAt?.toISOString() ?? null,
    enRouteAt: request.enRouteAt?.toISOString() ?? null,
    legalDueAt: request.legalDueAt?.toISOString() ?? null,
    isLegallyOverdue: Boolean(request.legalDueAt) && request.legalDueAt!.getTime() < Date.now() && !isDoneStatus(request.status) && !isTerminalStatus(request.status),
    isRepeat: request.isRepeat,
    repeatOfId: request.repeatOfId,
    repairWarrantyUntil: request.repairWarrantyUntil ? toDateOnly(request.repairWarrantyUntil) : null,
    fiscalReceiptNumber: request.fiscalReceiptNumber,
    intakeChecklist: Array.isArray(request.intakeChecklist) ? (request.intakeChecklist as string[]) : [],
    intakeNotes: request.intakeNotes,
    intakeSignatureUrl: request.intakeSignatureUrl,
    defectCodeId: request.defectCodeId,
    returnReasonId: request.returnReasonId,
    serviceCenter: request.serviceCenter,
    trackingToken: request.trackingToken,
    estimate: request.estimates[0]
      ? {
          id: request.estimates[0].id,
          status:
            request.estimates[0].status === "sent" && request.estimates[0].validUntil.getTime() < Date.now()
              ? "expired"
              : request.estimates[0].status,
        }
      : null,
    payment: paymentBreakdown(request),
    locationType: request.locationType,
    customerLocation: serializeLocation(request.customerLocation),
    technicianTypeRequired: request.technicianTypeRequired,
    assignedTechnicianId: request.assignedTechnicianId,
    status: request.status,
    priority: request.priority,
    warrantyStatus,
    isPaidRepair: request.isPaidRepair,
    estimatedCost: request.estimatedCost == null ? null : money(request.estimatedCost),
    finalCost: request.finalCost == null ? null : money(request.finalCost),
    paymentStatus: request.paymentStatus,
    receivedAt: request.receivedAt?.toISOString() ?? null,
    assignedAt: request.assignedAt?.toISOString() ?? null,
    acceptedAt: request.acceptedAt?.toISOString() ?? null,
    arrivedAt: request.arrivedAt?.toISOString() ?? null,
    completedAt: request.completedAt?.toISOString() ?? null,
    overdueAt: request.overdueAt?.toISOString() ?? null,
    // Live from the timer, so a pause or resume is reflected immediately (the 60 s job only handles notifications).
    isOverdue: Boolean(timer) && timer!.startsAt.getTime() + timer!.durationMs <= Date.now(),
    pickupConfirmedAt: request.pickupConfirmedAt?.toISOString() ?? null,
    pickupConfirmationType: request.pickupConfirmationType,
    pickupSignatureUrl: request.pickupSignatureUrl,
    createdAt: request.createdAt.toISOString(),
    // Countdown shown on cards: 1 day New, 3 days In progress, technician-set when Paused.
    timer: timer ? { startsAt: timer.startsAt.toISOString(), durationMs: timer.durationMs } : null,
    activePause: activePause
      ? {
          id: activePause.id,
          reason: activePause.reason,
          pausedAt: activePause.pausedAt.toISOString(),
          customTimerHours: Number(activePause.customTimerHours),
        }
      : null,
    customer: request.customer,
    product: request.product,
    assignedTechnician: request.assignedTechnician,
    sale: request.sale
      ? {
          id: request.sale.id,
          invoiceNumber: request.sale.invoiceNumber,
          saleDate: toDateOnly(request.sale.saleDate),
          warrantyMonths: request.sale.warrantyMonths,
          warrantyExpiry: toDateOnly(request.sale.warrantyExpiry),
          warrantyStatus: computeWarrantyStatus(request.sale.warrantyMonths, request.sale.warrantyExpiry),
          product: request.sale.product,
        }
      : null,
  };
}
