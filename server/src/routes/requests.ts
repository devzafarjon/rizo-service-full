import { Router } from "express";
import type { LocationType, RequestStatus, ServiceType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { initialStatusFor, paymentFor, pickAvailableTechnician } from "../lib/assignment.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { notifyRequestCreated, notifyRequestStatus } from "../lib/notifyCustomer.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { publishRequest } from "../lib/realtime.js";
import { maybeSpawnAfterComplete, statusPatch } from "../lib/requestLifecycle.js";
import { requestInclude, serializeRequest } from "../lib/serializeRequest.js";
import { serializeJobWork, workInclude } from "../lib/jobWork.js";
import { buildTimeline, serializePauses } from "../lib/timeline.js";
import { isAllowedStatus } from "../lib/status.js";
import { addMonths, computeWarrantyStatus, parseDateOnly } from "../lib/warranty.js";
import { allocateDisplayId, normalizeDisplayIdQuery } from "../lib/displayId.js";
import { serializeNamed } from "../lib/named.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

const patchSchema = z.object({
  status: z.enum([
    "scheduled",
    "in_progress",
    "completed",
    "received",
    "diagnosing",
    "awaiting_parts",
    "repairing",
    "ready_for_pickup",
    "replaced",
    "closed",
    "due",
  ]),
});

const SERVICE_TYPES: ServiceType[] = ["installation", "repair", "maintenance"];
const STATUSES: RequestStatus[] = [
  "scheduled",
  "in_progress",
  "completed",
  "received",
  "diagnosing",
  "awaiting_parts",
  "repairing",
  "ready_for_pickup",
  "replaced",
  "closed",
  "due",
];
const LOCATIONS: LocationType[] = ["in_shop", "on_site"];

const optionalId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional()
  .nullable();

const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === "" || value == null) return undefined;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  });

const locationSchema = z.object({
  address: z.string().trim().min(1, "Customer address is required for on-site jobs"),
  lat: optionalNumber.refine((value) => value == null || (value >= -90 && value <= 90), "Latitude is invalid"),
  lng: optionalNumber.refine((value) => value == null || (value >= -180 && value <= 180), "Longitude is invalid"),
});

const createSchema = z
  .object({
    type: z.enum(["installation", "repair", "maintenance"]),
    customerId: z.string().min(1, "Customer is required"),
    saleId: optionalId,
    productId: z.string().min(1, "Product is required"),
    issueDescription: z.string().trim().min(1, "Describe the issue"),
    defectType: z.enum(["dead_on_arrival", "failed_during_use"]).optional().nullable(),
    locationType: z.enum(["in_shop", "on_site"]),
    customerLocation: locationSchema.optional().nullable(),
    technicianTypeRequired: z.enum(["service_center", "mobile"]),
    assignedTechnicianId: optionalId,
    autoAssign: z.boolean().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    isRecurring: z.boolean().optional(),
    recurrenceIntervalMonths: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().int().min(1).max(24).optional(),
    ),
    nextDueDate: z
      .string()
      .optional()
      .nullable()
      .transform((value) => (value ? value : undefined))
      .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid next due date").optional()),
    source: z.enum(["rizo_market", "rizo_service"]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.locationType === "on_site" && !data.customerLocation?.address) {
      ctx.addIssue({
        code: "custom",
        message: "Customer location is required for on-site jobs",
        path: ["customerLocation"],
      });
    }
    if (data.type === "maintenance" && data.isRecurring && !data.recurrenceIntervalMonths) {
      ctx.addIssue({
        code: "custom",
        message: "Set how often this maintenance repeats",
        path: ["recurrenceIntervalMonths"],
      });
    }
  });

export const requestsRouter = Router();
requestsRouter.use(staffAuth, requireStaffRole("admin"));

requestsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const type = typeof req.query.type === "string" ? req.query.type : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId : "";
    const locationType = typeof req.query.locationType === "string" ? req.query.locationType : "";
    const technicianId = typeof req.query.technicianId === "string" ? req.query.technicianId : "";
    const priority = typeof req.query.priority === "string" ? req.query.priority : "";
    const warrantyStatus = typeof req.query.warrantyStatus === "string" ? req.query.warrantyStatus : "";

    const requests = await prisma.serviceRequest.findMany({
      where: {
        AND: [
          SERVICE_TYPES.includes(type as ServiceType) ? { type: type as ServiceType } : {},
          STATUSES.includes(status as RequestStatus) ? { status: status as RequestStatus } : {},
          LOCATIONS.includes(locationType as LocationType) ? { locationType: locationType as LocationType } : {},
          customerId ? { customerId } : {},
          technicianId === "unassigned" ? { assignedTechnicianId: null } : technicianId ? { assignedTechnicianId: technicianId } : {},
          priority === "low" || priority === "medium" || priority === "high" || priority === "urgent" ? { priority } : {},
          warrantyStatus === "in_warranty" || warrantyStatus === "expired" || warrantyStatus === "not_applicable"
            ? { warrantyStatus }
            : {},
          q
            ? {
                OR: [
                  { issueDescription: { contains: q, mode: "insensitive" } },
                  { customer: { name: { contains: q, mode: "insensitive" } } },
                  { product: { name: { contains: q, mode: "insensitive" } } },
                  { sale: { invoiceNumber: { contains: q, mode: "insensitive" } } },
                  { displayId: { contains: normalizeDisplayIdQuery(q), mode: "insensitive" } },
                  { id: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
      orderBy: { createdAt: "desc" },
      include: requestInclude,
    });
    res.json({ requests: requests.map(serializeRequest) });
  }),
);

requestsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const request = await prisma.serviceRequest.findUnique({
      where: { id: req.params.id },
      include: {
        ...requestInclude,
        ...workInclude,
        pauses: { orderBy: { pausedAt: "asc" } },
      },
    });
    if (!request) {
      throw new HttpError(404, "Service request not found");
    }
    const [services, parts] = await Promise.all([
      prisma.serviceCatalogItem.findMany({
        where: { productCategory: request.product.category },
        orderBy: { name: "asc" },
      }),
      prisma.sparePart.findMany({
        where: { productCategory: request.product.category },
        orderBy: { name: "asc" },
      }),
    ]);
    res.json({
      request: serializeRequest(request),
      pauses: serializePauses(request.pauses),
      timeline: buildTimeline(request),
      ...serializeJobWork(request),
      matchingServices: services.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategory: item.productCategory,
      })),
      matchingParts: parts.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategory: item.productCategory,
        stockQuantity: item.stockQuantity,
      })),
    });
  }),
);

requestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req.body);
    const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
    if (!customer) {
      throw new HttpError(400, "Customer not found");
    }

    let sale = null;
    if (body.saleId) {
      sale = await prisma.sale.findUnique({
        where: { id: body.saleId },
        include: { product: true },
      });
      if (!sale) {
        throw new HttpError(400, "Sale not found");
      }
      if (sale.customerId !== body.customerId) {
        throw new HttpError(400, "This sale does not belong to the selected customer");
      }
    }

    const productId = sale ? sale.productId : body.productId;
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

    let assignedTechnicianId: string | null = null;
    let assignmentMode: "manual" | "auto" | "unassigned" = "unassigned";
    if (body.assignedTechnicianId) {
      const technician = await prisma.staffUser.findUnique({ where: { id: body.assignedTechnicianId } });
      if (!technician || technician.role !== "technician") {
        throw new HttpError(400, "Technician not found");
      }
      if (technician.technicianType !== body.technicianTypeRequired) {
        throw new HttpError(400, "This technician does not match the required type");
      }
      assignedTechnicianId = technician.id;
      assignmentMode = "manual";
    } else if (body.autoAssign !== false) {
      const picked = await pickAvailableTechnician(body.technicianTypeRequired);
      assignedTechnicianId = picked?.id ?? null;
      assignmentMode = picked ? "auto" : "unassigned";
    }

    const isRecurring = body.type === "maintenance" && Boolean(body.isRecurring);
    const interval = isRecurring && typeof body.recurrenceIntervalMonths === "number" ? body.recurrenceIntervalMonths : null;
    let nextDueDate: Date | null = null;
    if (isRecurring && interval) {
      nextDueDate = body.nextDueDate ? parseDateOnly(body.nextDueDate) : addMonths(now, interval);
    }

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
          source: body.source ?? "rizo_service",
          submittedByCustomer: false,
          saleId: sale?.id ?? null,
          customerId: customer.id,
          productId: product.id,
          issueDescription: body.issueDescription,
        defectType: body.type === "repair" ? body.defectType ?? null : null,
        locationType: body.locationType,
        customerLocation,
        technicianTypeRequired: body.technicianTypeRequired,
        assignedTechnicianId,
        status,
        priority: body.priority ?? "medium",
        warrantyStatus,
        isPaidRepair: payment.isPaidRepair,
        paymentStatus: payment.paymentStatus,
        isRecurring,
        recurrenceIntervalMonths: interval,
        nextDueDate,
        receivedAt: now,
      },
        include: requestInclude,
      });
    });

    const serialized = serializeRequest(created);
    publishRequest("request:created", serialized);
    await notifyRequestCreated(created);

    const technicianName = created.assignedTechnician?.name;
    const assignmentNote =
      assignmentMode === "auto" && technicianName
        ? `Auto-assigned to ${technicianName}`
        : assignmentMode === "manual" && technicianName
          ? `Assigned to ${technicianName}`
          : "Saved unassigned — no matching technician was available";

    res.status(201).json({
      request: serialized,
      assignment: {
        mode: assignmentMode,
        technicianName: technicianName ?? null,
        note: assignmentNote,
      },
    });
  }),
);

requestsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(patchSchema, req.body);
    const existing = await prisma.serviceRequest.findUnique({
      where: { id: req.params.id },
      include: requestInclude,
    });
    if (!existing) {
      throw new HttpError(404, "Service request not found");
    }
    if (!isAllowedStatus(existing.type, body.status)) {
      throw new HttpError(400, `This status is not part of the ${existing.type} flow`, "statusNotInFlow", {
        type: existing.type,
      });
    }

    const now = new Date();
    const updated = await prisma.serviceRequest.update({
      where: { id: existing.id },
      data: statusPatch(existing, body.status, now),
      include: requestInclude,
    });
    const serialized = serializeRequest(updated);
    publishRequest("request:updated", serialized);
    if (existing.status !== updated.status) {
      await notifyRequestStatus(updated);
    }

    const spawned = await maybeSpawnAfterComplete(existing, body.status, updated, now);
    if (spawned) {
      publishRequest("request:created", serializeRequest(spawned));
      await notifyRequestCreated(spawned);
    }

    res.json({
      request: serialized,
      nextOccurrence: spawned ? serializeRequest(spawned) : null,
    });
  }),
);
