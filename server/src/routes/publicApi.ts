import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { serializeNamed } from "../lib/named.js";
import { approveEstimate, declineEstimate, estimateInclude, serializeEstimate } from "../lib/estimates.js";
import { loadTimeline } from "../lib/timeline.js";
import { isDoneStatus, isTerminalStatus } from "../lib/status.js";
import { computeWarrantyStatus, money, toDateOnly } from "../lib/warranty.js";
import { normalizeDisplayIdQuery } from "../lib/displayId.js";
import { advanceAfterApproval } from "./requests.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { canConfirmPickup } from "../lib/pickup.js";
import { confirmVisit } from "../lib/visits.js";
import { serializeArticle } from "../lib/helpArticles.js";
import { env } from "../config.js";
import { paymentLinks } from "../lib/paymentLinks.js";
import { paymentSummary } from "../lib/payments.js";

// Anyone holding the unguessable tracking link (printed on the receipt / QR tag, or sent by SMS) can follow
// a request and answer its estimate without signing in. The link carries no personal data beyond the request.
export const publicRouter = Router();

const lookupLimiter = rateLimit({ name: "track-lookup", windowMs: 15 * 60 * 1000, max: 15 });
const tokenLimiter = rateLimit({ name: "track-token", windowMs: 60 * 1000, max: 60 });

const trackInclude = {
  product: true,
  assignedTechnician: { select: { name: true } },
  sale: { select: { invoiceNumber: true, warrantyExpiry: true, warrantyMonths: true } },
  serviceCenter: { select: { name: true, address: true, phone: true, workingHours: true } },
  estimates: { orderBy: { createdAt: "desc" as const }, take: 1, include: estimateInclude },
  payments: { select: { kind: true, amount: true } },
  pauses: { where: { resumedAt: null }, take: 1 },
};

async function loadByToken(token: string) {
  const request = await prisma.serviceRequest.findUnique({ where: { trackingToken: token }, include: trackInclude });
  if (!request) throw new HttpError(404, "Request not found");
  return request;
}

type TrackRecord = Awaited<ReturnType<typeof loadByToken>>;

async function serializeTrack(request: TrackRecord) {
  const latest = request.estimates[0] ?? null;
  const visible = latest && latest.status !== "draft" ? latest : null;
  const full = visible ? await serializeEstimate(visible) : null;
  const paid = request.payments.filter((row) => row.kind === "payment").reduce((sum, row) => sum + money(row.amount), 0);
  const refunded = request.payments.filter((row) => row.kind === "refund").reduce((sum, row) => sum + money(row.amount), 0);
  const due = request.finalCost != null ? money(request.finalCost) : request.estimatedCost != null ? money(request.estimatedCost) : 0;
  return {
    displayId: request.displayId,
    type: request.type,
    status: request.status,
    locationType: request.locationType,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    dueBy: request.legalDueAt && !isTerminalStatus(request.status) ? request.legalDueAt.toISOString() : null,
    scheduledAt: request.scheduledAt?.toISOString() ?? null,
    visit: { slot: request.visitSlot, confirmed: Boolean(request.visitConfirmedAt), canConfirm: Boolean(request.scheduledAt) && !request.visitConfirmedAt && !isTerminalStatus(request.status) && !isDoneStatus(request.status) },
    eta: request.etaMinutes != null && request.etaSetAt && request.enRouteAt && !request.arrivedAt && !isTerminalStatus(request.status) ? { minutes: request.etaMinutes, setAt: request.etaSetAt.toISOString() } : null,
    product: { ...serializeNamed(request.product), sku: request.product.sku },
    technicianFirstName: request.assignedTechnician?.name.trim().split(/\s+/)[0] ?? null,
    rejectionReason: request.status === "rejected" ? request.rejectionReason : null,
    warrantyStatus: request.sale ? computeWarrantyStatus(request.sale.warrantyMonths, request.sale.warrantyExpiry) : request.warrantyStatus,
    warrantyUntil: request.sale ? toDateOnly(request.sale.warrantyExpiry) : null,
    repairWarrantyUntil: request.repairWarrantyUntil ? toDateOnly(request.repairWarrantyUntil) : null,
    serviceCenter: request.serviceCenter,
    canConfirmPickup: canConfirmPickup(request.status, request.pickupConfirmedAt, request.locationType),
    isDone: isDoneStatus(request.status),
    payment: { due, paid, refunded, balance: Math.max(0, due - (paid - refunded)) },
    estimate: full
      ? {
          id: full.id,
          status: full.status,
          validUntil: full.validUntil,
          note: full.note,
          total: full.total,
          canRespond: full.status === "sent",
          lines: full.lines.map((line) => ({
            id: line.id,
            kind: line.kind,
            name: line.name,
            names: line.names,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            isOptional: line.isOptional,
            isSelected: line.isSelected,
          })),
        }
      : null,
    timeline: (await loadTimeline(request, { customerSafe: true })).map((event) => ({
      key: event.key,
      kind: event.kind,
      at: event.at,
      titleKey: event.titleKey,
      params: event.params,
    })),
  };
}

// Find the link from the request number and the phone number on the account.
publicRouter.post(
  "/track",
  lookupLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ displayId: z.string().trim().min(6), phone: z.string().trim().min(6) }), req.body);
    const request = await prisma.serviceRequest.findUnique({
      where: { displayId: normalizeDisplayIdQuery(body.displayId) },
      select: { trackingToken: true, customer: { select: { phone: true } } },
    });
    const digits = body.phone.replace(/\D/g, "");
    if (!request || !digits || request.customer.phone.slice(-9) !== digits.slice(-9)) {
      throw new HttpError(404, "No request matches that number and phone", "trackNotFound");
    }
    res.json({ token: request.trackingToken });
  }),
);

publicRouter.get(
  "/track/:token",
  tokenLimiter,
  asyncHandler(async (req, res) => {
    res.json({ request: await serializeTrack(await loadByToken(req.params.token)) });
  }),
);

publicRouter.post(
  "/track/:token/estimate/:estimateId/approve",
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ selectedOptionalLineIds: z.array(z.string()).optional() }), req.body ?? {});
    const request = await loadByToken(req.params.token);
    const estimate = request.estimates[0];
    if (!estimate || estimate.id !== req.params.estimateId) throw new HttpError(404, "Estimate not found");
    const result = await approveEstimate({
      estimateId: estimate.id,
      by: { kind: "customer", id: "link", name: "Tracking link" },
      selectedOptionalLineIds: body.selectedOptionalLineIds ?? [],
    });
    await advanceAfterApproval(request.id, result.waitingForParts, { id: "link", type: "customer", name: "Tracking link" });
    res.json({ request: await serializeTrack(await loadByToken(req.params.token)) });
  }),
);

publicRouter.post(
  "/track/:token/estimate/:estimateId/decline",
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ reason: z.string().trim().max(300).default("") }), req.body ?? {});
    const request = await loadByToken(req.params.token);
    const estimate = request.estimates[0];
    if (!estimate || estimate.id !== req.params.estimateId) throw new HttpError(404, "Estimate not found");
    await declineEstimate({ estimateId: estimate.id, reason: body.reason, by: { kind: "customer", id: "link", name: "Tracking link" } });
    res.json({ request: await serializeTrack(await loadByToken(req.params.token)) });
  }),
);

// Self-help guides, optionally for one product category.
publicRouter.get(
  "/help",
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === "string" && req.query.category ? req.query.category : null;
    const rows = await prisma.helpArticle.findMany({
      where: { isPublished: true, ...(category ? { OR: [{ productCategory: category }, { productCategory: null }] } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });
    res.json({ articles: rows.map(serializeArticle) });
  }),
);

publicRouter.get(
  "/track/:token/pay-links",
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const request = await loadByToken(req.params.token);
    const summary = await paymentSummary(request.id);
    res.json(paymentLinks({ displayId: request.displayId, balance: summary.balance, returnUrl: `${env.clientOrigin}/t/${request.trackingToken}` }));
  }),
);

publicRouter.post(
  "/track/:token/visit/confirm",
  tokenLimiter,
  asyncHandler(async (req, res) => {
    const request = await loadByToken(req.params.token);
    await confirmVisit(request.id, { id: "link", type: "customer", name: "Tracking link" });
    res.json({ request: await serializeTrack(await loadByToken(req.params.token)) });
  }),
);

// Where to take a device: authorized service centers.
publicRouter.get(
  "/centers",
  asyncHandler(async (_req, res) => {
    const centers = await prisma.serviceCenter.findMany({ where: { isActive: true }, orderBy: [{ regionCode: "asc" }, { name: "asc" }] });
    res.json({
      centers: centers.map((center) => ({
        id: center.id,
        name: center.name,
        regionCode: center.regionCode,
        address: center.address,
        phone: center.phone,
        workingHours: center.workingHours,
        lat: center.lat,
        lng: center.lng,
        isAuthorized: center.isAuthorized,
      })),
    });
  }),
);
