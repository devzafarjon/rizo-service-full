import { completedStatusFor, isDoneStatus } from "./techBoard.js";
import { savePickupSignature } from "./uploads.js";
import { HttpError } from "./httpError.js";
import { prisma } from "./prisma.js";
import { writeAudit, type AuditActor } from "./audit.js";
import { notifyRequestStatus } from "./notifyCustomer.js";
import { publishRequest } from "./realtime.js";
import { requestInclude, serializeRequest } from "./serializeRequest.js";
import { statusPatch } from "./requestLifecycle.js";

export function canConfirmPickup(status: string, pickupConfirmedAt: Date | null) {
  if (pickupConfirmedAt) return false;
  return status === "ready_for_pickup" || status === "completed" || status === "closed";
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
  if (!canConfirmPickup(existing.status, existing.pickupConfirmedAt)) {
    throw new HttpError(400, "This request is not waiting for pickup confirmation", "pickupNotReady");
  }
  const now = new Date();
  const nextStatus = existing.status === "ready_for_pickup" ? completedStatusFor(existing.type) : existing.status;
  const signatureUrl = input.signatureDataUrl ? savePickupSignature(existing.id, input.signatureDataUrl) : existing.pickupSignatureUrl;
  const updated = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: {
      ...(nextStatus !== existing.status ? statusPatch(existing, nextStatus, now) : {}),
      pickupConfirmedAt: now,
      pickupConfirmedBy: input.actor.id,
      pickupSignatureUrl: signatureUrl,
    },
    include: requestInclude,
  });
  const serialized = serializeRequest(updated);
  publishRequest("request:updated", serialized);
  if (nextStatus !== existing.status) {
    await notifyRequestStatus(updated);
  }
  await writeAudit({
    actor: input.actor,
    action: "request.pickup",
    entityType: "ServiceRequest",
    entityId: updated.id,
    oldValue: { status: existing.status, pickupConfirmedAt: null },
    newValue: { status: updated.status, pickupConfirmedAt: now.toISOString() },
  });
  return serialized;
}

export { isDoneStatus };
