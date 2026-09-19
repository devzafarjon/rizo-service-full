import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { completionGaps, computeJobCost, serializeJobWork, workInclude } from "../lib/jobWork.js";
import { serializeNamed } from "../lib/named.js";
import { notifyRequestStatus } from "../lib/notifyCustomer.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { publishRequest } from "../lib/realtime.js";
import { statusPatch } from "../lib/requestLifecycle.js";
import { buildTimeline, serializePauses } from "../lib/timeline.js";
import { serializeRequest, type RequestRecord } from "../lib/serializeRequest.js";
import {
  NEW_TIMER_MS,
  PROGRESS_TIMER_MS,
  completedStatusFor,
  inProgressStatusFor,
  techColumn,
} from "../lib/techBoard.js";
import { acceptJobPhotos, publicPhotoUrl, removeUploadedFile } from "../lib/uploads.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

const jobInclude = Prisma.validator<Prisma.ServiceRequestInclude>()({
  customer: { select: { id: true, name: true, phone: true, address: true, regionCode: true } },
  product: true,
  assignedTechnician: { select: { id: true, name: true, technicianType: true, isAvailable: true } },
  sale: { include: { product: true } },
  pauses: { orderBy: { pausedAt: "desc" } },
});

const jobDetailInclude = Prisma.validator<Prisma.ServiceRequestInclude>()({
  customer: { select: { id: true, name: true, phone: true, address: true, regionCode: true } },
  product: true,
  assignedTechnician: { select: { id: true, name: true, technicianType: true, isAvailable: true } },
  sale: { include: { product: true } },
  pauses: { orderBy: { pausedAt: "desc" } },
  ...workInclude,
});

const moveSchema = z
  .object({
    column: z.enum(["new", "in_progress", "paused", "completed"]),
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
    if (data.column === "paused") {
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
  "/",
  asyncHandler(async (req, res) => {
    const jobs = await prisma.serviceRequest.findMany({
      where: { assignedTechnicianId: req.staff!.sub },
      orderBy: { createdAt: "desc" },
      include: jobInclude,
    });
    res.json({ jobs: jobs.map(serializeTechJob) });
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
    const activePause = existing.pauses.find((pause) => pause.resumedAt == null) ?? null;
    const currentColumn = techColumn(existing.type, existing.status, Boolean(activePause));
    if (currentColumn === "completed" && body.column !== "completed") {
      throw new HttpError(400, "Completed jobs cannot be moved on this board");
    }
    if (currentColumn === body.column) {
      res.json({ job: serializeTechJob(existing) });
      return;
    }

    if (body.column === "completed") {
      res.json(await finishJob(existing, req.staff!.name));
      return;
    }

    const now = new Date();
    if (body.column === "paused") {
      if (activePause) {
        throw new HttpError(400, "This job is already paused");
      }
      const reason = body.pauseReason;
      const hours = body.pauseHours;
      if (!reason || hours == null) {
        throw new HttpError(400, "Pause reason and duration are required");
      }
      await prisma.requestPause.create({
        data: {
          serviceRequestId: existing.id,
          reason,
          customTimerHours: hours,
          pausedAt: now,
        },
      });
    } else if (activePause) {
      await prisma.requestPause.update({
        where: { id: activePause.id },
        data: { resumedAt: now },
      });
    }

    const nextStatus = inProgressStatusFor(existing.type, existing.status);
    if (nextStatus !== existing.status) {
      await prisma.serviceRequest.update({
        where: { id: existing.id },
        data: statusPatch(existing, nextStatus, now),
      });
    }

    const fresh = await loadOwnedJob(req.staff!.sub, existing.id);
    const serialized = serializeRequest(fresh as RequestRecord);
    publishRequest("request:updated", serialized);
    if (nextStatus !== existing.status) {
      await notifyRequestStatus(fresh);
    }
    res.json({ job: serializeTechJob(fresh) });
  }),
);

myJobsRouter.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const existing = await loadOwnedJob(req.staff!.sub, req.params.id);
    res.json(await finishJob(existing, req.staff!.name));
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
    if (item.productCategory !== job.product.category) {
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
    if (part.productCategory !== job.product.category) {
      throw new HttpError(400, "This spare part does not match the product category");
    }

    const existingLine = job.partLines.find((line) => line.sparePartId === part.id);
    const nextQty = (existingLine?.quantity ?? 0) + quantity;
    if (part.stockQuantity < quantity) {
      throw new HttpError(400, `Only ${part.stockQuantity} ${part.name} in stock`, "stockInsufficient", {
        count: part.stockQuantity,
        ...serializeNamed(part),
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.sparePart.update({
        where: { id: part.id },
        data: { stockQuantity: { decrement: quantity } },
      });
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
          },
        });
      }
    });

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
        await tx.sparePart.update({
          where: { id: line.sparePartId },
          data: { stockQuantity: { increment: line.quantity } },
        });
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
    if (diff > 0 && part.stockQuantity < diff) {
      throw new HttpError(400, `Only ${part.stockQuantity} ${part.name} in stock`, "stockInsufficient", {
        count: part.stockQuantity,
        ...serializeNamed(part),
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.sparePart.update({
        where: { id: line.sparePartId },
        data: { stockQuantity: { decrement: diff } },
      });
      await tx.requestPartLine.update({
        where: { id: line.id },
        data: { quantity: body.quantity },
      });
    });
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
      await tx.sparePart.update({
        where: { id: line.sparePartId },
        data: { stockQuantity: { increment: line.quantity } },
      });
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
  const column = techColumn(
    job.type,
    job.status,
    job.pauses.some((pause) => pause.resumedAt == null),
  );
  if (column === "completed") {
    throw new HttpError(400, "Completed jobs cannot be edited");
  }
  return job;
}

async function finishJob(existing: OwnedJob, _technicianName: string) {
  const column = techColumn(
    existing.type,
    existing.status,
    existing.pauses.some((pause) => pause.resumedAt == null),
  );
  if (column === "completed") {
    return { job: serializeTechJob(existing), ...serializeJobWork(existing) };
  }

  const gaps = completionGaps(existing);
  if (gaps.length > 0) {
    throw new HttpError(400, `Add ${joinGaps(gaps)} before completing`, "jobIncomplete", { gaps });
  }

  const now = new Date();
  const activePause = existing.pauses.find((pause) => pause.resumedAt == null) ?? null;
  if (activePause) {
    await prisma.requestPause.update({
      where: { id: activePause.id },
      data: { resumedAt: now },
    });
  }

  const nextStatus = completedStatusFor(existing.type);
  const cost = computeJobCost(existing);
  await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: {
      ...statusPatch(existing, nextStatus, now),
      estimatedCost: cost.workTotal,
      finalCost: cost.chargedTotal,
      paymentStatus: cost.coveredByWarranty || cost.chargedTotal === 0 ? "not_required" : "pending",
    },
  });

  const fresh = await prisma.serviceRequest.findUniqueOrThrow({
    where: { id: existing.id },
    include: jobDetailInclude,
  });
  const serialized = serializeRequest(fresh as RequestRecord);
  publishRequest("request:updated", serialized);
  if (nextStatus !== existing.status) {
    await notifyRequestStatus(fresh);
  }

  return {
    job: serializeTechJob(fresh),
    pauses: serializePauses(fresh.pauses),
    timeline: buildTimeline(fresh),
    ...serializeJobWork(fresh),
  };
}

async function jobWorkPayload(job: OwnedJob) {
  const [services, parts] = await Promise.all([
    prisma.serviceCatalogItem.findMany({
      where: { productCategory: job.product.category },
      orderBy: { name: "asc" },
    }),
    prisma.sparePart.findMany({
      where: { productCategory: job.product.category },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    job: serializeTechJob(job),
    pauses: serializePauses(job.pauses),
    timeline: buildTimeline(job),
    ...serializeJobWork(job),
    catalog: {
      services: services.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategory: item.productCategory,
      })),
      parts: parts.map((item) => ({
        id: item.id,
        ...serializeNamed(item),
        price: Number(item.price),
        productCategory: item.productCategory,
        stockQuantity: item.stockQuantity,
      })),
    },
  };
}

function serializeTechJob(job: Prisma.ServiceRequestGetPayload<{ include: typeof jobInclude }>) {
  const activePause = job.pauses.find((pause) => pause.resumedAt == null) ?? null;
  const column = techColumn(job.type, job.status, Boolean(activePause));
  return {
    ...serializeRequest(job as RequestRecord),
    column,
    activePause: activePause
      ? {
          id: activePause.id,
          reason: activePause.reason,
          pausedAt: activePause.pausedAt.toISOString(),
          customTimerHours: Number(activePause.customTimerHours),
        }
      : null,
    timer: timerFor(column, job.createdAt, job.acceptedAt, activePause),
  };
}

function timerFor(
  column: ReturnType<typeof techColumn>,
  createdAt: Date,
  acceptedAt: Date | null,
  pause: { pausedAt: Date; customTimerHours: { toString(): string } | number } | null,
) {
  if (column === "completed") return null;
  if (column === "paused" && pause) {
    return {
      startsAt: pause.pausedAt.toISOString(),
      durationMs: Number(pause.customTimerHours) * 60 * 60 * 1000,
    };
  }
  if (column === "new") {
    return { startsAt: createdAt.toISOString(), durationMs: NEW_TIMER_MS };
  }
  return {
    startsAt: (acceptedAt ?? createdAt).toISOString(),
    durationMs: PROGRESS_TIMER_MS,
  };
}

function joinGaps(gaps: Array<"service" | "part" | "photo">) {
  const labels = {
    service: "at least one service",
    part: "at least one spare part",
    photo: "at least one photo",
  };
  const text = gaps.map((gap) => labels[gap]);
  if (text.length === 1) return text[0];
  if (text.length === 2) return `${text[0]} and ${text[1]}`;
  return `${text.slice(0, -1).join(", ")}, and ${text[text.length - 1]}`;
}
