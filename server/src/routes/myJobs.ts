import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { coverageOf, serializeJobWork, workInclude } from "../lib/jobWork.js";
import { serializeNamed } from "../lib/named.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { publishRequest } from "../lib/realtime.js";
import { loadTimeline, serializePauses } from "../lib/timeline.js";
import { requestInclude, serializeRequest, type RequestRecord } from "../lib/serializeRequest.js";
import { techColumn } from "../lib/techBoard.js";
import { changeRequestStatus } from "../lib/statusChange.js";
import { finishedStatusFor } from "../lib/status.js";
import { createEstimate, estimateInclude, fulfilPendingParts, sendEstimate, serializeEstimate } from "../lib/estimates.js";
import { createPartOrder } from "../lib/partOrders.js";
import { createCustomerNotification } from "../lib/notifyCustomer.js";
import { staffActor } from "../lib/audit.js";
import { acceptJobPhotos, publicPhotoUrl, removeUploadedFile } from "../lib/uploads.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { getAppSettings, isBlockZeroStock } from "../lib/settings.js";
import { maybeAlertLowStock } from "../lib/stockAlerts.js";
import { checkedIds, checklistView } from "../lib/checklists.js";
import { consumeForJob, releaseFromJob, technicianStockList } from "../lib/techStock.js";
import { normalizeDisplayIdQuery, tashkentCalendarDate } from "../lib/displayId.js";
import { parseDateOnly, toDateOnly } from "../lib/warranty.js";
import { earningsFor } from "./payroll.js";
import { parseReportRange, serializeWindow } from "../lib/reportRange.js";

const jobInclude = Prisma.validator<Prisma.ServiceRequestInclude>()({
  ...requestInclude,
  pauses: { orderBy: { pausedAt: "desc" } },
});

const jobDetailInclude = Prisma.validator<Prisma.ServiceRequestInclude>()({
  ...requestInclude,
  pauses: { orderBy: { pausedAt: "desc" } },
  ...workInclude,
});

const moveSchema = z
  .object({
    column: z.enum(["new", "in_progress", "paused", "completed"]).optional(),
    status: z.enum(["diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused"]).optional(),
    pauseReason: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    pauseHours: z
      .union([z.number(), z.string(), z.null()])
      .optional()
      .transform((value) => {
        if (value === "" || value == null) return undefined;
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }),
  })
  .superRefine((data, ctx) => {
    if (!data.column && !data.status) {
      ctx.addIssue({ code: "custom", message: "Choose where to move the job", path: ["status"] });
    }
    if (data.column === "paused" || data.status === "paused") {
      if (!data.pauseReason) {
        ctx.addIssue({ code: "custom", message: "A pause reason is required", path: ["pauseReason"] });
      }
      if (data.pauseHours == null) {
        ctx.addIssue({ code: "custom", message: "Set how long this pause should last", path: ["pauseHours"] });
      } else if (data.pauseHours <= 0) {
        ctx.addIssue({ code: "custom", message: "Pause duration must be greater than 0", path: ["pauseHours"] });
      } else if (data.pauseHours > 336) {
        ctx.addIssue({ code: "custom", message: "Pause cannot exceed 14 days", path: ["pauseHours"] });
      }
    }
  });

const resolutionSchema = z
  .object({
    resolutionType: z.enum(["repair", "replace"]),
    productId: z.string().trim().min(1).optional(),
    serialNumber: z.string().trim().min(1).max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.resolutionType === "replace") {
      if (!data.productId) ctx.addIssue({ code: "custom", message: "Select the replacement product", path: ["productId"] });
      if (!data.serialNumber) ctx.addIssue({ code: "custom", message: "Enter the new serial number", path: ["serialNumber"] });
    }
  });

const serviceLineSchema = z.object({
  serviceCatalogItemId: z.string().min(1, "Select a service"),
});

const partLineSchema = z.object({
  sparePartId: z.string().min(1, "Select a spare part"),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1").max(99, "Quantity is too high").optional(),
});

const extraSchema = z.object({
  description: z.string().trim().min(1, "Describe the extra expense"),
  price: z.coerce.number().nonnegative("Price cannot be negative"),
});

export const myJobsRouter = Router();
myJobsRouter.use(staffAuth, requireStaffRole("technician"));

myJobsRouter.get(
  "/earnings",
  asyncHandler(async (req, res) => {
    const window = parseReportRange({ preset: typeof req.query.preset === "string" ? req.query.preset : "month", from: req.query.from, to: req.query.to });
    res.json({ range: serializeWindow(window), ...(await earningsFor(req.staff!.sub, window)) });
  }),
);

myJobsRouter.get(
  "/schedule",
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === "string" ? parseDateOnly(req.query.from) : parseDateOnly(tashkentCalendarDate(new Date()));
    const to = typeof req.query.to === "string" ? parseDateOnly(req.query.to) : new Date(from.getTime() + 13 * 86400000);
    const rows = await prisma.technicianSchedule.findMany({
      where: { technicianId: req.staff!.sub, date: { gte: from, lte: to } },
    });
    res.json({
      from: toDateOnly(from),
      to: toDateOnly(to),
      days: rows.map((row) => ({
        id: row.id,
        technicianId: row.technicianId,
        date: toDateOnly(row.date),
        isWorking: row.isWorking,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
    });
  }),
);

myJobsRouter.put(
  "/schedule",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        date: z.string(),
        isWorking: z.boolean(),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
      }),
      req.body,
    );
    const date = parseDateOnly(body.date);
    const row = await prisma.technicianSchedule.upsert({
      where: { technicianId_date: { technicianId: req.staff!.sub, date } },
      update: { isWorking: body.isWorking, startTime: body.startTime ?? null, endTime: body.endTime ?? null },
      create: {
        technicianId: req.staff!.sub,
        date,
        isWorking: body.isWorking,
        startTime: body.startTime ?? null,
        endTime: body.endTime ?? null,
      },
    });
    res.json({
      day: {
        id: row.id,
        technicianId: row.technicianId,
        date: toDateOnly(row.date),
        isWorking: row.isWorking,
        startTime: row.startTime,
        endTime: row.endTime,
      },
    });
  }),
);

myJobsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const jobs = await prisma.serviceRequest.findMany({
      where: { assignedTechnicianId: req.staff!.sub, status: { not: "cancelled" } },
      orderBy: { createdAt: "desc" },
      include: jobInclude,
    });
    res.json({ jobs: jobs.map(serializeTechJob) });
  }),
);

// The parts this technician carries.
myJobsRouter.get(
  "/stock",
  asyncHandler(async (req, res) => {
    res.json({ stock: await technicianStockList(req.staff!.sub) });
  }),
);

myJobsRouter.put(
  "/:id/checklist",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ kind: z.enum(["diagnosis", "completion"]), checked: z.array(z.string().max(40)).max(60) }), req.body);
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const stored = (job.completionChecklist && typeof job.completionChecklist === "object" && !Array.isArray(job.completionChecklist) ? job.completionChecklist : {}) as Record<string, unknown>;
    const view = await checklistView(job);
    const valid = new Set((body.kind === "diagnosis" ? view.diagnosis.items : view.completion.items).map((item) => item.id));
    const next = { diagnosis: checkedIds(stored, "diagnosis"), completion: checkedIds(stored, "completion"), [body.kind]: [...new Set(body.checked)].filter((id) => valid.has(id)) };
    await prisma.serviceRequest.update({ where: { id: job.id }, data: { completionChecklist: next } });
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.get(
  "/lookup/:displayId",
  asyncHandler(async (req, res) => {
    const displayId = normalizeDisplayIdQuery(req.params.displayId);
    const job = await prisma.serviceRequest.findFirst({
      where: { displayId, assignedTechnicianId: req.staff!.sub },
      include: jobDetailInclude,
    });
    if (!job) {
      throw new HttpError(404, "Job not found");
    }
    res.json(await jobWorkPayload(job));
  }),
);

myJobsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const job = await loadOwnedJob(req.staff!.sub, req.params.id);
    res.json(await jobWorkPayload(job));
  }),
);

myJobsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(moveSchema, req.body);
    if (body.column === "new") {
      throw new HttpError(400, "Jobs cannot be moved back to New");
    }
    const existing = await loadOwnedJob(req.staff!.sub, req.params.id);
    const current = techColumn(existing.status);
    if (current === "completed") {
      throw new HttpError(400, "Completed jobs cannot be moved on this board");
    }
    if (body.column === "completed") {
      res.json(await finishJob(existing.id, req));
      return;
    }
    // Board columns map onto the detailed repair statuses.
    let next = body.status;
    if (!next) {
      if (body.column === "paused") next = "paused";
      else next = existing.status === "new" && existing.type === "repair" ? "diagnosing" : "in_progress";
    }
    if (next === existing.status) {
      res.json({ job: serializeTechJob(existing) });
      return;
    }
    await changeRequestStatus({
      requestId: existing.id,
      next,
      actor: { audit: staffActor(req.staff), role: "technician" },
      pause: { reason: body.pauseReason, hours: body.pauseHours as number | undefined },
    });
    if (existing.status === "awaiting_parts" && next === "in_progress") await fulfilPendingParts(existing.id);
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, existing.id)));
  }),
);

myJobsRouter.post(
  "/:id/en-route",
  asyncHandler(async (req, res) => {
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    if (job.locationType !== "on_site") throw new HttpError(400, "Only on-site jobs have a trip", "arrivalOnSiteOnly");
    // The technician may add how many minutes the trip takes; the customer then sees an arrival estimate.
    const body = parseBody(z.object({ etaMinutes: z.coerce.number().int().min(1).max(480).optional() }), req.body ?? {});
    if (!job.enRouteAt || (body.etaMinutes != null && body.etaMinutes !== job.etaMinutes)) {
      const firstTime = !job.enRouteAt;
      await prisma.serviceRequest.update({
        where: { id: job.id },
        data: { enRouteAt: job.enRouteAt ?? new Date(), ...(body.etaMinutes != null ? { etaMinutes: body.etaMinutes, etaSetAt: new Date() } : {}) },
      });
      await createCustomerNotification(
        job.customerId,
        job.id,
        body.etaMinutes != null ? `Your technician is on the way, about ${body.etaMinutes} min` : "Your technician is on the way",
        firstTime || body.etaMinutes == null ? "enRoute" : "etaUpdate",
        {
          displayId: job.displayId,
          technician: job.assignedTechnician?.name.trim().split(/\s+/)[0] ?? "",
          ...(body.etaMinutes != null ? { minutes: body.etaMinutes } : {}),
        },
      );
      publishRequest("request:updated", serializeRequest((await loadOwnedJob(req.staff!.sub, job.id)) as RequestRecord));
    }
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.put(
  "/:id/diagnosis",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ defectCodeId: z.string().min(1).nullable() }), req.body);
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    if (body.defectCodeId) {
      const code = await prisma.defectCode.findFirst({ where: { id: body.defectCodeId, kind: "defect" } });
      if (!code) throw new HttpError(400, "Defect code not found");
    }
    await prisma.serviceRequest.update({ where: { id: job.id }, data: { defectCodeId: body.defectCodeId } });
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.post(
  "/:id/estimates",
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        note: z.string().trim().max(500).optional().nullable(),
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
      }),
      req.body,
    );
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    if (job.type !== "repair") throw new HttpError(400, "Only repairs have an estimate", "decisionRepairOnly");
    const actor = staffActor(req.staff);
    const created = await createEstimate({ requestId: job.id, lines: body.lines, note: body.note, actor });
    if (body.send) {
      await sendEstimate(created.id, actor);
      if (["new", "diagnosing"].includes(job.status)) {
        await changeRequestStatus({ requestId: job.id, next: "awaiting_decision", actor: { audit: actor, role: "system" } });
      }
    }
    res.status(201).json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.post(
  "/:id/part-orders",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ sparePartId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(99), note: z.string().trim().max(200).optional().nullable() }), req.body);
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    await createPartOrder({ sparePartId: body.sparePartId, quantity: body.quantity, serviceRequestId: job.id, note: body.note, createdById: req.staff!.sub });
    // Waiting for the part: the job moves to Awaiting parts so the timer and the board show it.
    if (["new", "diagnosing", "in_progress"].includes(job.status) && job.type === "repair") {
      await changeRequestStatus({ requestId: job.id, next: "awaiting_parts", actor: { audit: staffActor(req.staff), role: "technician" } });
    }
    res.status(201).json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.post(
  "/:id/arrived",
  asyncHandler(async (req, res) => {
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    if (job.locationType !== "on_site") {
      throw new HttpError(400, "Arrival is only recorded for on-site jobs");
    }
    if (!job.arrivedAt) {
      if (job.status === "new") {
        await changeRequestStatus({
          requestId: job.id,
          next: "in_progress",
          actor: { audit: staffActor(req.staff), role: "technician" },
        });
      }
      await prisma.serviceRequest.update({ where: { id: job.id }, data: { arrivedAt: new Date() } });
      const fresh = await loadOwnedJob(req.staff!.sub, job.id);
      publishRequest("request:updated", serializeRequest(fresh as RequestRecord));
    }
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    res.json(await finishJob(req.params.id, req));
  }),
);

myJobsRouter.put(
  "/:id/resolution",
  asyncHandler(async (req, res) => {
    const body = parseBody(resolutionSchema, req.body);
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    if (job.type !== "repair") {
      throw new HttpError(400, "Only repairs have a resolution");
    }
    if (body.resolutionType === "replace") {
      const product = await prisma.product.findUnique({ where: { id: body.productId! } });
      if (!product) throw new HttpError(400, "Replacement product not found");
      await prisma.$transaction([
        prisma.serviceRequest.update({ where: { id: job.id }, data: { resolutionType: "replace" } }),
        prisma.replacementItem.upsert({
          where: { serviceRequestId: job.id },
          update: { productId: product.id, serialNumber: body.serialNumber! },
          create: { serviceRequestId: job.id, productId: product.id, serialNumber: body.serialNumber! },
        }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.serviceRequest.update({ where: { id: job.id }, data: { resolutionType: "repair" } }),
        prisma.replacementItem.deleteMany({ where: { serviceRequestId: job.id } }),
      ]);
    }
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.post(
  "/:id/service-lines",
  asyncHandler(async (req, res) => {
    const body = parseBody(serviceLineSchema, req.body);
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const item = await prisma.serviceCatalogItem.findUnique({ where: { id: body.serviceCatalogItemId } });
    if (!item) {
      throw new HttpError(400, "Service not found");
    }
    if (!item.productCategories.includes(job.product.category)) {
      throw new HttpError(400, "This service does not match the product category");
    }
    const already = job.serviceLines.find((line) => line.serviceCatalogItemId === item.id);
    if (already) {
      throw new HttpError(400, "This service is already on the job");
    }
    await prisma.requestServiceLine.create({
      data: {
        serviceRequestId: job.id,
        serviceCatalogItemId: item.id,
        priceAtTime: item.price,
      },
    });
    res.status(201).json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.delete(
  "/:id/service-lines/:lineId",
  asyncHandler(async (req, res) => {
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const line = job.serviceLines.find((item) => item.id === req.params.lineId);
    if (!line) {
      throw new HttpError(404, "Service line not found");
    }
    await prisma.requestServiceLine.delete({ where: { id: line.id } });
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.post(
  "/:id/part-lines",
  asyncHandler(async (req, res) => {
    const body = parseBody(partLineSchema, req.body);
    const quantity = body.quantity ?? 1;
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const part = await prisma.sparePart.findUnique({ where: { id: body.sparePartId } });
    if (!part) {
      throw new HttpError(400, "Spare part not found");
    }
    if (!part.productCategories.includes(job.product.category)) {
      throw new HttpError(400, "This spare part does not match the product category");
    }

    const existingLine = job.partLines.find((line) => line.sparePartId === part.id);
    const nextQty = (existingLine?.quantity ?? 0) + quantity;

    await prisma.$transaction(async (tx) => {
      await consumeForJob(tx, { technicianId: req.staff!.sub, part, quantity, requestId: job.id });
      if (existingLine) {
        await tx.requestPartLine.update({
          where: { id: existingLine.id },
          data: { quantity: nextQty },
        });
      } else {
        await tx.requestPartLine.create({
          data: {
            serviceRequestId: job.id,
            sparePartId: part.id,
            quantity,
            priceAtTime: part.price,
            costAtTime: part.costPrice,
          },
        });
      }
    });
    await maybeAlertLowStock(part.id);

    res.status(201).json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.patch(
  "/:id/part-lines/:lineId",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ quantity: z.coerce.number().int().min(0).max(99) }), req.body);
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const line = job.partLines.find((item) => item.id === req.params.lineId);
    if (!line) {
      throw new HttpError(404, "Part line not found");
    }
    if (body.quantity === 0) {
      await prisma.$transaction(async (tx) => {
        await releaseFromJob(tx, { technicianId: req.staff!.sub, sparePartId: line.sparePartId, quantity: line.quantity, requestId: job.id });
        await tx.requestPartLine.delete({ where: { id: line.id } });
      });
      res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
      return;
    }
    const diff = body.quantity - line.quantity;
    if (diff === 0) {
      res.json(await jobWorkPayload(job));
      return;
    }
    const part = await prisma.sparePart.findUnique({ where: { id: line.sparePartId } });
    if (!part) {
      throw new HttpError(400, "Spare part not found");
    }
    await prisma.$transaction(async (tx) => {
      if (diff > 0) {
        await consumeForJob(tx, { technicianId: req.staff!.sub, part, quantity: diff, requestId: job.id });
      } else {
        await releaseFromJob(tx, { technicianId: req.staff!.sub, sparePartId: line.sparePartId, quantity: -diff, requestId: job.id });
      }
      await tx.requestPartLine.update({
        where: { id: line.id },
        data: { quantity: body.quantity },
      });
    });
    await maybeAlertLowStock(line.sparePartId);
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.delete(
  "/:id/part-lines/:lineId",
  asyncHandler(async (req, res) => {
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const line = job.partLines.find((item) => item.id === req.params.lineId);
    if (!line) {
      throw new HttpError(404, "Part line not found");
    }
    await prisma.$transaction(async (tx) => {
      await releaseFromJob(tx, { technicianId: req.staff!.sub, sparePartId: line.sparePartId, quantity: line.quantity, requestId: job.id });
      await tx.requestPartLine.delete({ where: { id: line.id } });
    });
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.post(
  "/:id/extra-expenses",
  asyncHandler(async (req, res) => {
    const body = parseBody(extraSchema, req.body);
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    await prisma.requestExtraExpense.create({
      data: {
        serviceRequestId: job.id,
        description: body.description,
        price: body.price,
      },
    });
    res.status(201).json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.delete(
  "/:id/extra-expenses/:expenseId",
  asyncHandler(async (req, res) => {
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const expense = job.extraExpenses.find((item) => item.id === req.params.expenseId);
    if (!expense) {
      throw new HttpError(404, "Extra expense not found");
    }
    await prisma.requestExtraExpense.delete({ where: { id: expense.id } });
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.post(
  "/:id/photos",
  acceptJobPhotos,
  asyncHandler(async (req, res) => {
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new HttpError(400, "Choose at least one photo");
    }
    await prisma.requestPhoto.createMany({
      data: files.map((file) => ({
        serviceRequestId: job.id,
        photoUrl: publicPhotoUrl(job.id, file.filename),
        uploadedBy: req.staff!.name,
        staffUserId: req.staff!.sub,
      })),
    });
    res.status(201).json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

myJobsRouter.delete(
  "/:id/photos/:photoId",
  asyncHandler(async (req, res) => {
    const job = await loadOpenJob(req.staff!.sub, req.params.id);
    const photo = job.photos.find((item) => item.id === req.params.photoId);
    if (!photo) {
      throw new HttpError(404, "Photo not found");
    }
    await prisma.requestPhoto.delete({ where: { id: photo.id } });
    removeUploadedFile(photo.photoUrl);
    res.json(await jobWorkPayload(await loadOwnedJob(req.staff!.sub, job.id)));
  }),
);

type OwnedJob = Prisma.ServiceRequestGetPayload<{ include: typeof jobDetailInclude }>;

async function finishJob(id: string, req: { staff?: { sub: string; name: string } | undefined; params: Record<string, string> }) {
  const existing = await loadOwnedJob(req.staff!.sub, id);
  if (techColumn(existing.status) !== "completed") {
    const next = finishedStatusFor(existing.type, existing.locationType, existing.resolutionType);
    await changeRequestStatus({
      requestId: existing.id,
      next,
      actor: { audit: staffActor(req.staff as { sub: string; name: string }), role: "technician" },
    });
  }
  return jobWorkPayload(await loadOwnedJob(req.staff!.sub, existing.id));
}

async function loadOwnedJob(technicianId: string, id: string) {
  const job = await prisma.serviceRequest.findUnique({
    where: { id },
    include: jobDetailInclude,
  });
  if (!job || job.assignedTechnicianId !== technicianId) {
    throw new HttpError(404, "Job not found");
  }
  return job;
}

async function loadOpenJob(technicianId: string, id: string) {
  const job = await loadOwnedJob(technicianId, id);
  if (techColumn(job.status) === "completed") {
    throw new HttpError(400, "Completed jobs cannot be edited");
  }
  return job;
}

async function jobWorkPayload(job: OwnedJob) {
  const [services, parts, replacementProducts, estimates, defectCodes, partOrders, notes] = await Promise.all([
    prisma.serviceCatalogItem.findMany({
      where: { productCategories: { has: job.product.category } },
      orderBy: { name: "asc" },
    }),
    prisma.sparePart.findMany({
      where: { productCategories: { has: job.product.category } },
      orderBy: { name: "asc" },
    }),
    job.type === "repair"
      ? prisma.product.findMany({ where: { category: job.product.category }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.estimate.findMany({ where: { serviceRequestId: job.id }, orderBy: { createdAt: "desc" }, include: estimateInclude }),
    prisma.defectCode.findMany({
      where: { kind: "defect", isActive: true, OR: [{ productCategory: null }, { productCategory: job.product.category }] },
      orderBy: { code: "asc" },
    }),
    prisma.partOrder.findMany({ where: { serviceRequestId: job.id }, orderBy: { createdAt: "desc" }, include: { sparePart: true } }),
    prisma.requestNote.findMany({ where: { serviceRequestId: job.id }, orderBy: { createdAt: "asc" }, include: { staffUser: { select: { name: true } }, customer: { select: { name: true } } } }),
  ]);
  const [checklist, carried] = await Promise.all([checklistView(job), technicianStockList(job.assignedTechnicianId ?? "")]);
  const carriedById = new Map(carried.map((row) => [row.sparePartId, row.quantity]));
  const work = serializeJobWork(job, {
    requireService: services.length > 0,
    type: job.type,
    sale: job.sale,
    coverage: coverageOf(job.product),
    decision: job.decision,
  });
  // Same rule as when the job is completed: repairs that are not replaced need their required items ticked.
  const checklistGap = checklist.missingRequired.length > 0 && job.type === "repair" && job.resolutionType !== "replace";
  return {
    job: serializeTechJob(job),
    pauses: serializePauses(job.pauses),
    timeline: await loadTimeline(job),
    decision: job.decision,
    ...work,
    // Required checklist items count towards completion like a missing photo does.
    canComplete: work.canComplete && !checklistGap,
    missing: checklistGap ? [...work.missing, "checklist"] : work.missing,
    checklist,
    estimates: await Promise.all(estimates.map(serializeEstimate)),
    defectCodes: defectCodes.map((row) => ({ id: row.id, code: row.code, ...serializeNamed(row) })),
    partOrders: partOrders.map((row) => ({
      id: row.id,
      quantity: row.quantity,
      status: row.status,
      ...serializeNamed(row.sparePart),
      createdAt: row.createdAt.toISOString(),
    })),
    notes: notes.map((row) => ({
      id: row.id,
      text: row.noteText,
      authorScope: row.authorScope,
      authorName: row.authorScope === "customer" ? (row.customer?.name ?? null) : (row.staffUser?.name ?? null),
      isVisibleToCustomer: row.isVisibleToCustomer,
      createdAt: row.createdAt.toISOString(),
    })),
    catalog: {
      replacementProducts: replacementProducts.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        sku: item.sku,
        category: item.category,
      })),
      services: services.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategories: item.productCategories,
      })),
      parts: parts.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategories: item.productCategories,
        stockQuantity: item.stockQuantity,
        carried: carriedById.get(item.id) ?? 0,
        lowStockThreshold: item.lowStockThreshold,
        lowStock: item.stockQuantity <= item.lowStockThreshold,
      })),
    },
    settings: await getAppSettings(),
  };
}

function serializeTechJob(job: Prisma.ServiceRequestGetPayload<{ include: typeof jobInclude }>) {
  return {
    ...serializeRequest(job as RequestRecord),
    column: techColumn(job.status),
  };
}

