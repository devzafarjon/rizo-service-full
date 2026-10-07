import { HttpError } from "./httpError.js";
import { notifyAdmins } from "./notifyStaff.js";
import { prisma } from "./prisma.js";
import { publishRequest } from "./realtime.js";
import { getAppSettings } from "./settings.js";
import { isDoneStatus } from "./status.js";

export const FEEDBACK_TAG_LIST = ["fast", "polite", "clean", "late", "not_fixed", "rude", "expensive", "unclear_price"] as const;

/** A customer's rating of a finished job (the portal, the tracking page and the Telegram bot all use this). */
export async function submitFeedback(input: { customerId: string; requestId: string; rating: number; comment?: string | null; tags?: string[] }) {
  const request = await prisma.serviceRequest.findFirst({ where: { id: input.requestId, customerId: input.customerId }, include: { feedback: true, assignedTechnician: { select: { name: true } } } });
  if (!request) throw new HttpError(404, "Request not found");
  if (!isDoneStatus(request.status)) throw new HttpError(400, "Feedback is available after the job is completed");
  if (request.feedback) throw new HttpError(409, "You already left feedback for this request");
  const tags = [...new Set(input.tags ?? [])].filter((tag) => (FEEDBACK_TAG_LIST as readonly string[]).includes(tag));
  await prisma.feedback.create({ data: { serviceRequestId: request.id, customerId: input.customerId, rating: input.rating, comment: input.comment ?? null, tags } });
  // An unhappy customer should not wait for the next report: tell the admins right away.
  const { lowRatingThreshold } = await getAppSettings();
  if (input.rating <= lowRatingThreshold) {
    await notifyAdmins({
      message: `${request.displayId}: the customer rated ${input.rating}/5`,
      code: "lowRating",
      serviceRequestId: request.id,
      params: { displayId: request.displayId, rating: input.rating, comment: input.comment ?? "", tags, technician: request.assignedTechnician?.name ?? "" },
    });
  }
  return request;
}

/** A message from the customer on a request (shown to the office as a note and as an alert). */
export async function postCustomerMessage(input: { customerId: string; requestId: string; text: string }) {
  const request = await prisma.serviceRequest.findFirst({ where: { id: input.requestId, customerId: input.customerId } });
  if (!request) throw new HttpError(404, "Request not found");
  if (request.status === "cancelled") throw new HttpError(400, "This request is cancelled", "requestClosed");
  await prisma.requestNote.create({
    data: { serviceRequestId: request.id, userId: input.customerId, authorScope: "customer", customerId: input.customerId, noteText: input.text, isVisibleToCustomer: true },
  });
  await notifyAdmins({
    message: `New message on ${request.displayId}`,
    code: "customerMessage",
    serviceRequestId: request.id,
    params: { displayId: request.displayId, text: input.text.slice(0, 120) },
  });
  publishRequest("request:updated", { id: request.id, customerId: request.customerId });
  return request;
}
