import { Router } from "express";
import type { LocationType, RequestStatus, ServiceType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { initialStatusFor, paymentFor, pickAvailableTechnician } from "../lib/assignment.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { notifyRequestCreated } from "../lib/notifyCustomer.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { publishRequest } from "../lib/realtime.js";
import { requestInclude, serializeRequest } from "../lib/serializeRequest.js";
import { serializeJobWork, workInclude } from "../lib/jobWork.js";
import { buildTimeline, serializePauses } from "../lib/timeline.js";
import { ALL_STATUSES, OPEN_STATUSES } from "../lib/status.js";
import { changeRequestStatus } from "../lib/statusChange.js";
import { computeWarrantyStatus } from "../lib/warranty.js";
import { allocateDisplayId, normalizeDisplayIdQuery } from "../lib/displayId.js";
import { serializeNamed } from "../lib/named.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { confirmPickup } from "../lib/pickup.js";

const patchSchema = z
  .object({
    status: z.enum(["new", "in_progress", "paused", "completed", "picked_up", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    assignedTechnicianId: z.string().trim().min(1).nullable().optional(),
    pauseReason: z.string().trim().optional(),
    pauseHours: z.coerce.number().positive("Pause duration must be greater than 0").max(336, "Pause cannot exceed 14 days").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "paused") {
      if (!data.pauseReason) ctx.addIssue({ code: "custom", message: "A pause reason is required", path: ["pauseReason"] });
      if (data.pauseHours == null) ctx.addIssue({ code: "custom", message: "Set how long this pause should last", path: ["pauseHours"] });
    }
  });

const SERVICE_TYPES: ServiceType[] = ["installation", "repair"];
const STATUSES: RequestStatus[] = ALL_STATUSES;
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
    type: z.enum(["installation", "repair"]),
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
    const overdue = req.query.overdue === "1" || req.query.overdue === "true";

    const requests = await prisma.serviceRequest.findMany({
      where: {
        AND: [
          overdue ? { overdueAt: { not: null }, status: { in: OPEN_STATUSES } } : {},
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
      orderBy: overdue ? { overdueAt: "asc" } : { createdAt: "desc" },
      include: requestInclude,
    });
    res.json({ requests: requests.map(serializeRequest) });
  }),
);

requestsRouter.get(
  "/lookup/:displayId",
  asyncHandler(async (req, res) => {
    const displayId = normalizeDisplayIdQuery(req.params.displayId);
    const request = await prisma.serviceRequest.findUnique({
      where: { displayId },
      include: requestInclude,
    });
    if (!request) {
      throw new HttpError(404, "Service request not found");
    }
    res.json({ request: serializeRequest(request) });
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
        where: { productCategories: { has: request.product.category } },
        orderBy: { name: "asc" },
      }),
      prisma.sparePart.findMany({
        where: { productCategories: { has: request.product.category } },
        orderBy: { name: "asc" },
      }),
    ]);
    res.json({
      request: serializeRequest(request),
      pauses: serializePauses(request.pauses),
      timeline: buildTimeline(request),
      ...serializeJobWork(request, {
        requireService: services.length > 0,
        type: request.type,
        sale: request.sale,
      }),
      matchingServices: services.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategories: item.productCategories,
      })),
      matchingParts: parts.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategories: item.productCategories,
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
    const status = initialStatusFor();
    const now = new Date();

    let assignedTechnicianId: string | null = null;
    let assignmentMode: "manual" | "auto" | "unassigned" = "unassigned";
    if (body.assignedTechnicianId) {
      const technician = await prisma.staffUser.findUnique({ where: { id: body.assignedTechnicianId } });
      if (!technician || technician.role !== "technician") {
        throw new HttpError(400, "Technician not found");
      }
      if (!technician.isActive) {
        throw new HttpError(400, "This technician is not active");
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
        assignedAt: assignedTechnicianId ? now : null,
        status,
        priority: body.priority ?? "medium",
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

requestsRouter.post(
  "/:id/pickup",
  asyncHandler(async (req, res) => {
    const signature = typeof req.body?.signature === "string" ? req.body.signature : null;
    const request = await confirmPickup({
      requestId: req.params.id,
      actor: staffActor(req.staff),
      signatureDataUrl: signature,
    });
    res.json({ request });
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
    const actor = staffActor(req.staff);

    if (body.assignedTechnicianId !== undefined && body.assignedTechnicianId !== existing.assignedTechnicianId) {
      let nextTechnicianId: string | null = null;
      if (body.assignedTechnicianId) {
        const technician = await prisma.staffUser.findUnique({ where: { id: body.assignedTechnicianId } });
        if (!technician || technician.role !== "technician" || !technician.isActive) {
          throw new HttpError(400, "Technician not found");
        }
        if (technician.technicianType !== existing.technicianTypeRequired) {
          throw new HttpError(400, "This technician does not match the required type");
        }
        nextTechnicianId = technician.id;
      }
      await prisma.serviceRequest.update({
        where: { id: existing.id },
        data: { assignedTechnicianId: nextTechnicianId, assignedAt: nextTechnicianId ? new Date() : null },
      });
      await writeAudit({
        actor,
        action: "request.assign",
        entityType: "ServiceRequest",
        entityId: existing.id,
        oldValue: { assignedTechnicianId: existing.assignedTechnicianId },
        newValue: { assignedTechnicianId: nextTechnicianId },
      });
    }

    if (body.priority && body.priority !== existing.priority) {
      await prisma.serviceRequest.update({ where: { id: existing.id }, data: { priority: body.priority } });
      await writeAudit({
        actor,
        action: "request.priority",
        entityType: "ServiceRequest",
        entityId: existing.id,
        oldValue: { priority: existing.priority },
        newValue: { priority: body.priority },
      });
    }

    if (body.status && body.status !== existing.status) {
      if (body.status === "picked_up") {
        await confirmPickup({ requestId: existing.id, actor });
      } else {
        await changeRequestStatus({
          requestId: existing.id,
          next: body.status,
          actor: { audit: actor, role: "admin" },
          pause: { reason: body.pauseReason, hours: body.pauseHours },
        });
      }
    }

    const fresh = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: existing.id }, include: requestInclude });
    const serialized = serializeRequest(fresh);
    publishRequest("request:updated", serialized);
    res.json({ request: serialized });
  }),
);
