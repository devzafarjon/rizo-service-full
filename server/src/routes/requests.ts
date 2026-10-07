import { pushJobAssigned } from "../lib/push.js";
import { Router } from "express";
import type { LocationType, RequestStatus, ServiceType } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { publishRequest } from "../lib/realtime.js";
import { requestInclude, serializeRequest } from "../lib/serializeRequest.js";
import { coverageOf, serializeJobWork, workInclude } from "../lib/jobWork.js";
import { loadTimeline, serializePauses } from "../lib/timeline.js";
import { ALL_STATUSES, OPEN_STATUSES } from "../lib/status.js";
import { changeRequestStatus } from "../lib/statusChange.js";
import { normalizeDisplayIdQuery } from "../lib/displayId.js";
import { serializeNamed } from "../lib/named.js";
import { readWriteRoles, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { READ_MONEY, READ_OFFICE } from "../lib/roles.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { confirmPickup } from "../lib/pickup.js";
import { createServiceRequest } from "../lib/createRequest.js";
import { applyDecision } from "../lib/decision.js";
import { approveEstimate, createEstimate, declineEstimate, estimateInclude, fulfilPendingParts, sendEstimate, serializeEstimate } from "../lib/estimates.js";
import { paymentSummary, refreshPaymentStatus } from "../lib/payments.js";
import { createCustomerNotification } from "../lib/notifyCustomer.js";
import { getAppSettings } from "../lib/settings.js";
import { availableSlots, confirmVisit, scheduleVisit } from "../lib/visits.js";
import { money } from "../lib/warranty.js";

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

const dateTime = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? new Date(value) : null))
  .refine((value) => value == null || !Number.isNaN(value.getTime()), "Enter a valid date and time");

const createSchema = z
  .object({
    type: z.enum(["installation", "repair"]),
    customerId: z.string().min(1, "Customer is required"),
    saleId: optionalId,
    productId: z.string().min(1, "Product is required"),
    serialNumber: z.string().trim().max(80).optional().nullable(),
    issueDescription: z.string().trim().min(1, "Describe the issue"),
    defectType: z.enum(["dead_on_arrival", "failed_during_use"]).optional().nullable(),
    locationType: z.enum(["in_shop", "on_site"]),
    customerLocation: locationSchema.optional().nullable(),
    technicianTypeRequired: z.enum(["service_center", "mobile"]),
    assignedTechnicianId: optionalId,
    serviceCenterId: optionalId,
    autoAssign: z.boolean().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    source: z.enum(["rizo_market", "rizo_service"]).optional(),
    scheduledAt: dateTime,
    allowDuplicate: z.boolean().optional(),
    intake: z
      .object({
        checklist: z.array(z.string().trim().min(1)).max(20).optional(),
        notes: z.string().trim().max(1000).optional().nullable(),
        signatureDataUrl: z.string().optional().nullable(),
      })
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "installation" && data.locationType === "in_shop") {
      ctx.addIssue({ code: "custom", message: "Installation is only done at the customer's address", path: ["locationType"] });
    }
    if ((data.locationType === "on_site" || data.type === "installation") && !data.customerLocation?.address) {
      ctx.addIssue({ code: "custom", message: "Customer location is required for on-site jobs", path: ["customerLocation"] });
    }
  });

const patchSchema = z
  .object({
    status: z.enum(["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused", "ready", "completed", "picked_up", "replaced", "refunded", "rejected", "cancelled"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    assignedTechnicianId: z.string().trim().min(1).nullable().optional(),
    serviceCenterId: z.string().trim().min(1).nullable().optional(),
    serialNumber: z.string().trim().max(80).nullable().optional(),
    scheduledAt: dateTime,
    fiscalReceiptNumber: z.string().trim().max(60).nullable().optional(),
    defectCodeId: z.string().trim().min(1).nullable().optional(),
    reason: z.string().trim().max(500).optional(),
    allowUnpaid: z.boolean().optional(),
    pauseReason: z.string().trim().optional(),
    pauseHours: z.coerce.number().positive("Pause duration must be greater than 0").max(336, "Pause cannot exceed 14 days").optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "paused") {
      if (!data.pauseReason) ctx.addIssue({ code: "custom", message: "A pause reason is required", path: ["pauseReason"] });
      if (data.pauseHours == null) ctx.addIssue({ code: "custom", message: "Set how long this pause should last", path: ["pauseHours"] });
    }
  });

const decisionSchema = z.object({
  decision: z.enum(["warranty_repair", "paid_repair", "replace", "refund", "reject"]),
  note: z.string().trim().max(500).optional().nullable(),
  rejectionReason: z.string().trim().max(500).optional().nullable(),
  refundAmount: z.coerce.number().nonnegative().optional().nullable(),
  refundMethod: z.enum(["cash", "card", "transfer", "payme", "click", "other"]).optional(),
  returnReasonId: z.string().trim().min(1).optional().nullable(),
  override: z.boolean().optional(),
  replacement: z.object({ productId: z.string().min(1), serialNumber: z.string().trim().min(1).max(80) }).optional().nullable(),
});

const estimateSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  validDays: z.coerce.number().int().min(1).max(60).optional(),
  send: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        kind: z.enum(["service", "part", "labor", "other"]),
        serviceCatalogItemId: z.string().optional().nullable(),
        sparePartId: z.string().optional().nullable(),
        name: z.string().trim().max(120).optional(),
        quantity: z.coerce.number().int().min(1).max(99).optional(),
        unitPrice: z.coerce.number().nonnegative().optional(),
        isOptional: z.boolean().optional(),
      }),
    )
    .min(1, "Add at least one line to the estimate")
    .max(40),
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  method: z.enum(["cash", "card", "transfer", "payme", "click", "other"]).default("cash"),
  kind: z.enum(["payment", "refund"]).default("payment"),
  note: z.string().trim().max(200).optional().nullable(),
  fiscalReceiptNumber: z.string().trim().max(60).optional().nullable(),
});

export const requestsRouter = Router();
requestsRouter.use(staffAuth, readWriteRoles(READ_OFFICE, ["admin", "receptionist"]));

requestsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const text = (key: string) => (typeof req.query[key] === "string" ? (req.query[key] as string).trim() : "");
    const q = text("q");
    const type = text("type");
    const status = text("status");
    const customerId = text("customerId");
    const locationType = text("locationType");
    const technicianId = text("technicianId");
    const priority = text("priority");
    const warrantyStatus = text("warrantyStatus");
    const overdue = req.query.overdue === "1" || req.query.overdue === "true";
    const legal = req.query.legal === "1";
    const from = text("from");
    const to = text("to");

    const requests = await prisma.serviceRequest.findMany({
      where: {
        AND: [
          overdue ? { overdueAt: { not: null }, status: { in: OPEN_STATUSES } } : {},
          legal ? { legalDueAt: { lt: new Date() }, status: { in: OPEN_STATUSES } } : {},
          SERVICE_TYPES.includes(type as ServiceType) ? { type: type as ServiceType } : {},
          STATUSES.includes(status as RequestStatus) ? { status: status as RequestStatus } : {},
          LOCATIONS.includes(locationType as LocationType) ? { locationType: locationType as LocationType } : {},
          customerId ? { customerId } : {},
          technicianId === "unassigned" ? { assignedTechnicianId: null } : technicianId ? { assignedTechnicianId: technicianId } : {},
          priority === "low" || priority === "medium" || priority === "high" || priority === "urgent" ? { priority } : {},
          warrantyStatus === "in_warranty" || warrantyStatus === "expired" || warrantyStatus === "not_applicable" ? { warrantyStatus } : {},
          from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? { scheduledAt: { gte: new Date(`${from}T00:00:00+05:00`) } } : {},
          to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? { scheduledAt: { lte: new Date(`${to}T23:59:59+05:00`) } } : {},
          q
            ? {
                OR: [
                  { issueDescription: { contains: q, mode: "insensitive" } },
                  { customer: { name: { contains: q, mode: "insensitive" } } },
                  { customer: { phone: { contains: q.replace(/\D/g, "") || "~~", mode: "insensitive" } } },
                  { product: { name: { contains: q, mode: "insensitive" } } },
                  { sale: { invoiceNumber: { contains: q, mode: "insensitive" } } },
                  { serialNumber: { contains: q, mode: "insensitive" } },
                  { displayId: { contains: normalizeDisplayIdQuery(q), mode: "insensitive" } },
                  { id: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
      orderBy: overdue ? { overdueAt: "asc" } : from || to ? { scheduledAt: "asc" } : { createdAt: "desc" },
      include: requestInclude,
    });
    res.json({ requests: requests.map(serializeRequest) });
  }),
);

// Free booking windows for a date (for the request being moved, or for a location type).
requestsRouter.get(
  "/visit-slots",
  asyncHandler(async (req, res) => {
    const date = String(req.query.date ?? "");
    const requestId = typeof req.query.requestId === "string" ? req.query.requestId : "";
    const request = requestId ? await prisma.serviceRequest.findUnique({ where: { id: requestId } }) : null;
    if (requestId && !request) throw new HttpError(404, "Service request not found");
    const technicianType = request ? request.technicianTypeRequired : req.query.locationType === "in_shop" ? "service_center" : "mobile";
    const slots = await availableSlots({
      date,
      technicianType,
      serviceCenterId: request?.serviceCenterId ?? (typeof req.query.serviceCenterId === "string" && req.query.serviceCenterId ? req.query.serviceCenterId : null),
      ignoreRequestId: request?.id,
      technicianId: request?.assignedTechnicianId ?? null,
    });
    res.json({ date, slots: slots.map(({ slot, left, free }) => ({ slot, left, free })) });
  }),
);

requestsRouter.get(
  "/lookup/:displayId",
  asyncHandler(async (req, res) => {
    const displayId = normalizeDisplayIdQuery(req.params.displayId);
    const request = await prisma.serviceRequest.findUnique({ where: { displayId }, include: requestInclude });
    if (!request) throw new HttpError(404, "Service request not found");
    res.json({ request: serializeRequest(request) });
  }),
);

requestsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const request = await prisma.serviceRequest.findUnique({
      where: { id: req.params.id },
      include: { ...requestInclude, ...workInclude, pauses: { orderBy: { pausedAt: "asc" } } },
    });
    if (!request) throw new HttpError(404, "Service request not found");
    const [services, parts, estimates, payments, notes, defectCodes, returnReasons, summary, settings, repeatOf] = await Promise.all([
      prisma.serviceCatalogItem.findMany({ where: { productCategories: { has: request.product.category } }, orderBy: { name: "asc" } }),
      prisma.sparePart.findMany({ where: { productCategories: { has: request.product.category } }, orderBy: { name: "asc" } }),
      prisma.estimate.findMany({ where: { serviceRequestId: request.id }, orderBy: { createdAt: "desc" }, include: estimateInclude }),
      prisma.payment.findMany({ where: { serviceRequestId: request.id }, orderBy: { createdAt: "asc" } }),
      prisma.requestNote.findMany({ where: { serviceRequestId: request.id }, orderBy: { createdAt: "asc" }, include: { staffUser: { select: { name: true } }, customer: { select: { name: true } } } }),
      prisma.defectCode.findMany({ where: { kind: "defect", isActive: true, OR: [{ productCategory: null }, { productCategory: request.product.category }] }, orderBy: { code: "asc" } }),
      prisma.defectCode.findMany({ where: { kind: "return_reason", isActive: true }, orderBy: { code: "asc" } }),
      paymentSummary(request.id),
      getAppSettings(),
      request.repeatOfId ? prisma.serviceRequest.findUnique({ where: { id: request.repeatOfId }, select: { id: true, displayId: true } }) : null,
    ]);
    res.json({
      request: serializeRequest(request),
      pauses: serializePauses(request.pauses),
      timeline: await loadTimeline(request),
      ...serializeJobWork(request, {
        requireService: services.length > 0,
        type: request.type,
        sale: request.sale,
        coverage: coverageOf(request.product),
        decision: request.decision,
      }),
      matchingServices: services.map((item) => ({ id: item.id, ...serializeNamed(item), price: Number(item.price), productCategories: item.productCategories })),
      matchingParts: parts.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategories: item.productCategories,
        stockQuantity: item.stockQuantity,
      })),
      estimates: await Promise.all(estimates.map(serializeEstimate)),
      payments: payments.map((row) => ({
        id: row.id,
        kind: row.kind,
        method: row.method,
        amount: money(row.amount),
        note: row.note,
        fiscalReceiptNumber: row.fiscalReceiptNumber,
        createdByName: row.createdByName,
        createdAt: row.createdAt.toISOString(),
      })),
      paymentSummary: summary,
      notes: notes.map((row) => ({
        id: row.id,
        text: row.noteText,
        authorScope: row.authorScope,
        authorName: row.authorScope === "customer" ? (row.customer?.name ?? null) : (row.staffUser?.name ?? null),
        isVisibleToCustomer: row.isVisibleToCustomer,
        createdAt: row.createdAt.toISOString(),
      })),
      defectCodes: defectCodes.map((row) => ({ id: row.id, code: row.code, ...serializeNamed(row) })),
      returnReasons: returnReasons.map((row) => ({ id: row.id, code: row.code, ...serializeNamed(row) })),
      repeatOf,
      settings,
    });
  }),
);

requestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(createSchema, req.body);
    const result = await createServiceRequest({
      ...body,
      assignedTechnicianId: body.assignedTechnicianId ?? null,
      serviceCenterId: body.serviceCenterId ?? null,
      saleId: body.saleId ?? null,
      customerLocation: body.customerLocation ?? null,
      submittedByCustomer: false,
    });
    res.status(201).json({ request: serializeRequest(result.request), assignment: result.assignment, repeat: result.repeat });
  }),
);

requestsRouter.post(
  "/:id/visit",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ date: z.string().trim(), slot: z.string().trim() }), req.body);
    await scheduleVisit({ requestId: req.params.id, date: body.date, slot: body.slot, actor: staffActor(req.staff), byCustomer: false });
    res.json({ request: serializeRequest(await prisma.serviceRequest.findUniqueOrThrow({ where: { id: req.params.id }, include: requestInclude })) });
  }),
);

requestsRouter.post(
  "/:id/visit/confirm",
  asyncHandler(async (req, res) => {
    await confirmVisit(req.params.id, staffActor(req.staff));
    res.json({ request: serializeRequest(await prisma.serviceRequest.findUniqueOrThrow({ where: { id: req.params.id }, include: requestInclude })) });
  }),
);

// Several requests at once: assign a technician, set the priority or cancel. Each one is checked on its own.
requestsRouter.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        ids: z.array(z.string().min(1)).min(1).max(100),
        action: z.enum(["assign", "priority", "cancel"]),
        technicianId: z.string().min(1).nullable().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        reason: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const actor = staffActor(req.staff);
    const ok: string[] = [];
    const failed: Array<{ id: string; code: string }> = [];
    let technician: { id: string; technicianType: string | null; isActive: boolean; role: string } | null = null;
    if (body.action === "assign" && body.technicianId) {
      technician = await prisma.staffUser.findUnique({ where: { id: body.technicianId }, select: { id: true, technicianType: true, isActive: true, role: true } });
      if (!technician || technician.role !== "technician" || !technician.isActive) throw new HttpError(400, "Technician not found");
    }
    if (body.action === "priority" && !body.priority) throw new HttpError(400, "Choose a priority", "invalidInput");
    for (const id of [...new Set(body.ids)]) {
      try {
        const existing = await prisma.serviceRequest.findUnique({ where: { id } });
        if (!existing) throw new HttpError(404, "Service request not found", "requestNotFound");
        if (body.action === "assign") {
          if (technician && technician.technicianType !== existing.technicianTypeRequired) throw new HttpError(400, "This technician does not match the required type", "techTypeMismatch");
          await prisma.serviceRequest.update({ where: { id }, data: { assignedTechnicianId: technician?.id ?? null, assignedAt: technician ? new Date() : null } });
          pushJobAssigned(technician?.id, existing);
          await writeAudit({ actor, action: "request.assign", entityType: "ServiceRequest", entityId: id, oldValue: { assignedTechnicianId: existing.assignedTechnicianId }, newValue: { assignedTechnicianId: technician?.id ?? null, bulk: true } });
        } else if (body.action === "priority") {
          await prisma.serviceRequest.update({ where: { id }, data: { priority: body.priority } });
          await writeAudit({ actor, action: "request.update", entityType: "ServiceRequest", entityId: id, oldValue: { priority: existing.priority }, newValue: { priority: body.priority, bulk: true } });
        } else {
          await changeRequestStatus({ requestId: id, next: "cancelled", actor: { audit: actor, role: req.staff!.role }, reason: body.reason || "Cancelled by the office" });
        }
        publishRequest("request:updated", { id, customerId: existing.customerId });
        ok.push(id);
      } catch (error) {
        failed.push({ id, code: error instanceof HttpError ? error.code : "generic" });
      }
    }
    res.json({ ok, failed });
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
      requireSettled: req.body?.allowUnpaid !== true,
    });
    res.json({ request });
  }),
);

requestsRouter.post(
  "/:id/decision",
  asyncHandler(async (req, res) => {
    const body = parseBody(decisionSchema, req.body);
    const updated = await applyDecision({ ...body, requestId: req.params.id, actor: staffActor(req.staff), role: req.staff!.role });
    res.json({ request: serializeRequest(await prisma.serviceRequest.findUniqueOrThrow({ where: { id: updated.id }, include: requestInclude })) });
  }),
);

requestsRouter.post(
  "/:id/estimates",
  asyncHandler(async (req, res) => {
    const body = parseBody(estimateSchema, req.body);
    const created = await createEstimate({ requestId: req.params.id, lines: body.lines, note: body.note, validDays: body.validDays, actor: staffActor(req.staff) });
    const sent = body.send ? await sendEstimate(created.id, staffActor(req.staff)) : created;
    if (body.send) {
      // Waiting for the customer's answer.
      const current = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: req.params.id } });
      if (["diagnosing", "new"].includes(current.status)) {
        await changeRequestStatus({ requestId: current.id, next: "awaiting_decision", actor: { audit: staffActor(req.staff), role: "system" } });
      }
    }
    res.status(201).json({ estimate: await serializeEstimate(sent) });
  }),
);

requestsRouter.post(
  "/:id/estimates/:estimateId/send",
  asyncHandler(async (req, res) => {
    const sent = await sendEstimate(req.params.estimateId, staffActor(req.staff));
    const current = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: req.params.id } });
    if (["diagnosing", "new"].includes(current.status)) {
      await changeRequestStatus({ requestId: current.id, next: "awaiting_decision", actor: { audit: staffActor(req.staff), role: "system" } });
    }
    res.json({ estimate: await serializeEstimate(sent) });
  }),
);

requestsRouter.post(
  "/:id/estimates/:estimateId/approve",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ note: z.string().trim().max(300).optional(), selectedOptionalLineIds: z.array(z.string()).optional() }), req.body ?? {});
    // The office records an approval the customer gave in person or by phone.
    const staff = req.staff!;
    const approvedEstimate = await prisma.estimate.findUnique({ where: { id: req.params.estimateId } });
    if (approvedEstimate?.status === "draft") await sendEstimate(approvedEstimate.id, staffActor(req.staff));
    const result = await approveEstimate({
      estimateId: req.params.estimateId,
      by: { kind: "staff", id: staff.sub, name: staff.name },
      selectedOptionalLineIds: body.selectedOptionalLineIds ?? (await optionalIds(req.params.estimateId)),
      note: body.note ?? "Approved by the customer in person or by phone",
    });
    await advanceAfterApproval(req.params.id, result.waitingForParts, staffActor(req.staff));
    res.json({ estimate: await serializeEstimate(result.estimate), waitingForParts: result.waitingForParts });
  }),
);

requestsRouter.post(
  "/:id/estimates/:estimateId/decline",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ reason: z.string().trim().max(300).default("") }), req.body ?? {});
    const staff = req.staff!;
    const estimate = await declineEstimate({ estimateId: req.params.estimateId, reason: body.reason, by: { kind: "staff", id: staff.sub, name: staff.name } });
    res.json({ estimate: await serializeEstimate(estimate) });
  }),
);

requestsRouter.post(
  "/:id/payments",
  asyncHandler(async (req, res) => {
    const body = parseBody(paymentSchema, req.body);
    const request = await prisma.serviceRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw new HttpError(404, "Service request not found");
    if (request.status === "cancelled") throw new HttpError(400, "This request is cancelled", "requestClosed");
    const staff = req.staff!;
    const before = await paymentSummary(request.id);
    if (body.kind === "refund" && body.amount > before.net) {
      throw new HttpError(400, "A refund cannot be larger than what was paid", "refundTooLarge");
    }
    if (body.kind === "payment" && !body.fiscalReceiptNumber && (await getAppSettings()).requireFiscalReceipt) {
      throw new HttpError(400, "Enter the fiscal receipt number for this payment", "fiscalReceiptRequired");
    }
    await prisma.payment.create({
      data: {
        serviceRequestId: request.id,
        kind: body.kind,
        method: body.method,
        amount: body.amount,
        note: body.note || null,
        fiscalReceiptNumber: body.fiscalReceiptNumber || null,
        createdById: staff.sub,
        createdByName: staff.name,
      },
    });
    if (body.fiscalReceiptNumber) {
      await prisma.serviceRequest.update({ where: { id: request.id }, data: { fiscalReceiptNumber: body.fiscalReceiptNumber } });
    }
    const after = await refreshPaymentStatus(request.id);
    await writeAudit({
      actor: staffActor(req.staff),
      action: body.kind === "refund" ? "payment.refund" : "payment.add",
      entityType: "ServiceRequest",
      entityId: request.id,
      newValue: { amount: body.amount, method: body.method, balance: after.balance },
    });
    const fresh = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: request.id }, include: requestInclude });
    publishRequest("request:updated", serializeRequest(fresh));
    res.status(201).json({ paymentSummary: after, request: serializeRequest(fresh) });
  }),
);

requestsRouter.post(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ text: z.string().trim().min(1, "Write a note").max(1000), visibleToCustomer: z.boolean().optional() }), req.body);
    const request = await prisma.serviceRequest.findUnique({ where: { id: req.params.id }, include: { product: true } });
    if (!request) throw new HttpError(404, "Service request not found");
    const staff = req.staff!;
    const note = await prisma.requestNote.create({
      data: {
        serviceRequestId: request.id,
        userId: staff.sub,
        authorScope: "staff",
        staffUserId: staff.sub,
        noteText: body.text,
        isVisibleToCustomer: Boolean(body.visibleToCustomer),
      },
    });
    if (body.visibleToCustomer) {
      await createCustomerNotification(request.customerId, request.id, body.text, "message", { displayId: request.displayId, text: body.text });
    }
    publishRequest("request:updated", { id: request.id, customerId: request.customerId });
    res.status(201).json({ note: { id: note.id } });
  }),
);

requestsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(patchSchema, req.body);
    const existing = await prisma.serviceRequest.findUnique({ where: { id: req.params.id }, include: requestInclude });
    if (!existing) throw new HttpError(404, "Service request not found");
    const actor = staffActor(req.staff);

    if (body.assignedTechnicianId !== undefined && body.assignedTechnicianId !== existing.assignedTechnicianId) {
      let nextTechnicianId: string | null = null;
      if (body.assignedTechnicianId) {
        const technician = await prisma.staffUser.findUnique({ where: { id: body.assignedTechnicianId } });
        if (!technician || technician.role !== "technician" || !technician.isActive) throw new HttpError(400, "Technician not found");
        if (technician.technicianType !== existing.technicianTypeRequired) throw new HttpError(400, "This technician does not match the required type");
        nextTechnicianId = technician.id;
      }
      await prisma.serviceRequest.update({
        where: { id: existing.id },
        data: { assignedTechnicianId: nextTechnicianId, assignedAt: nextTechnicianId ? new Date() : null },
      });
      pushJobAssigned(nextTechnicianId, existing);
      await writeAudit({ actor, action: "request.assign", entityType: "ServiceRequest", entityId: existing.id, oldValue: { assignedTechnicianId: existing.assignedTechnicianId }, newValue: { assignedTechnicianId: nextTechnicianId } });
    }

    const simple: Record<string, unknown> = {};
    if (body.priority && body.priority !== existing.priority) simple.priority = body.priority;
    if (body.serialNumber !== undefined) simple.serialNumber = body.serialNumber || null;
    if (body.scheduledAt !== undefined && body.scheduledAt?.getTime() !== existing.scheduledAt?.getTime()) simple.scheduledAt = body.scheduledAt;
    if (body.fiscalReceiptNumber !== undefined) simple.fiscalReceiptNumber = body.fiscalReceiptNumber || null;
    if (body.defectCodeId !== undefined) simple.defectCodeId = body.defectCodeId;
    if (body.serviceCenterId !== undefined) simple.serviceCenterId = body.serviceCenterId;
    if (Object.keys(simple).length > 0) {
      await prisma.serviceRequest.update({ where: { id: existing.id }, data: simple });
      await writeAudit({ actor, action: "request.update", entityType: "ServiceRequest", entityId: existing.id, oldValue: { priority: existing.priority, serialNumber: existing.serialNumber }, newValue: simple as Record<string, never> });
    }

    if (body.status && body.status !== existing.status) {
      if (body.status === "picked_up") {
        await confirmPickup({ requestId: existing.id, actor, requireSettled: body.allowUnpaid !== true });
      } else {
        await changeRequestStatus({
          requestId: existing.id,
          next: body.status,
          actor: { audit: actor, role: req.staff!.role },
          pause: { reason: body.pauseReason, hours: body.pauseHours },
          reason: body.reason,
        });
        if (existing.status === "awaiting_parts" && body.status === "in_progress") await fulfilPendingParts(existing.id);
      }
    }

    const fresh = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: existing.id }, include: requestInclude });
    const serialized = serializeRequest(fresh);
    publishRequest("request:updated", serialized);
    res.json({ request: serialized });
  }),
);

async function optionalIds(estimateId: string) {
  const lines = await prisma.estimateLine.findMany({ where: { estimateId, isOptional: true } });
  return lines.map((line) => line.id);
}

/** After an estimate is approved the work can start, or waits for parts that have been ordered. */
export async function advanceAfterApproval(requestId: string, waitingForParts: boolean, actor: ReturnType<typeof staffActor>) {
  const current = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (!["new", "diagnosing", "awaiting_decision"].includes(current.status)) return;
  await changeRequestStatus({ requestId, next: waitingForParts ? "awaiting_parts" : "in_progress", actor: { audit: actor, role: "system" } });
}
