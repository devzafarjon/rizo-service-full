import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { readWriteRoles, staffAuth } from "../middleware/staffAuth.js";

export const suppliersRouter = Router();
suppliersRouter.use(staffAuth, readWriteRoles(["admin", "receptionist", "warehouse", "accountant"], ["admin", "warehouse"]));

const text = (max: number) => z.string().trim().max(max).optional().nullable();
const supplierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: text(40),
  telegram: text(60),
  note: text(300),
  leadTimeDays: z.coerce.number().int().min(0).max(120).optional(),
  isActive: z.boolean().optional(),
});

function serialize(row: { id: string; name: string; phone: string | null; telegram: string | null; note: string | null; leadTimeDays: number; isActive: boolean; _count?: { parts: number; orders: number } }) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    telegram: row.telegram,
    note: row.note,
    leadTimeDays: row.leadTimeDays,
    isActive: row.isActive,
    partsCount: row._count?.parts ?? 0,
    ordersCount: row._count?.orders ?? 0,
  };
}

const include = { _count: { select: { parts: true, orders: true } } } as const;

suppliersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.supplier.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }], include });
    res.json({ suppliers: rows.map(serialize) });
  }),
);

suppliersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(supplierSchema, req.body);
    const row = await prisma.supplier.create({
      data: { name: body.name, phone: body.phone || null, telegram: body.telegram || null, note: body.note || null, leadTimeDays: body.leadTimeDays ?? 3, isActive: body.isActive ?? true },
      include,
    });
    await writeAudit({ actor: staffActor(req.staff), action: "supplier.create", entityType: "Supplier", entityId: row.id, newValue: { name: row.name } });
    res.status(201).json({ supplier: serialize(row) });
  }),
);

suppliersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(supplierSchema.partial(), req.body);
    const existing = await prisma.supplier.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Supplier not found");
    const row = await prisma.supplier.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        ...(body.telegram !== undefined ? { telegram: body.telegram || null } : {}),
        ...(body.note !== undefined ? { note: body.note || null } : {}),
        ...(body.leadTimeDays !== undefined ? { leadTimeDays: body.leadTimeDays } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include,
    });
    await writeAudit({ actor: staffActor(req.staff), action: "supplier.update", entityType: "Supplier", entityId: row.id, newValue: { name: row.name, isActive: row.isActive } });
    res.json({ supplier: serialize(row) });
  }),
);

// A supplier that was never used can be removed; otherwise it is only switched off.
suppliersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.supplier.findUnique({ where: { id: req.params.id }, include });
    if (!existing) throw new HttpError(404, "Supplier not found");
    if (existing._count.orders > 0) throw new HttpError(409, "This supplier has orders; switch it off instead", "supplierInUse");
    await prisma.supplier.delete({ where: { id: existing.id } });
    await writeAudit({ actor: staffActor(req.staff), action: "supplier.delete", entityType: "Supplier", entityId: existing.id, oldValue: { name: existing.name } });
    res.json({ ok: true });
  }),
);
