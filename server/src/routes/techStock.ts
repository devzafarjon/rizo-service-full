import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { serializeNamed } from "../lib/named.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { PARTS } from "../lib/roles.js";
import { issueToTechnician, returnFromTechnician } from "../lib/techStock.js";
import { maybeAlertLowStock } from "../lib/stockAlerts.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

// The parts each technician carries. The warehouse hands parts out and takes unused ones back.
export const techStockRouter = Router();
techStockRouter.use(staffAuth, requireStaffRole(...PARTS));

const moveSchema = z.object({
  technicianId: z.string().min(1),
  sparePartId: z.string().min(1),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1").max(999),
  note: z.string().trim().max(200).optional().nullable(),
});

techStockRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const technicians = await prisma.staffUser.findMany({
      where: { role: "technician", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, technicianType: true, stocks: { where: { quantity: { gt: 0 } }, include: { sparePart: true }, orderBy: { sparePart: { name: "asc" } } } },
    });
    res.json({
      technicians: technicians.map((tech) => ({
        id: tech.id,
        name: tech.name,
        technicianType: tech.technicianType,
        items: tech.stocks.map((row) => ({ sparePartId: row.sparePartId, quantity: row.quantity, ...serializeNamed(row.sparePart) })),
        total: tech.stocks.reduce((sum, row) => sum + row.quantity, 0),
      })),
    });
  }),
);

techStockRouter.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const technicianId = typeof req.query.technicianId === "string" && req.query.technicianId ? req.query.technicianId : undefined;
    const sparePartId = typeof req.query.sparePartId === "string" && req.query.sparePartId ? req.query.sparePartId : undefined;
    const rows = await prisma.stockMovement.findMany({ where: { technicianId, sparePartId }, orderBy: { createdAt: "desc" }, take: 100 });
    const parts = await prisma.sparePart.findMany({ where: { id: { in: [...new Set(rows.map((row) => row.sparePartId))] } } });
    const techs = await prisma.staffUser.findMany({ where: { id: { in: rows.map((row) => row.technicianId).filter((id): id is string => Boolean(id)) } }, select: { id: true, name: true } });
    const partById = new Map(parts.map((part) => [part.id, part]));
    const techById = new Map(techs.map((tech) => [tech.id, tech.name]));
    res.json({
      movements: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        quantity: row.quantity,
        technicianName: row.technicianId ? (techById.get(row.technicianId) ?? null) : null,
        part: partById.get(row.sparePartId) ? serializeNamed(partById.get(row.sparePartId)!) : null,
        serviceRequestId: row.serviceRequestId,
        note: row.note,
        createdByName: row.createdByName,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }),
);

techStockRouter.post(
  "/issue",
  asyncHandler(async (req, res) => {
    const body = parseBody(moveSchema, req.body);
    const staff = req.staff!;
    await issueToTechnician({ ...body, by: { id: staff.sub, name: staff.name } });
    await writeAudit({ actor: staffActor(staff), action: "stock.issue", entityType: "SparePart", entityId: body.sparePartId, newValue: { technicianId: body.technicianId, quantity: body.quantity } });
    await maybeAlertLowStock(body.sparePartId);
    res.status(201).json({ ok: true });
  }),
);

techStockRouter.post(
  "/return",
  asyncHandler(async (req, res) => {
    const body = parseBody(moveSchema, req.body);
    const staff = req.staff!;
    await returnFromTechnician({ ...body, by: { id: staff.sub, name: staff.name } });
    await writeAudit({ actor: staffActor(staff), action: "stock.return", entityType: "SparePart", entityId: body.sparePartId, newValue: { technicianId: body.technicianId, quantity: body.quantity } });
    await maybeAlertLowStock(body.sparePartId);
    res.status(201).json({ ok: true });
  }),
);
