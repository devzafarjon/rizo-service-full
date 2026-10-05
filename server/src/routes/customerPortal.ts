import { Router } from "express";
import type { LocationType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { serializeNotification } from "../lib/notifyCustomer.js";
import { serializeNamed } from "../lib/named.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { publishRequest } from "../lib/realtime.js";
import { isDoneStatus, isTerminalStatus } from "../lib/status.js";
import { computeWarrantyStatus, money, toDateOnly, warrantyExpiryFor } from "../lib/warranty.js";
import { createServiceRequest } from "../lib/createRequest.js";
import { approveEstimate, declineEstimate, estimateInclude, serializeEstimate } from "../lib/estimates.js";
import { advanceAfterApproval } from "./requests.js";
import { staffActor } from "../lib/audit.js";
import { notifyAdmins } from "../lib/notifyStaff.js";
import { paymentSummary } from "../lib/payments.js";
import { tashkentCalendarDate } from "../lib/displayId.js";
import { parseDateOnly } from "../lib/warranty.js";
import { customerAuth } from "../middleware/customerAuth.js";
import { canConfirmPickup, confirmPickup } from "../lib/pickup.js";
import { customerActor } from "../lib/audit.js";
import { acceptJobPhotos, publicPhotoUrl } from "../lib/uploads.js";

const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === "" || value == null) return undefined;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

const locationSchema = z.object({
  address: z.string().trim().min(1, "Address is required for on-site visits"),
  lat: optionalNumber.refine((value) => value == null || (value >= -90 && value <= 90), "Latitude is invalid"),
  lng: optionalNumber.refine((value) => value == null || (value >= -180 && value <= 180), "Longitude is invalid"),
});

const createSchema = z
  .object({
    type: z.enum(["installation", "repair"]),
    saleId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    productId: z.string().optional().nullable(),
    issueDescription: z.string().trim().min(1, "Describe the issue"),
    defectType: z.enum(["dead_on_arrival", "failed_during_use"]).optional().nullable(),
    locationType: z.enum(["in_shop", "on_site"]),
    customerLocation: locationSchema.optional().nullable(),
    serialNumber: z.string().trim().max(80).optional().nullable(),
    serviceCenterId: z.string().trim().min(1).optional().nullable(),
    scheduledAt: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((value) => (value ? new Date(value) : null))
      .refine((value) => value == null || !Number.isNaN(value.getTime()), "Enter a valid date and time"),
  })
  .superRefine((data, ctx) => {
    if (data.type === "installation" && data.locationType === "in_shop") {
      ctx.addIssue({
        code: "custom",
        message: "Installation is only done at the customer's address",
        path: ["locationType"],
      });
    }
    if ((data.locationType === "on_site" || data.type === "installation") && !data.customerLocation?.address) {
      ctx.addIssue({
        code: "custom",
        message: "Add your address for an on-site visit",
        path: ["customerLocation"],
      });
    }
    if (!data.saleId && !data.productId) {
      ctx.addIssue({
        code: "custom",
        message: "Select a past purchase or a product",
        path: ["productId"],
      });
    }
  });

export const FEEDBACK_TAGS = ["fast", "polite", "clean", "late", "not_fixed", "rude", "expensive", "unclear_price"] as const;

const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  tags: z.array(z.enum(FEEDBACK_TAGS)).max(FEEDBACK_TAGS.length).optional(),
  comment: z
    .string()
    .trim()
    .max(500, "Keep comments under 500 characters")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

const portalInclude = {
  product: true,
  assignedTechnician: { select: { name: true } },
  sale: { select: { invoiceNumber: true, warrantyExpiry: true, warrantyMonths: true, serialNumber: true } },
  feedback: true,
  serviceCenter: { select: { id: true, name: true, address: true, phone: true, workingHours: true } },
  estimates: { orderBy: { createdAt: "desc" as const }, take: 1, include: estimateInclude },
  notes: { where: { isVisibleToCustomer: true }, orderBy: { createdAt: "asc" as const }, include: { staffUser: { select: { name: true } } } },
  payments: { select: { kind: true, amount: true } },
} as const;

export const customerPortalRouter = Router();
customerPortalRouter.use(customerAuth);

customerPortalRouter.get(
  "/sales",
  asyncHandler(async (req, res) => {
    const sales = await prisma.sale.findMany({
      where: { customerId: req.customer!.sub },
      orderBy: { saleDate: "desc" },
      include: { product: true },
    });
    res.json({
      sales: sales.map((sale) => ({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        quantity: sale.quantity,
        saleDate: toDateOnly(sale.saleDate),
        pricePaid: money(sale.pricePaid),
        warrantyMonths: sale.warrantyMonths,
        warrantyExpiry: toDateOnly(sale.warrantyExpiry),
        warrantyStatus: computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry),
        serialNumber: sale.serialNumber,
        isVerified: sale.isVerified,
        installationDate: sale.installationDate ? toDateOnly(sale.installationDate) : null,
        voided: Boolean(sale.voidedAt),
        product: sale.product,
      })),
    });
  }),
);

customerPortalRouter.get(
  "/products",
  asyncHandler(async (_req, res) => {
    const products = await prisma.product.findMany({ orderBy: { name: "asc" } });
    res.json({
      products: products.map((product) => ({
        id: product.id,
        ...serializeNamed(product),
        sku: product.sku,
        category: product.category,
      })),
    });
  }),
);

customerPortalRouter.get(
  "/requests",
  asyncHandler(async (req, res) => {
    const requests = await prisma.serviceRequest.findMany({
      where: { customerId: req.customer!.sub },
      orderBy: { createdAt: "desc" },
      include: portalInclude,
    });
    res.json({ requests: await Promise.all(requests.map((row) => serializePortalRequest(row, false))) });
  }),
);

customerPortalRouter.get(
  "/requests/:id",
  asyncHandler(async (req, res) => {
    const request = await loadOwnRequest(req.customer!.sub, req.params.id);
    res.json({ request: await serializePortalRequest(request) });
  }),
);

customerPortalRouter.post(
  "/requests",
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req.body);
    const result = await createServiceRequest({
      ...body,
      customerId: req.customer!.sub,
      saleId: body.saleId,
      productId: body.productId ?? null,
      customerLocation: body.customerLocation ?? null,
      serviceCenterId: body.serviceCenterId ?? null,
      submittedByCustomer: true,
      source: "rizo_service",
    });
    res.status(201).json({ request: await serializePortalRequest(await loadOwnRequest(req.customer!.sub, result.request.id)) });
  }),
);

customerPortalRouter.post(
  "/requests/:id/estimates/:estimateId/approve",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ selectedOptionalLineIds: z.array(z.string()).optional() }), req.body ?? {});
    const request = await loadOwnRequest(req.customer!.sub, req.params.id);
    const estimate = request.estimates[0];
    if (!estimate || estimate.id !== req.params.estimateId) throw new HttpError(404, "Estimate not found");
    const result = await approveEstimate({
      estimateId: estimate.id,
      by: { kind: "customer", id: req.customer!.sub, name: req.customer!.name },
      selectedOptionalLineIds: body.selectedOptionalLineIds ?? [],
    });
    await advanceAfterApproval(request.id, result.waitingForParts, { id: req.customer!.sub, type: "customer", name: req.customer!.name });
    res.json({ request: await serializePortalRequest(await loadOwnRequest(req.customer!.sub, request.id)) });
  }),
);

customerPortalRouter.post(
  "/requests/:id/estimates/:estimateId/decline",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ reason: z.string().trim().max(300).default("") }), req.body ?? {});
    const request = await loadOwnRequest(req.customer!.sub, req.params.id);
    const estimate = request.estimates[0];
    if (!estimate || estimate.id !== req.params.estimateId) throw new HttpError(404, "Estimate not found");
    await declineEstimate({ estimateId: estimate.id, reason: body.reason, by: { kind: "customer", id: req.customer!.sub, name: req.customer!.name } });
    res.json({ request: await serializePortalRequest(await loadOwnRequest(req.customer!.sub, request.id)) });
  }),
);

customerPortalRouter.post(
  "/requests/:id/comments",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ text: z.string().trim().min(1, "Write a message").max(1000) }), req.body);
    const request = await loadOwnRequest(req.customer!.sub, req.params.id);
    if (request.status === "cancelled") throw new HttpError(400, "This request is cancelled", "requestClosed");
    await prisma.requestNote.create({
      data: {
        serviceRequestId: request.id,
        userId: req.customer!.sub,
        authorScope: "customer",
        customerId: req.customer!.sub,
        noteText: body.text,
        isVisibleToCustomer: true,
      },
    });
    await notifyAdmins({
      message: `New message on ${request.displayId}`,
      code: "customerMessage",
      serviceRequestId: request.id,
      params: { displayId: request.displayId, text: body.text.slice(0, 120) },
    });
    publishRequest("request:updated", { id: request.id, customerId: request.customerId });
    res.status(201).json({ request: await serializePortalRequest(await loadOwnRequest(req.customer!.sub, request.id)) });
  }),
);

customerPortalRouter.post(
  "/sales/register",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        productId: z.string().min(1, "Select a product"),
        serialNumber: z.string().trim().min(1, "Enter the serial number").max(80),
        purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD)"),
        invoiceNumber: z.string().trim().max(60).optional().nullable(),
        pricePaid: z.coerce.number().nonnegative().optional(),
      }),
      req.body,
    );
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product) throw new HttpError(400, "Product not found");
    const saleDate = parseDateOnly(body.purchaseDate);
    if (saleDate.getTime() > Date.now()) throw new HttpError(400, "The purchase date cannot be in the future", "futureDate");
    const duplicate = await prisma.sale.findFirst({ where: { serialNumber: body.serialNumber, productId: product.id } });
    if (duplicate) throw new HttpError(409, "This serial number is already registered", "serialExists");
    const stub = { saleDate, installationDate: null, warrantyMonths: product.warrantyMonths, extensionMonths: 0 };
    const sale = await prisma.sale.create({
      data: {
        customerId: req.customer!.sub,
        productId: product.id,
        quantity: 1,
        saleDate,
        pricePaid: body.pricePaid ?? 0,
        warrantyMonths: product.warrantyMonths,
        warrantyExpiry: warrantyExpiryFor(stub, product),
        invoiceNumber: body.invoiceNumber?.trim() ? body.invoiceNumber.trim().toUpperCase() : `REG-${Date.now().toString(36).toUpperCase()}`,
        serialNumber: body.serialNumber,
        source: "registered",
        isVerified: false,
      },
      include: { product: true },
    });
    await notifyAdmins({
      message: `A customer registered a product (${product.name})`,
      code: "productRegistered",
      params: { product: product.name, serial: body.serialNumber },
    });
    res.status(201).json({ sale: { id: sale.id, invoiceNumber: sale.invoiceNumber, isVerified: sale.isVerified } });
  }),
);

customerPortalRouter.post(
  "/requests/:id/photos",
  acceptJobPhotos,
  asyncHandler(async (req, res) => {
    const request = await loadOwnRequest(req.customer!.sub, req.params.id);
    if (isDoneStatus(request.status)) {
      throw new HttpError(400, "This request is already completed");
    }
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new HttpError(400, "Choose at least one photo");
    }
    await prisma.requestPhoto.createMany({
      data: files.map((file) => ({
        serviceRequestId: request.id,
        photoUrl: publicPhotoUrl(request.id, file.filename),
        uploadedBy: req.customer!.name,
        customerId: req.customer!.sub,
      })),
    });
    res.status(201).json({ request: await serializePortalRequest(await loadOwnRequest(req.customer!.sub, request.id)) });
  }),
);

customerPortalRouter.post(
  "/requests/:id/feedback",
  asyncHandler(async (req, res) => {
    const body = parseBody(feedbackSchema, req.body);
    const request = await loadOwnRequest(req.customer!.sub, req.params.id);
    if (!isDoneStatus(request.status)) {
      throw new HttpError(400, "Feedback is available after the job is completed");
    }
    if (request.feedback) {
      throw new HttpError(409, "You already left feedback for this request");
    }
    try {
      await prisma.feedback.create({
        data: {
          serviceRequestId: request.id,
          customerId: req.customer!.sub,
          rating: body.rating,
          comment: body.comment ?? null,
          tags: [...new Set(body.tags ?? [])],
        },
      });
    } catch (error) {
      handlePrismaError(error);
    }
    res.status(201).json({ request: await serializePortalRequest(await loadOwnRequest(req.customer!.sub, request.id)) });
  }),
);

customerPortalRouter.post(
  "/requests/:id/pickup",
  asyncHandler(async (req, res) => {
    const request = await loadOwnRequest(req.customer!.sub, req.params.id);
    const signature = typeof req.body?.signature === "string" ? req.body.signature : null;
    await confirmPickup({
      requestId: request.id,
      actor: customerActor(req.customer),
      signatureDataUrl: signature,
    });
    res.json({ request: await serializePortalRequest(await loadOwnRequest(req.customer!.sub, request.id)) });
  }),
);

customerPortalRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const where = { customerId: req.customer!.sub };
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);
    res.json({
      notifications: notifications.map(serializeNotification),
      unreadCount,
    });
  }),
);

customerPortalRouter.patch(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { customerId: req.customer!.sub, isRead: false },
      data: { isRead: true },
    });
    const notifications = await prisma.notification.findMany({
      where: { customerId: req.customer!.sub },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({
      notifications: notifications.map(serializeNotification),
      unreadCount: 0,
    });
  }),
);

customerPortalRouter.patch(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, customerId: req.customer!.sub },
    });
    if (!existing) {
      throw new HttpError(404, "Notification not found");
    }
    const row = existing.isRead
      ? existing
      : await prisma.notification.update({
          where: { id: existing.id },
          data: { isRead: true },
        });
    res.json({ notification: serializeNotification(row) });
  }),
);

async function loadOwnRequest(customerId: string, id: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id, customerId },
    include: portalInclude,
  });
  if (!request) {
    throw new HttpError(404, "Request not found");
  }
  return request;
}

type PortalRecord = Prisma.ServiceRequestGetPayload<{ include: typeof portalInclude }>;

async function serializePortalRequest(request: PortalRecord, detail = true) {
  const done = isDoneStatus(request.status);
  const latest = request.estimates[0] ?? null;
  const estimateVisible = latest && latest.status !== "draft";
  const estimateStatus = latest ? (latest.status === "sent" && latest.validUntil.getTime() < Date.now() ? "expired" : latest.status) : null;
  const paid = request.payments.filter((row) => row.kind === "payment").reduce((sum, row) => sum + money(row.amount), 0);
  const refunded = request.payments.filter((row) => row.kind === "refund").reduce((sum, row) => sum + money(row.amount), 0);
  const due = request.finalCost != null ? money(request.finalCost) : request.estimatedCost != null ? money(request.estimatedCost) : 0;
  return {
    id: request.id,
    displayId: request.displayId,
    type: request.type,
    status: request.status,
    priority: request.priority,
    warrantyStatus: request.sale
      ? computeWarrantyStatus(request.sale.warrantyMonths, request.sale.warrantyExpiry)
      : request.warrantyStatus,
    locationType: request.locationType,
    issueDescription: request.issueDescription,
    serialNumber: request.serialNumber ?? request.sale?.serialNumber ?? null,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    scheduledAt: request.scheduledAt?.toISOString() ?? null,
    enRouteAt: request.enRouteAt && !isTerminalStatus(request.status) && !request.arrivedAt ? request.enRouteAt.toISOString() : null,
    dueBy: request.legalDueAt && !isTerminalStatus(request.status) ? request.legalDueAt.toISOString() : null,
    repairWarrantyUntil: request.repairWarrantyUntil ? toDateOnly(request.repairWarrantyUntil) : null,
    rejectionReason: request.status === "rejected" ? request.rejectionReason : null,
    submittedByCustomer: request.submittedByCustomer,
    product: request.product,
    // Customers only see the technician's first name, never contact details.
    assignedTechnician: request.assignedTechnician
      ? { name: request.assignedTechnician.name.trim().split(/\s+/)[0] }
      : null,
    serviceCenter: request.serviceCenter,
    trackingToken: request.trackingToken,
    sale: request.sale
      ? {
          invoiceNumber: request.sale.invoiceNumber,
          warrantyExpiry: toDateOnly(request.sale.warrantyExpiry),
          warrantyStatus: computeWarrantyStatus(request.sale.warrantyMonths, request.sale.warrantyExpiry),
        }
      : null,
    feedback: request.feedback
      ? {
          rating: request.feedback.rating,
          comment: request.feedback.comment,
          tags: request.feedback.tags,
          createdAt: request.feedback.createdAt.toISOString(),
        }
      : null,
    canFeedback: done && !request.feedback,
    pickupConfirmedAt: request.pickupConfirmedAt?.toISOString() ?? null,
    canConfirmPickup: canConfirmPickup(request.status, request.pickupConfirmedAt, request.locationType),
    payment: { due, paid, refunded, balance: Math.max(0, due - (paid - refunded)) },
    estimate:
      estimateVisible && latest
        ? {
            id: latest.id,
            status: estimateStatus,
            validUntil: latest.validUntil.toISOString(),
            note: latest.note,
            canRespond: estimateStatus === "sent",
            ...(detail
              ? await serializeEstimate(latest).then((full) => ({
                  total: full.total,
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
                }))
              : {}),
          }
        : null,
    // Only notes the office marked as visible, plus the customer's own messages.
    messages: request.notes.map((note) => ({
      id: note.id,
      text: note.noteText,
      fromCustomer: note.authorScope === "customer",
      createdAt: note.createdAt.toISOString(),
    })),
  };
}
