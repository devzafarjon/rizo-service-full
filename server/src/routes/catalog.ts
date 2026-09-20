import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { namedFromInput, namedSearch, serializeNamed } from "../lib/named.js";
import { money } from "../lib/warranty.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { maybeAlertLowStock } from "../lib/stockAlerts.js";

const namedFields = z.object({
  name: z.string().trim().optional(),
  nameUz: z.string().trim().optional(),
  nameRu: z.string().trim().optional(),
  nameEn: z.string().trim().optional(),
});

const serviceSchema = namedFields.extend({
  price: z.coerce.number().nonnegative("Price cannot be negative"),
  productCategory: z.string().trim().min(1, "Product category is required"),
}).superRefine((data, ctx) => {
  if (!(data.name || data.nameUz || data.nameRu || data.nameEn)) {
    ctx.addIssue({ code: "custom", message: "Name is required", path: ["name"] });
  }
});

const partSchema = namedFields.extend({
  price: z.coerce.number().nonnegative("Price cannot be negative"),
  productCategory: z.string().trim().min(1, "Product category is required"),
  stockQuantity: z.coerce.number().int().min(0, "Stock cannot be negative"),
  lowStockThreshold: z.coerce.number().int().min(0, "Threshold cannot be negative").optional(),
}).superRefine((data, ctx) => {
  if (!(data.name || data.nameUz || data.nameRu || data.nameEn)) {
    ctx.addIssue({ code: "custom", message: "Name is required", path: ["name"] });
  }
});

const servicePatchSchema = namedFields.extend({
  price: z.coerce.number().nonnegative("Price cannot be negative").optional(),
  productCategory: z.string().trim().min(1, "Product category is required").optional(),
});

const partPatchSchema = servicePatchSchema.extend({
  stockQuantity: z.coerce.number().int().min(0, "Stock cannot be negative").optional(),
  lowStockThreshold: z.coerce.number().int().min(0, "Threshold cannot be negative").optional(),
});

export const catalogRouter = Router();
catalogRouter.use(staffAuth, requireStaffRole("admin"));

catalogRouter.get(
  "/categories",
  asyncHandler(async (_req, res) => {
    const [products, services, parts] = await Promise.all([
      prisma.product.findMany({ select: { category: true }, distinct: ["category"] }),
      prisma.serviceCatalogItem.findMany({ select: { productCategory: true }, distinct: ["productCategory"] }),
      prisma.sparePart.findMany({ select: { productCategory: true }, distinct: ["productCategory"] }),
    ]);
    const categories = [
      ...new Set([
        ...products.map((item) => item.category),
        ...services.map((item) => item.productCategory),
        ...parts.map((item) => item.productCategory),
      ]),
    ].sort((a, b) => a.localeCompare(b));
    res.json({ categories });
  }),
);

catalogRouter.get(
  "/services",
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const items = await prisma.serviceCatalogItem.findMany({
      where: {
        AND: [
          category ? { productCategory: category } : {},
          q ? namedSearch(q) : {},
        ],
      },
      orderBy: [{ productCategory: "asc" }, { name: "asc" }],
      include: { _count: { select: { requestLines: true } } },
    });
    res.json({ services: items.map(serializeService) });
  }),
);

catalogRouter.post(
  "/services",
  asyncHandler(async (req, res) => {
    const body = parseBody(serviceSchema, req.body);
    const item = await prisma.serviceCatalogItem.create({
      data: { ...namedFromInput(body), price: body.price, productCategory: body.productCategory },
      include: { _count: { select: { requestLines: true } } },
    });
    res.status(201).json({ service: serializeService(item) });
  }),
);

catalogRouter.patch(
  "/services/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(servicePatchSchema, req.body);
    try {
      const item = await prisma.serviceCatalogItem.update({
        where: { id: req.params.id },
        data: {
          ...(body.name !== undefined || body.nameUz !== undefined || body.nameRu !== undefined || body.nameEn !== undefined
            ? namedFromInput(body)
            : {}),
          ...(body.price !== undefined ? { price: body.price } : {}),
          ...(body.productCategory !== undefined ? { productCategory: body.productCategory } : {}),
        },
        include: { _count: { select: { requestLines: true } } },
      });
      res.json({ service: serializeService(item) });
    } catch (error) {
      handlePrismaError(error);
    }
  }),
);

catalogRouter.delete(
  "/services/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.serviceCatalogItem.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { requestLines: true } } },
    });
    if (!item) {
      throw new HttpError(404, "Service not found");
    }
    if (item._count.requestLines > 0) {
      throw new HttpError(409, "This service is used on existing jobs and cannot be deleted");
    }
    await prisma.serviceCatalogItem.delete({ where: { id: item.id } });
    res.json({ ok: true });
  }),
);

catalogRouter.get(
  "/parts",
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const items = await prisma.sparePart.findMany({
      where: {
        AND: [
          category ? { productCategory: category } : {},
          q ? namedSearch(q) : {},
        ],
      },
      orderBy: [{ productCategory: "asc" }, { name: "asc" }],
      include: { _count: { select: { requestLines: true } } },
    });
    res.json({ parts: items.map(serializePart) });
  }),
);

catalogRouter.post(
  "/parts",
  asyncHandler(async (req, res) => {
    const body = parseBody(partSchema, req.body);
    const item = await prisma.sparePart.create({
      data: {
        ...namedFromInput(body),
        price: body.price,
        productCategory: body.productCategory,
        stockQuantity: body.stockQuantity,
        lowStockThreshold: body.lowStockThreshold ?? 3,
      },
      include: { _count: { select: { requestLines: true } } },
    });
    res.status(201).json({ part: serializePart(item) });
  }),
);

catalogRouter.patch(
  "/parts/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(partPatchSchema, req.body);
    try {
      const item = await prisma.sparePart.update({
        where: { id: req.params.id },
        data: {
          ...(body.name !== undefined || body.nameUz !== undefined || body.nameRu !== undefined || body.nameEn !== undefined
            ? namedFromInput(body)
            : {}),
          ...(body.price !== undefined ? { price: body.price } : {}),
          ...(body.productCategory !== undefined ? { productCategory: body.productCategory } : {}),
          ...(body.stockQuantity !== undefined ? { stockQuantity: body.stockQuantity } : {}),
          ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold } : {}),
        },
        include: { _count: { select: { requestLines: true } } },
      });
      await maybeAlertLowStock(item.id);
      res.json({ part: serializePart(item) });
    } catch (error) {
      handlePrismaError(error);
    }
  }),
);

catalogRouter.delete(
  "/parts/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.sparePart.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { requestLines: true } } },
    });
    if (!item) {
      throw new HttpError(404, "Spare part not found");
    }
    if (item._count.requestLines > 0) {
      throw new HttpError(409, "This part is used on existing jobs and cannot be deleted");
    }
    await prisma.sparePart.delete({ where: { id: item.id } });
    res.json({ ok: true });
  }),
);

function serializeService(item: {
  id: string;
  name: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  price: { toString(): string };
  productCategory: string;
  createdAt: Date;
  _count: { requestLines: number };
}) {
  return {
    id: item.id,
    ...serializeNamed(item),
    price: money(item.price),
    productCategory: item.productCategory,
    createdAt: item.createdAt.toISOString(),
    usedCount: item._count.requestLines,
  };
}

function serializePart(item: {
  id: string;
  name: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  price: { toString(): string };
  productCategory: string;
  stockQuantity: number;
  lowStockThreshold: number;
  createdAt: Date;
  _count: { requestLines: number };
}) {
  return {
    id: item.id,
    ...serializeNamed(item),
    price: money(item.price),
    productCategory: item.productCategory,
    stockQuantity: item.stockQuantity,
    lowStockThreshold: item.lowStockThreshold,
    lowStock: item.stockQuantity <= item.lowStockThreshold,
    createdAt: item.createdAt.toISOString(),
    usedCount: item._count.requestLines,
  };
}
