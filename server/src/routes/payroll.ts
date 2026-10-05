import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { parseReportRange, serializeWindow } from "../lib/reportRange.js";
import { DONE_STATUSES } from "../lib/status.js";
import { money } from "../lib/warranty.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

/** Piece-rate pay: a percentage of the labor (services) on each finished job, a fixed amount per job, and manual bonuses or penalties. */
export async function earningsFor(technicianId: string, window: ReturnType<typeof parseReportRange>) {
  const technician = await prisma.staffUser.findUnique({ where: { id: technicianId } });
  if (!technician) throw new HttpError(404, "Technician not found");
  const jobs = await prisma.serviceRequest.findMany({
    where: {
      assignedTechnicianId: technicianId,
      status: { in: DONE_STATUSES },
      completedAt: { gte: window.from ?? new Date(0), lte: window.to },
    },
    include: { serviceLines: true, product: true },
    orderBy: { completedAt: "desc" },
  });
  const adjustments = await prisma.payAdjustment.findMany({
    where: { staffUserId: technicianId, createdAt: { gte: window.from ?? new Date(0), lte: window.to } },
    orderBy: { createdAt: "desc" },
  });
  const percent = money(technician.payPercent);
  const fixed = money(technician.payFixedPerJob);
  const lines = jobs.map((job) => {
    const labor = job.serviceLines.reduce((sum, line) => sum + money(line.priceAtTime), 0);
    const earned = Math.round((labor * percent) / 100 + fixed);
    return { id: job.id, displayId: job.displayId, completedAt: job.completedAt?.toISOString() ?? null, type: job.type, labor, earned };
  });
  const jobsTotal = lines.reduce((sum, line) => sum + line.earned, 0);
  const adjustmentsTotal = adjustments.reduce((sum, row) => sum + money(row.amount), 0);
  return {
    technician: { id: technician.id, name: technician.name, payPercent: percent, payFixedPerJob: fixed },
    jobs: lines,
    adjustments: adjustments.map((row) => ({ id: row.id, amount: money(row.amount), reason: row.reason, createdAt: row.createdAt.toISOString() })),
    jobsTotal,
    adjustmentsTotal,
    total: jobsTotal + adjustmentsTotal,
  };
}

export const payrollRouter = Router();
payrollRouter.use(staffAuth, requireStaffRole("admin"));

payrollRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const technicians = await prisma.staffUser.findMany({ where: { role: "technician" }, orderBy: { name: "asc" } });
    const rows = [];
    for (const technician of technicians) {
      const result = await earningsFor(technician.id, window);
      rows.push({ ...result.technician, jobs: result.jobs.length, jobsTotal: result.jobsTotal, adjustmentsTotal: result.adjustmentsTotal, total: result.total });
    }
    res.json({ range: serializeWindow(window), rows, grandTotal: rows.reduce((sum, row) => sum + row.total, 0) });
  }),
);

payrollRouter.get(
  "/:technicianId",
  asyncHandler(async (req, res) => {
    res.json({ range: serializeWindow(parseReportRange(req.query)), ...(await earningsFor(req.params.technicianId, parseReportRange(req.query))) });
  }),
);

payrollRouter.post(
  "/adjustments",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ staffUserId: z.string().min(1), amount: z.coerce.number().refine((value) => value !== 0, "Enter a bonus (positive) or a penalty (negative)"), reason: z.string().trim().min(1, "Give a reason").max(200) }), req.body);
    const technician = await prisma.staffUser.findUnique({ where: { id: body.staffUserId } });
    if (!technician || technician.role !== "technician") throw new HttpError(404, "Technician not found");
    const row = await prisma.payAdjustment.create({ data: { staffUserId: technician.id, amount: body.amount, reason: body.reason, createdById: req.staff!.sub } });
    await writeAudit({ actor: staffActor(req.staff), action: "payroll.adjustment", entityType: "StaffUser", entityId: technician.id, newValue: { amount: body.amount, reason: body.reason } });
    res.status(201).json({ adjustment: { id: row.id } });
  }),
);
