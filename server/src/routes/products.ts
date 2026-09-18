import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { namedFromInput, namedSearch, serializeNamed } from "../lib/named.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

const productSchema = z.object({
  name: z.string().trim().optional(),
  nameUz: z.string().trim().optional(),
  nameRu: z.string().trim().optional(),
  nameEn: z.string().trim().optional(),
  sku: z.string().trim().min(1, "SKU is required"),
  category: z.string().trim().min(1, "Category is required"),
}).superRefine((data, ctx) => {
  if (!(data.name || data.nameUz || data.nameRu || data.nameEn)) {
    ctx.addIssue({ code: "custom", message: "Name is required", path: ["name"] });
  }
});

const productPatchSchema = z.object({
  name: z.string().trim().optional(),
  nameUz: z.string().trim().optional(),
  nameRu: z.string().trim().optional(),
  nameEn: z.string().trim().optional(),
  sku: z.string().trim().min(1, "SKU is required").optional(),
  category: z.string().trim().min(1, "Category is required").optional(),
});

export const productsRouter = Router();
productsRouter.use(staffAuth, requireStaffRole("admin"));

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    const products = await prisma.product.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  ...namedSearch(q).OR,
                  { sku: { contains: q, mode: "insensitive" as const } },
                ],
              }
            : {},
          category ? { category } : {},
        ],
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { _count: { select: { sales: true, requests: true } } },
    });
    res.json({ products: products.map(serializeProduct) });
  }),
);

productsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(productSchema, req.body);
    try {
      const product = await prisma.product.create({
        data: { ...namedFromInput(body), sku: body.sku.toUpperCase(), category: body.category },
        include: { _count: { select: { sales: true, requests: true } } },
      });
      res.status(201).json({ product: serializeProduct(product) });
    } catch (error) {
      handlePrismaError(error, { sku: "A product with this SKU already exists" });
    }
  }),
);

productsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(productPatchSchema, req.body);
    try {
      const product = await prisma.product.update({
        where: { id: req.params.id },
        data: {
          ...(body.name !== undefined || body.nameUz !== undefined || body.nameRu !== undefined || body.nameEn !== undefined
            ? namedFromInput(body)
            : {}),
          ...(body.sku !== undefined ? { sku: body.sku.toUpperCase() } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
        },
        include: { _count: { select: { sales: true, requests: true } } },
      });
      res.json({ product: serializeProduct(product) });
    } catch (error) {
      handlePrismaError(error, { sku: "A product with this SKU already exists" });
    }
  }),
);

productsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { sales: true, requests: true } } },
    });
    if (!product) {
      throw new HttpError(404, "Product not found");
    }
    if (product._count.sales > 0 || product._count.requests > 0) {
      throw new HttpError(409, "This product is used on sales or service requests and cannot be deleted");
    }
    await prisma.product.delete({ where: { id: product.id } });
    res.json({ ok: true });
  }),
);

function serializeProduct(product: {
  id: string;
  name: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  sku: string;
  category: string;
  createdAt: Date;
  _count: { sales: number; requests: number };
}) {
  return {
    id: product.id,
    ...serializeNamed(product),
    sku: product.sku,
    category: product.category,
    createdAt: product.createdAt.toISOString(),
    salesCount: product._count.sales,
    requestsCount: product._count.requests,
  };
}
