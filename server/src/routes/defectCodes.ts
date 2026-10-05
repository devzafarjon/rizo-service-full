import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { namedFromInput, serializeNamed } from "../lib/named.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { officeReadAdminWrite, staffAuth } from "../middleware/staffAuth.js";

export const defectCodesRouter = Router();
defectCodesRouter.use(staffAuth, officeReadAdminWrite);

const schema = z
  .object({
    kind: z.enum(["defect", "return_reason"]).default("defect"),
    code: z.string().trim().min(1, "Enter a code").max(20),
    name: z.string().trim().optional(),
    nameUz: z.string().trim().optional(),
    nameRu: z.string().trim().optional(),
    nameEn: z.string().trim().optional(),
    productCategory: z.string().trim().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!(data.name || data.nameUz || data.nameRu || data.nameEn)) ctx.addIssue({ code: "custom", message: "Name is required", path: ["name"] });
  });

const patchSchema = z.object({
  code: z.string().trim().min(1).max(20).optional(),
  name: z.string().trim().optional(),
  nameUz: z.string().trim().optional(),
  nameRu: z.string().trim().optional(),
  nameEn: z.string().trim().optional(),
  productCategory: z.string().trim().min(1).optional().nullable(),
  isActive: z.boolean().optional(),
});

function serialize(row: { id: string; kind: string; code: string; name: string; nameUz: string; nameRu: string; nameEn: string; productCategory: string | null; isActive: boolean }) {
  return { id: row.id, kind: row.kind, code: row.code, ...serializeNamed(row), productCategory: row.productCategory, isActive: row.isActive };
}

defectCodesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const kind = req.query.kind === "return_reason" ? "return_reason" : req.query.kind === "defect" ? "defect" : undefined;
    const rows = await prisma.defectCode.findMany({ where: kind ? { kind } : {}, orderBy: [{ kind: "asc" }, { code: "asc" }] });
    res.json({ codes: rows.map(serialize) });
  }),
);

defectCodesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(schema, req.body);
    try {
      const row = await prisma.defectCode.create({
        data: { kind: body.kind, code: body.code.toUpperCase(), ...namedFromInput(body), productCategory: body.productCategory ?? null, isActive: body.isActive ?? true },
      });
      res.status(201).json({ code: serialize(row) });
    } catch (error) {
      handlePrismaError(error, { kind_code: "This code already exists" });
    }
  }),
);

defectCodesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(patchSchema, req.body);
    const existing = await prisma.defectCode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Defect code not found");
    const named = body.name || body.nameUz || body.nameRu || body.nameEn ? namedFromInput(body) : {};
    try {
      const row = await prisma.defectCode.update({
        where: { id: existing.id },
        data: {
          ...named,
          ...(body.code ? { code: body.code.toUpperCase() } : {}),
          ...(body.productCategory !== undefined ? { productCategory: body.productCategory } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
      res.json({ code: serialize(row) });
    } catch (error) {
      handlePrismaError(error, { kind_code: "This code already exists" });
    }
  }),
);
