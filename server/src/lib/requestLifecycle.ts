import { Prisma } from "@prisma/client";
import type { RequestStatus } from "@prisma/client";
import { paymentFor, pickAvailableTechnician } from "./assignment.js";
import { allocateDisplayId, locationAddressFrom } from "./displayId.js";
import { prisma } from "./prisma.js";
import { requestInclude, type RequestRecord } from "./serializeRequest.js";
import { computeWarrantyStatus, addMonths } from "./warranty.js";

export function statusPatch(
  existing: Pick<
    RequestRecord,
    "type" | "status" | "locationType" | "receivedAt" | "acceptedAt" | "arrivedAt" | "completedAt"
  >,
  next: RequestStatus,
  now: Date,
) {
  const data: Prisma.ServiceRequestUpdateInput = { status: next };
  if (next === "received" && !existing.receivedAt) {
    data.receivedAt = now;
  }
  const enteringWork =
    next === "in_progress" ||
    next === "diagnosing" ||
    next === "repairing" ||
    next === "awaiting_parts" ||
    (existing.type === "maintenance" && next === "scheduled" && existing.status === "due");
  if (enteringWork && !existing.acceptedAt) {
    data.acceptedAt = now;
  }
  if (
    existing.locationType === "on_site" &&
    !existing.arrivedAt &&
    (enteringWork || next === "completed" || next === "closed" || next === "replaced")
  ) {
    data.arrivedAt = existing.acceptedAt ?? now;
  }
  if (next === "completed" || next === "closed" || next === "replaced") {
    data.completedAt = existing.completedAt ?? now;
    if (!existing.acceptedAt) {
      data.acceptedAt = now;
    }
  }
  return data;
}

export async function spawnNextMaintenance(completed: RequestRecord, now: Date) {
  const interval = completed.recurrenceIntervalMonths;
  if (completed.type !== "maintenance" || !completed.isRecurring || !interval) {
    return null;
  }
  const warrantyStatus = completed.sale
    ? computeWarrantyStatus(completed.sale.warrantyMonths, completed.sale.warrantyExpiry)
    : completed.warrantyStatus;
  const payment = paymentFor("maintenance", warrantyStatus);
  const picked = await pickAvailableTechnician(completed.technicianTypeRequired);
  const nextDueDate = addMonths(now, interval);
  return prisma.$transaction(async (tx) => {
    const displayId = await allocateDisplayId(tx, {
      regionCode: completed.customer.regionCode,
      address: completed.customer.address,
      extraAddress: locationAddressFrom(completed.customerLocation),
      at: now,
    });
    return tx.serviceRequest.create({
      data: {
        displayId,
        type: "maintenance",
        source: completed.source,
        submittedByCustomer: false,
        saleId: completed.saleId,
        customerId: completed.customerId,
        productId: completed.productId,
        issueDescription: completed.issueDescription,
        locationType: completed.locationType,
        customerLocation: completed.customerLocation === null ? Prisma.JsonNull : completed.customerLocation,
        technicianTypeRequired: completed.technicianTypeRequired,
        assignedTechnicianId: picked?.id ?? null,
        status: "due",
        priority: completed.priority,
        warrantyStatus,
        isPaidRepair: payment.isPaidRepair,
        paymentStatus: payment.paymentStatus,
        isRecurring: true,
        recurrenceIntervalMonths: interval,
        nextDueDate,
        receivedAt: now,
      },
      include: requestInclude,
    });
  });
}

export async function maybeSpawnAfterComplete(previous: RequestRecord, next: RequestStatus, updated: RequestRecord, now: Date) {
  const becameComplete = previous.status !== next && (next === "completed" || next === "closed");
  if (!becameComplete) return null;
  return spawnNextMaintenance(updated, now);
}
