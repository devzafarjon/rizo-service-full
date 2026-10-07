import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { READ_OFFICE } from "../lib/roles.js";
import { cancelPlan, payPlan, purchaseInclude, serializePlan, serializePurchase } from "../lib/warrantyPlans.js";
import { readWriteRoles, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

// Paid warranty extensions ("+12 months"): the plan catalogue and the purchases.
export const warrantyPlansRouter = Router();
warrantyPlansRouter.use(staffAuth, readWriteRoles(READ_OFFICE, ["admin", "receptionist"]));

const namedFields = z.object({
  name: z.string().trim().max(120).default(""),
  nameUz: z.string().trim().max(120).default(""),
  nameRu: z.string().trim().max(120).default(""),
  nameEn: z.string().trim().max(120).default(""),
  months: z.coerce.number().int().min(1).max(60),
  price: z.coerce.number().nonnegative(),
  productCategories: z.array(z.string().trim().min(1).max(60)).min(1, "Choose at least one category").max(40),
  isActive: z.boolean().default(true),
});

const planSchema = namedFields.superRefine((data, ctx) => {
  if (!(data.name || data.nameUz || data.nameRu || data.nameEn)) ctx.addIssue({ code: "custom", message: "Name is required", path: ["name"] });
});

const methodSchema = z.enum(["cash", "card", "transfer", "payme", "click", "other"]).default("cash");

warrantyPlansRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const plans = await prisma.warrantyPlan.findMany({ orderBy: [{ isActive: "desc" }, { months: "asc" }] });
    res.json({ plans: plans.map(serializePlan) });
  }),
);

warrantyPlansRouter.post(
  "/",
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    const body = parseBody(planSchema, req.body);
    const name = body.name || body.nameEn || body.nameUz || body.nameRu;
    const plan = await prisma.warrantyPlan.create({ data: { ...body, name } });
    await writeAudit({ actor: staffActor(req.staff), action: "warrantyPlan.create", entityType: "WarrantyPlan", entityId: plan.id });
    res.status(201).json({ plan: serializePlan(plan) });
  }),
);

warrantyPlansRouter.patch(
  "/:id",
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    const body = parseBody(namedFields.partial(), req.body);
    const existing = await prisma.warrantyPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Record not found");
    const plan = await prisma.warrantyPlan.update({ where: { id: existing.id }, data: body });
    await writeAudit({ actor: staffActor(req.staff), action: "warrantyPlan.update", entityType: "WarrantyPlan", entityId: plan.id });
    res.json({ plan: serializePlan(plan) });
  }),
);

warrantyPlansRouter.delete(
  "/:id",
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.warrantyPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Record not found");
    const used = await prisma.warrantyPlanPurchase.count({ where: { planId: existing.id } });
    if (used > 0) throw new HttpError(400, "This plan was already bought or requested. Switch it off instead.", "planInUse");
    await prisma.warrantyPlan.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  }),
);

warrantyPlansRouter.get(
  "/purchases",
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === "string" && ["requested", "paid", "cancelled"].includes(req.query.status) ? req.query.status : undefined;
    const rows = await prisma.warrantyPlanPurchase.findMany({ where: { status }, orderBy: { requestedAt: "desc" }, take: 200, include: purchaseInclude });
    res.json({ purchases: rows.map(serializePurchase) });
  }),
);

// Sold at the counter: takes the payment and extends the warranty in one step.
warrantyPlansRouter.post(
  "/sell",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ saleId: z.string().min(1), planId: z.string().min(1), method: methodSchema, fiscalReceiptNumber: z.string().trim().max(60).optional().nullable() }), req.body);
    const purchase = await payPlan({ saleId: body.saleId, planId: body.planId, method: body.method, fiscalReceiptNumber: body.fiscalReceiptNumber, actor: staffActor(req.staff) });
    res.status(201).json({ purchase: serializePurchase(purchase) });
  }),
);

warrantyPlansRouter.post(
  "/purchases/:id/pay",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ method: methodSchema, fiscalReceiptNumber: z.string().trim().max(60).optional().nullable() }), req.body ?? {});
    const purchase = await payPlan({ purchaseId: req.params.id, method: body.method, fiscalReceiptNumber: body.fiscalReceiptNumber, actor: staffActor(req.staff) });
    res.json({ purchase: serializePurchase(purchase) });
  }),
);

warrantyPlansRouter.post(
  "/purchases/:id/cancel",
  asyncHandler(async (req, res) => {
    res.json({ purchase: serializePurchase(await cancelPlan(req.params.id, staffActor(req.staff))) });
  }),
);
