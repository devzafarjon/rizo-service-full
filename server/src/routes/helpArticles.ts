import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { serializeArticle } from "../lib/helpArticles.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { readWriteRoles, staffAuth } from "../middleware/staffAuth.js";

// Self-help guides customers can read before booking a visit. Admins write them.
export const helpArticlesRouter = Router();
helpArticlesRouter.use(staffAuth, readWriteRoles(["admin", "receptionist"], ["admin"]));

const videoUrl = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === "" || /^https:\/\//.test(value), "Use a link that starts with https://")
  .optional()
  .nullable();

const bodySchema = z
  .object({
    productCategory: z.string().trim().min(1).max(60).nullable().optional(),
    productId: z.string().trim().min(1).nullable().optional(),
    titleUz: z.string().trim().max(160).default(""),
    titleRu: z.string().trim().max(160).default(""),
    titleEn: z.string().trim().max(160).default(""),
    bodyUz: z.string().trim().max(6000).default(""),
    bodyRu: z.string().trim().max(6000).default(""),
    bodyEn: z.string().trim().max(6000).default(""),
    videoUrl,
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    isPublished: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (!(data.titleUz || data.titleRu || data.titleEn)) ctx.addIssue({ code: "custom", message: "Name is required", path: ["titleUz"] });
  });

helpArticlesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.helpArticle.findMany({ orderBy: [{ productCategory: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }] });
    res.json({ articles: rows.map(serializeArticle) });
  }),
);

helpArticlesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(bodySchema, req.body);
    const row = await prisma.helpArticle.create({ data: { ...body, videoUrl: body.videoUrl || null, productCategory: body.productCategory ?? null, productId: body.productId ?? null } });
    await writeAudit({ actor: staffActor(req.staff), action: "help.create", entityType: "HelpArticle", entityId: row.id });
    res.status(201).json({ article: serializeArticle(row) });
  }),
);

helpArticlesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(bodySchema.innerType().partial(), req.body);
    const existing = await prisma.helpArticle.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Record not found");
    const row = await prisma.helpArticle.update({ where: { id: existing.id }, data: { ...body, ...(body.videoUrl !== undefined ? { videoUrl: body.videoUrl || null } : {}) } });
    await writeAudit({ actor: staffActor(req.staff), action: "help.update", entityType: "HelpArticle", entityId: row.id });
    res.json({ article: serializeArticle(row) });
  }),
);

helpArticlesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.helpArticle.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Record not found");
    await prisma.helpArticle.delete({ where: { id: existing.id } });
    await writeAudit({ actor: staffActor(req.staff), action: "help.delete", entityType: "HelpArticle", entityId: existing.id });
    res.json({ ok: true });
  }),
);
