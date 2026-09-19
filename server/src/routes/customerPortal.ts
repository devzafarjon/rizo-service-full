import { Router } from "express";
import type { LocationType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { initialStatusFor, paymentFor, pickAvailableTechnician } from "../lib/assignment.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { notifyRequestCreated, serializeNotification } from "../lib/notifyCustomer.js";
import { serializeNamed } from "../lib/named.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { publishRequest } from "../lib/realtime.js";
import { requestInclude, serializeRequest } from "../lib/serializeRequest.js";
import { isDoneStatus } from "../lib/techBoard.js";
import { computeWarrantyStatus, money, toDateOnly } from "../lib/warranty.js";
import { allocateDisplayId } from "../lib/displayId.js";
import { customerAuth } from "../middleware/customerAuth.js";

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
  })
  .superRefine((data, ctx) => {
    if (data.locationType === "on_site" && !data.customerLocation?.address) {
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

const feedbackSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
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
  sale: { select: { invoiceNumber: true, warrantyExpiry: true, warrantyMonths: true } },
  feedback: true,
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
    res.json({ requests: requests.map(serializePortalRequest) });
  }),
);

customerPortalRouter.get(
  "/requests/:id",
  asyncHandler(async (req, res) => {
    const request = await loadOwnRequest(req.customer!.sub, req.params.id);
    res.json({ request: serializePortalRequest(request) });
  }),
);

customerPortalRouter.post(
  "/requests",
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req.body);
    const customer = await prisma.customer.findUnique({ where: { id: req.customer!.sub } });
    if (!customer) {
      throw new HttpError(401, "Account no longer exists");
    }

    let sale = null;
    if (body.saleId) {
      sale = await prisma.sale.findUnique({
        where: { id: body.saleId },
        include: { product: true },
      });
      if (!sale || sale.customerId !== customer.id) {
        throw new HttpError(400, "This purchase was not found on your account");
      }
    }

    const productId = sale ? sale.productId : body.productId;
    if (!productId) {
      throw new HttpError(400, "Select a past purchase or a product");
    }
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new HttpError(400, "Product not found");
    }

    const warrantyStatus = sale
      ? computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry)
      : "not_applicable";
    const payment = paymentFor(body.type, warrantyStatus);
    const status = initialStatusFor(body.type);
    const now = new Date();
    const technicianTypeRequired = body.locationType === "on_site" ? "mobile" : "service_center";
    const picked = await pickAvailableTechnician(technicianTypeRequired);

    const customerLocation =
      body.locationType === "on_site" && body.customerLocation
        ? {
            address: body.customerLocation.address,
            lat: typeof body.customerLocation.lat === "number" ? body.customerLocation.lat : null,
            lng: typeof body.customerLocation.lng === "number" ? body.customerLocation.lng : null,
          }
        : Prisma.JsonNull;

    const created = await prisma.$transaction(async (tx) => {
      const displayId = await allocateDisplayId(tx, {
        regionCode: customer.regionCode,
        address: customer.address,
        extraAddress: body.customerLocation?.address,
        at: now,
      });
      return tx.serviceRequest.create({
        data: {
          displayId,
          type: body.type,
          source: "rizo_service",
          submittedByCustomer: true,
          saleId: sale?.id ?? null,
          customerId: customer.id,
          productId: product.id,
          issueDescription: body.issueDescription,
          defectType: body.type === "repair" ? body.defectType ?? null : null,
          locationType: body.locationType as LocationType,
          customerLocation,
          technicianTypeRequired,
          assignedTechnicianId: picked?.id ?? null,
          status,
          priority: "medium",
          warrantyStatus,
          isPaidRepair: payment.isPaidRepair,
          paymentStatus: payment.paymentStatus,
          receivedAt: now,
        },
        include: requestInclude,
      });
    });

    const serialized = serializeRequest(created);
    publishRequest("request:created", serialized);
    await notifyRequestCreated(created);

    res.status(201).json({ request: serializePortalRequest(await loadOwnRequest(customer.id, created.id)) });
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
        },
      });
    } catch (error) {
      handlePrismaError(error);
    }
    res.status(201).json({ request: serializePortalRequest(await loadOwnRequest(req.customer!.sub, request.id)) });
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

function serializePortalRequest(request: PortalRecord) {
  const done = isDoneStatus(request.status);
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
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt?.toISOString() ?? null,
    submittedByCustomer: request.submittedByCustomer,
    product: request.product,
    assignedTechnician: request.assignedTechnician,
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
          createdAt: request.feedback.createdAt.toISOString(),
        }
      : null,
    canFeedback: done && !request.feedback,
  };
}
