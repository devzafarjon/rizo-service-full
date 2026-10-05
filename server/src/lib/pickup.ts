import { savePickupSignature } from "./uploads.js";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";
import { writeAudit, type AuditActor } from "./audit.js";
import { notifyRequestStatus } from "./notifyCustomer.js";
import { publishRequest } from "./realtime.js";
import { requestInclude, serializeRequest } from "./serializeRequest.js";

/** Only finished in-shop jobs wait for the customer to collect the device. */
export function canConfirmPickup(status: string, pickupConfirmedAt: Date | null, locationType: string) {
  if (pickupConfirmedAt) return false;
  if (locationType !== "in_shop") return false;
  return status === "completed";
}

export async function confirmPickup(input: {
  requestId: string;
  actor: AuditActor;
  signatureDataUrl?: string | null;
}) {
  const existing = await prisma.serviceRequest.findUnique({
    where: { id: input.requestId },
    include: requestInclude,
  });
  if (!existing) throw new HttpError(404, "Service request not found");
  if (!canConfirmPickup(existing.status, existing.pickupConfirmedAt, existing.locationType)) {
    throw new HttpError(400, "This request is not waiting for pickup confirmation", "pickupNotReady");
  }
  const now = new Date();
  const signatureUrl = input.signatureDataUrl ? savePickupSignature(existing.id, input.signatureDataUrl) : null;
  const updated = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: {
      status: "picked_up",
      pickupConfirmedAt: now,
      pickupConfirmedBy: input.actor.id,
      pickupConfirmationType: signatureUrl ? "signature" : "tap",
      pickupSignatureUrl: signatureUrl,
    },
    include: requestInclude,
  });
  const serialized = serializeRequest(updated);
  publishRequest("request:updated", serialized);
  await notifyRequestStatus(updated);
  await writeAudit({
    actor: input.actor,
    action: "request.pickup",
    entityType: "ServiceRequest",
    entityId: updated.id,
    oldValue: { status: existing.status, pickupConfirmedAt: null },
    newValue: {
      status: updated.status,
      pickupConfirmedAt: now.toISOString(),
      type: signatureUrl ? "signature" : "tap",
    },
  });
  return serialized;
}
