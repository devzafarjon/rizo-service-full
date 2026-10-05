import { Router } from "express";
import type { TechnicianType } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { technicianWorkload } from "../lib/assignment.js";
import { tashkentCalendarDate } from "../lib/displayId.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { parseDateOnly, toDateOnly } from "../lib/warranty.js";
import { officeReadAdminWrite, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { forgetStaffActiveCache } from "../middleware/staffAuth.js";

const TYPES: TechnicianType[] = ["service_center", "mobile"];

export const techniciansRouter = Router();
techniciansRouter.use(staffAuth, officeReadAdminWrite);

techniciansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : "";
    const available = typeof req.query.available === "string" ? req.query.available : "";
    const technicians = await prisma.staffUser.findMany({
      where: {
        role: "technician",
        ...(req.query.includeInactive === "1" ? {} : { isActive: true }),
        ...(TYPES.includes(type as TechnicianType) ? { technicianType: type as TechnicianType } : {}),
        ...(available === "true" ? { isAvailable: true } : {}),
        ...(available === "false" ? { isAvailable: false } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        technicianType: true,
        isAvailable: true,
        isActive: true,
        serviceCenterId: true,
        role: true,
      },
    });
    const workload = await technicianWorkload(technicians.map((tech) => tech.id));
    const ranked = technicians
      .map((tech) => ({
        ...tech,
        openJobCount: workload.get(tech.id) ?? 0,
      }))
      .sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        if (a.openJobCount !== b.openJobCount) return a.openJobCount - b.openJobCount;
        return a.name.localeCompare(b.name);
      });
    res.json({ technicians: ranked });
  }),
);

techniciansRouter.get(
  "/schedule",
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === "string" ? parseDateOnly(req.query.from) : parseDateOnly(tashkentCalendarDate(new Date()));
    const to = typeof req.query.to === "string" ? parseDateOnly(req.query.to) : new Date(from.getTime() + 13 * 86400000);
    const technicians = await prisma.staffUser.findMany({
      where: { role: "technician", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, technicianType: true, isAvailable: true },
    });
    const rows = await prisma.technicianSchedule.findMany({
      where: { date: { gte: from, lte: to } },
    });
    res.json({
      from: toDateOnly(from),
      to: toDateOnly(to),
      technicians,
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

techniciansRouter.put(
  "/:id/schedule",
  asyncHandler(async (req, res) => {
    const tech = await prisma.staffUser.findFirst({
      where: { id: req.params.id, role: "technician" },
    });
    if (!tech) throw new HttpError(404, "Technician not found");
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
      where: { technicianId_date: { technicianId: tech.id, date } },
      update: { isWorking: body.isWorking, startTime: body.startTime ?? null, endTime: body.endTime ?? null },
      create: {
        technicianId: tech.id,
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

techniciansRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const tech = await prisma.staffUser.findUnique({ where: { id: req.params.id } });
    if (!tech) throw new HttpError(404, "Technician not found");
    const body = parseBody(
      z.object({
        role: z.enum(["admin", "technician"]).optional(),
        technicianType: z.enum(["service_center", "mobile"]).optional().nullable(),
        isAvailable: z.boolean().optional(),
        isActive: z.boolean().optional(),
        serviceCenterId: z.string().min(1).nullable().optional(),
        payPercent: z.coerce.number().min(0).max(100).optional(),
        payFixedPerJob: z.coerce.number().min(0).optional(),
      }),
      req.body,
    );
    if (body.isActive === false && tech.id === req.staff!.sub) {
      throw new HttpError(400, "You cannot deactivate your own account");
    }
    const updated = await prisma.staffUser.update({
      where: { id: tech.id },
      data: {
        ...(body.role ? { role: body.role } : {}),
        ...(body.technicianType !== undefined ? { technicianType: body.technicianType } : {}),
        ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.serviceCenterId !== undefined ? { serviceCenterId: body.serviceCenterId } : {}),
        ...(body.payPercent !== undefined ? { payPercent: body.payPercent } : {}),
        ...(body.payFixedPerJob !== undefined ? { payFixedPerJob: body.payFixedPerJob } : {}),
      },
    });
    forgetStaffActiveCache(tech.id);
    if (body.isActive !== undefined && body.isActive !== tech.isActive) {
      await writeAudit({
        actor: staffActor(req.staff),
        action: "staff.active",
        entityType: "StaffUser",
        entityId: tech.id,
        oldValue: { isActive: tech.isActive },
        newValue: { isActive: body.isActive },
      });
    }
    if (body.role && body.role !== tech.role) {
      await writeAudit({
        actor: staffActor(req.staff),
        action: "staff.role",
        entityType: "StaffUser",
        entityId: tech.id,
        oldValue: { role: tech.role },
        newValue: { role: body.role },
      });
    }
    res.json({
      technician: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        role: updated.role,
        technicianType: updated.technicianType,
        isAvailable: updated.isAvailable,
        isActive: updated.isActive,
        serviceCenterId: updated.serviceCenterId,
        payPercent: Number(updated.payPercent),
        payFixedPerJob: Number(updated.payFixedPerJob),
      },
    });
  }),
);
