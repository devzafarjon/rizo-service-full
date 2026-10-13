import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { addBrand, addModel, directoryKey, fullModelName, OWN_BRAND_ID, serializeBrand, similarBrands, similarModels } from "../lib/brands.js";
import { HttpError } from "../lib/httpError.js";
import { notifyAdmins } from "../lib/notifyStaff.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { readWriteRoles, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

// The directory of makes and models, and each technician's "I repair" list.
// Anyone on staff reads it; technicians, the front desk and admins add to it; only an admin approves, renames, merges or deletes.
export const directoryRouter = Router();
directoryRouter.use(staffAuth);
const readAll = readWriteRoles(["admin", "receptionist", "technician", "accountant", "warehouse"], ["admin"]);
const canAdd = requireStaffRole("admin", "receptionist", "technician");
const adminOnly = requireStaffRole("admin");

const actorOf = (req: { staff?: { sub: string; name: string; role: string } }) => ({ id: req.staff!.sub, name: req.staff!.name, role: req.staff!.role });

function serializeModel(product: { id: string; name: string; sku: string; category: string; approved: boolean; addedByName: string | null; brandId: string; brand?: { name: string; approved: boolean; isOwn: boolean } | null; _count?: { sales: number; requests: number } }) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    brandId: product.brandId,
    brandName: product.brand?.name ?? null,
    isOwn: product.brand?.isOwn ?? false,
    approved: product.approved,
    addedByName: product.addedByName,
    ...(product._count ? { salesCount: product._count.sales, requestsCount: product._count.requests } : {}),
  };
}

async function tellAdmins(kind: "brand" | "model", name: string, by: string) {
  await notifyAdmins({ message: `${by} added a new ${kind}: ${name}. Approve it so it can be used.`, code: kind === "brand" ? "catalogPendingBrand" : "catalogPendingModel", params: { name, by } });
}

async function listSkills(staffId: string) {
  const rows = await prisma.staffSkill.findMany({ where: { staffUserId: staffId }, include: { brand: true, product: true }, orderBy: { createdAt: "asc" } });
  return {
    brands: rows.filter((row) => row.brand).map((row) => serializeBrand(row.brand!)),
    models: rows.filter((row) => row.product).map((row) => serializeModel({ ...row.product!, brand: null })),
  };
}

directoryRouter.get(
  "/categories",
  readAll,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.productCategory.findMany({ orderBy: { name: "asc" }, select: { name: true } });
    res.json({ categories: rows.map((row) => row.name) });
  }),
);

// ---- brands -------------------------------------------------------------------------------------------------------------

directoryRouter.get(
  "/brands",
  readAll,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const brands = await prisma.brand.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : {},
      orderBy: [{ isOwn: "desc" }, { name: "asc" }],
      include: { products: { select: { category: true, approved: true } } },
    });
    res.json({
      brands: brands.map((brand) =>
        serializeBrand(brand, {
          modelCount: brand.products.length,
          pendingModels: brand.products.filter((product) => !product.approved).length,
          categories: [...new Set(brand.products.map((product) => product.category))].sort(),
        }),
      ),
    });
  }),
);

directoryRouter.get(
  "/brands/check",
  readAll,
  asyncHandler(async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    const found = await similarBrands(name);
    res.json({ exact: found.exact ? serializeBrand(found.exact) : null, similar: found.similar.map((brand) => serializeBrand(brand)) });
  }),
);

directoryRouter.post(
  "/brands",
  canAdd,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ name: z.string().trim().min(1).max(60), force: z.boolean().optional() }), req.body);
    const actor = actorOf(req);
    const { brand, created } = await addBrand({ name: body.name, actor, force: body.force });
    if (created) {
      if (actor.role === "technician") await prisma.staffSkill.create({ data: { staffUserId: actor.id, brandId: brand.id } });
      await writeAudit({ actor: staffActor(req.staff), action: "directory.brand.add", entityType: "Brand", entityId: brand.id, newValue: { name: brand.name, approved: brand.approved } });
      if (!brand.approved) await tellAdmins("brand", brand.name, actor.name);
    }
    res.status(created ? 201 : 200).json({ brand: serializeBrand(brand), created });
  }),
);

directoryRouter.patch(
  "/brands/:id",
  adminOnly,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
    const brand = await prisma.brand.findUnique({ where: { id: req.params.id } });
    if (!brand) throw new HttpError(404, "Brand not found");
    if (brand.isOwn) throw new HttpError(400, "The company's own brand cannot be renamed", "ownBrand");
    try {
      const updated = await prisma.brand.update({ where: { id: brand.id }, data: { name: body.name.replace(/\s+/g, " "), key: directoryKey(body.name) } });
      await writeAudit({ actor: staffActor(req.staff), action: "directory.brand.rename", entityType: "Brand", entityId: brand.id, oldValue: { name: brand.name }, newValue: { name: updated.name } });
      res.json({ brand: serializeBrand(updated) });
    } catch (error) {
      handlePrismaError(error, { key: "A brand with this name already exists" });
    }
  }),
);

directoryRouter.post(
  "/brands/:id/approve",
  adminOnly,
  asyncHandler(async (req, res) => {
    const brand = await prisma.brand.findUnique({ where: { id: req.params.id } });
    if (!brand) throw new HttpError(404, "Brand not found");
    await prisma.$transaction([
      prisma.brand.update({ where: { id: brand.id }, data: { approved: true } }),
      // One click approves the brand together with the models that came with it.
      prisma.product.updateMany({ where: { brandId: brand.id, approved: false }, data: { approved: true } }),
    ]);
    await writeAudit({ actor: staffActor(req.staff), action: "directory.approve", entityType: "Brand", entityId: brand.id, newValue: { name: brand.name } });
    res.json({ ok: true });
  }),
);

directoryRouter.delete(
  "/brands/:id",
  adminOnly,
  asyncHandler(async (req, res) => {
    const brand = await prisma.brand.findUnique({ where: { id: req.params.id }, include: { products: { select: { _count: { select: { sales: true, requests: true } } } } } });
    if (!brand) throw new HttpError(404, "Brand not found");
    if (brand.isOwn || brand.id === OWN_BRAND_ID) throw new HttpError(400, "The company's own brand cannot be deleted", "ownBrand");
    if (brand.products.some((product) => product._count.requests > 0 || product._count.sales > 0)) {
      throw new HttpError(409, "This brand has requests; merge it into another brand instead", "brandInUse");
    }
    await prisma.$transaction([prisma.product.deleteMany({ where: { brandId: brand.id } }), prisma.brand.delete({ where: { id: brand.id } })]);
    await writeAudit({ actor: staffActor(req.staff), action: "directory.delete", entityType: "Brand", entityId: brand.id, oldValue: { name: brand.name } });
    res.json({ ok: true });
  }),
);

// Moves every model, request and "I repair" entry of this brand to another brand and removes it.
directoryRouter.post(
  "/brands/:id/merge",
  adminOnly,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ intoId: z.string().min(1) }), req.body);
    if (body.intoId === req.params.id) throw new HttpError(400, "Choose a different brand", "mergeSame");
    const [from, into] = await Promise.all([prisma.brand.findUnique({ where: { id: req.params.id } }), prisma.brand.findUnique({ where: { id: body.intoId } })]);
    if (!from || !into) throw new HttpError(404, "Brand not found");
    if (from.isOwn) throw new HttpError(400, "The company's own brand cannot be merged away", "ownBrand");
    await prisma.$transaction(async (tx) => {
      await tx.product.updateMany({ where: { brandId: from.id }, data: { brandId: into.id } });
      const held = await tx.staffSkill.findMany({ where: { brandId: into.id }, select: { staffUserId: true } });
      const have = new Set(held.map((row) => row.staffUserId));
      const moving = await tx.staffSkill.findMany({ where: { brandId: from.id } });
      for (const row of moving) {
        if (have.has(row.staffUserId)) await tx.staffSkill.delete({ where: { id: row.id } });
        else await tx.staffSkill.update({ where: { id: row.id }, data: { brandId: into.id } });
      }
      await tx.brand.delete({ where: { id: from.id } });
    });
    await writeAudit({ actor: staffActor(req.staff), action: "directory.merge", entityType: "Brand", entityId: into.id, oldValue: { name: from.name }, newValue: { into: into.name } });
    res.json({ ok: true });
  }),
);

// ---- models -------------------------------------------------------------------------------------------------------------

directoryRouter.get(
  "/models",
  readAll,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const brandId = typeof req.query.brandId === "string" ? req.query.brandId : "";
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const pending = req.query.approved === "false";
    const products = await prisma.product.findMany({
      where: {
        ...(brandId ? { brandId } : {}),
        ...(category ? { category } : {}),
        ...(pending ? { OR: [{ approved: false }, { brand: { approved: false } }] } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
      take: 300,
      include: { brand: { select: { name: true, approved: true, isOwn: true } }, _count: { select: { sales: true, requests: true } } },
    });
    res.json({ models: products.map(serializeModel) });
  }),
);

directoryRouter.get(
  "/models/check",
  readAll,
  asyncHandler(async (req, res) => {
    const brandId = String(req.query.brandId ?? "");
    const category = String(req.query.category ?? "");
    const model = String(req.query.model ?? "");
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw new HttpError(404, "Brand not found");
    const found = await similarModels(brand.id, category, model, brand.name);
    res.json({ name: fullModelName(brand.name, model), exact: found.exact, similar: found.similar });
  }),
);

directoryRouter.post(
  "/models",
  canAdd,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ brandId: z.string().min(1), category: z.string().trim().min(1), model: z.string().trim().min(1).max(80), force: z.boolean().optional() }), req.body);
    const actor = actorOf(req);
    const { product, created } = await addModel({ ...body, actor });
    if (created) {
      if (actor.role === "technician") await prisma.staffSkill.create({ data: { staffUserId: actor.id, productId: product.id } });
      await writeAudit({ actor: staffActor(req.staff), action: "directory.model.add", entityType: "Product", entityId: product.id, newValue: { name: product.name, approved: product.approved } });
      if (!product.approved) await tellAdmins("model", product.name, actor.name);
    }
    const full = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { brand: { select: { name: true, approved: true, isOwn: true } } } });
    res.status(created ? 201 : 200).json({ model: serializeModel(full), created });
  }),
);

directoryRouter.patch(
  "/models/:id",
  adminOnly,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ model: z.string().trim().min(1).max(80).optional(), category: z.string().trim().min(1).optional() }), req.body);
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { brand: true } });
    if (!product) throw new HttpError(404, "Model not found");
    if (product.brand.isOwn) throw new HttpError(400, "RIZO products are edited in the catalogue", "ownBrandModel");
    if (body.category && !(await prisma.productCategory.findUnique({ where: { name: body.category } }))) throw new HttpError(400, "Choose an existing category", "unknownCategory");
    const name = body.model ? fullModelName(product.brand.name, body.model) : product.name;
    const updated = await prisma.product.update({ where: { id: product.id }, data: { name, nameUz: name, nameRu: name, nameEn: name, ...(body.category ? { category: body.category } : {}) }, include: { brand: { select: { name: true, approved: true, isOwn: true } } } });
    await writeAudit({ actor: staffActor(req.staff), action: "directory.model.update", entityType: "Product", entityId: product.id, oldValue: { name: product.name }, newValue: { name } });
    res.json({ model: serializeModel(updated) });
  }),
);

directoryRouter.post(
  "/models/:id/approve",
  adminOnly,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) throw new HttpError(404, "Model not found");
    await prisma.$transaction([prisma.product.update({ where: { id: product.id }, data: { approved: true } }), prisma.brand.update({ where: { id: product.brandId }, data: { approved: true } })]);
    await writeAudit({ actor: staffActor(req.staff), action: "directory.approve", entityType: "Product", entityId: product.id, newValue: { name: product.name } });
    res.json({ ok: true });
  }),
);

directoryRouter.delete(
  "/models/:id",
  adminOnly,
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { brand: true, _count: { select: { sales: true, requests: true } } } });
    if (!product) throw new HttpError(404, "Model not found");
    if (product.brand.isOwn) throw new HttpError(400, "RIZO products are edited in the catalogue", "ownBrandModel");
    if (product._count.requests > 0 || product._count.sales > 0) throw new HttpError(409, "This model has requests; merge it into another model instead", "modelInUse");
    await prisma.product.delete({ where: { id: product.id } });
    await writeAudit({ actor: staffActor(req.staff), action: "directory.delete", entityType: "Product", entityId: product.id, oldValue: { name: product.name } });
    res.json({ ok: true });
  }),
);

directoryRouter.post(
  "/models/:id/merge",
  adminOnly,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ intoId: z.string().min(1) }), req.body);
    if (body.intoId === req.params.id) throw new HttpError(400, "Choose a different model", "mergeSame");
    const [from, into] = await Promise.all([
      prisma.product.findUnique({ where: { id: req.params.id }, include: { brand: true } }),
      prisma.product.findUnique({ where: { id: body.intoId }, include: { brand: true } }),
    ]);
    if (!from || !into) throw new HttpError(404, "Model not found");
    if (from.brand.isOwn || into.brand.isOwn) throw new HttpError(400, "RIZO products are edited in the catalogue", "ownBrandModel");
    await prisma.$transaction(async (tx) => {
      await tx.sale.updateMany({ where: { productId: from.id }, data: { productId: into.id } });
      await tx.serviceRequest.updateMany({ where: { productId: from.id }, data: { productId: into.id } });
      await tx.replacementItem.updateMany({ where: { productId: from.id }, data: { productId: into.id } });
      const held = await tx.staffSkill.findMany({ where: { productId: into.id }, select: { staffUserId: true } });
      const have = new Set(held.map((row) => row.staffUserId));
      for (const row of await tx.staffSkill.findMany({ where: { productId: from.id } })) {
        if (have.has(row.staffUserId)) await tx.staffSkill.delete({ where: { id: row.id } });
        else await tx.staffSkill.update({ where: { id: row.id }, data: { productId: into.id } });
      }
      await tx.product.delete({ where: { id: from.id } });
    });
    await writeAudit({ actor: staffActor(req.staff), action: "directory.merge", entityType: "Product", entityId: into.id, oldValue: { name: from.name }, newValue: { into: into.name } });
    res.json({ ok: true });
  }),
);

// What is waiting for approval.
directoryRouter.get(
  "/pending",
  adminOnly,
  asyncHandler(async (_req, res) => {
    const [brands, models] = await Promise.all([
      prisma.brand.findMany({ where: { approved: false }, orderBy: { createdAt: "asc" } }),
      prisma.product.findMany({ where: { approved: false }, orderBy: { createdAt: "asc" }, include: { brand: { select: { name: true, approved: true, isOwn: true } } } }),
    ]);
    res.json({ brands: brands.map((brand) => serializeBrand(brand)), models: models.map((model) => serializeModel(model)) });
  }),
);

// ---- "I repair" --------------------------------------------------------------------------------------------------------

directoryRouter.get(
  "/skills",
  asyncHandler(async (req, res) => {
    const me = req.staff!;
    const staffId = typeof req.query.staffId === "string" && me.role === "admin" ? req.query.staffId : me.sub;
    if (me.role !== "admin" && me.role !== "technician") throw new HttpError(403, "Not allowed");
    res.json(await listSkills(staffId));
  }),
);

directoryRouter.put(
  "/skills",
  asyncHandler(async (req, res) => {
    const me = req.staff!;
    const body = parseBody(z.object({ staffId: z.string().optional(), brandIds: z.array(z.string()).max(100), productIds: z.array(z.string()).max(300) }), req.body);
    if (me.role !== "admin" && me.role !== "technician") throw new HttpError(403, "Not allowed");
    const staffId = me.role === "admin" && body.staffId ? body.staffId : me.sub;
    const staff = await prisma.staffUser.findUnique({ where: { id: staffId } });
    if (!staff || staff.role !== "technician") throw new HttpError(400, "Technician not found");
    const brands = await prisma.brand.findMany({ where: { id: { in: body.brandIds }, isOwn: false }, select: { id: true } });
    const models = await prisma.product.findMany({ where: { id: { in: body.productIds }, brand: { isOwn: false } }, select: { id: true } });
    await prisma.$transaction([
      prisma.staffSkill.deleteMany({ where: { staffUserId: staffId } }),
      prisma.staffSkill.createMany({ data: [...brands.map((brand) => ({ staffUserId: staffId, brandId: brand.id })), ...models.map((model) => ({ staffUserId: staffId, productId: model.id }))] }),
    ]);
    await writeAudit({ actor: staffActor(req.staff), action: "directory.skills", entityType: "StaffUser", entityId: staffId, newValue: { brands: brands.length, models: models.length } });
    res.json(await listSkills(staffId));
  }),
);
