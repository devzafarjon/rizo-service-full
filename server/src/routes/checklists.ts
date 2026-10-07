import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { checklistItemSchema } from "../lib/checklists.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { readWriteRoles, staffAuth } from "../middleware/staffAuth.js";

// Checklists a technician ticks off during diagnosis and before completing a job. Admins edit them.
export const checklistsRouter = Router();
checklistsRouter.use(staffAuth, readWriteRoles(["admin", "receptionist"], ["admin"]));

const bodySchema = z.object({
  kind: z.enum(["diagnosis", "completion"]),
  productCategory: z.string().trim().min(1).max(60).nullable().optional(),
  items: z
    .array(checklistItemSchema)
    .min(1, "Add at least one item")
    .max(30)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "Item ids must be unique"),
  isActive: z.boolean().optional(),
});

function serialize(row: { id: string; kind: string; productCategory: string | null; items: unknown; isActive: boolean }) {
  return { id: row.id, kind: row.kind, productCategory: row.productCategory, items: row.items, isActive: row.isActive };
}

checklistsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.checklistTemplate.findMany({ orderBy: [{ kind: "asc" }, { productCategory: "asc" }] });
    res.json({ checklists: rows.map(serialize) });
  }),
);

checklistsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(bodySchema, req.body);
    const exists = await prisma.checklistTemplate.findFirst({ where: { kind: body.kind, productCategory: body.productCategory ?? null } });
    if (exists) throw new HttpError(409, "A checklist for this category already exists", "checklistExists");
    const row = await prisma.checklistTemplate.create({ data: { kind: body.kind, productCategory: body.productCategory ?? null, items: body.items, isActive: body.isActive ?? true } });
    await writeAudit({ actor: staffActor(req.staff), action: "checklist.create", entityType: "ChecklistTemplate", entityId: row.id, newValue: { kind: row.kind, category: row.productCategory } });
    res.status(201).json({ checklist: serialize(row) });
  }),
);

checklistsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(bodySchema.partial(), req.body);
    const existing = await prisma.checklistTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Record not found");
    const row = await prisma.checklistTemplate.update({
      where: { id: existing.id },
      data: { ...(body.items ? { items: body.items } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) },
    });
    await writeAudit({ actor: staffActor(req.staff), action: "checklist.update", entityType: "ChecklistTemplate", entityId: row.id });
    res.json({ checklist: serialize(row) });
  }),
);

checklistsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.checklistTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Record not found");
    await prisma.checklistTemplate.delete({ where: { id: existing.id } });
    await writeAudit({ actor: staffActor(req.staff), action: "checklist.delete", entityType: "ChecklistTemplate", entityId: existing.id });
    res.json({ ok: true });
  }),
);
