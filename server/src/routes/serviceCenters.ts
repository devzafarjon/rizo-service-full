import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { officeReadAdminWrite, staffAuth } from "../middleware/staffAuth.js";

export const serviceCentersRouter = Router();
serviceCentersRouter.use(staffAuth, officeReadAdminWrite);

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  regionCode: z.string().regex(/^\d{2}$/, "Select a region").default("00"),
  address: z.string().trim().min(1, "Address is required").max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  workingHours: z.string().trim().max(100).optional().nullable(),
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  isAuthorized: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

serviceCentersRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const centers = await prisma.serviceCenter.findMany({ orderBy: [{ regionCode: "asc" }, { name: "asc" }], include: { _count: { select: { staff: true, requests: true } } } });
    res.json({ centers: centers.map((center) => ({ ...center, createdAt: center.createdAt.toISOString(), staffCount: center._count.staff, requestsCount: center._count.requests })) });
  }),
);

serviceCentersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(schema, req.body);
    const center = await prisma.serviceCenter.create({ data: { ...body, isAuthorized: body.isAuthorized ?? true, isActive: body.isActive ?? true } });
    res.status(201).json({ center });
  }),
);

serviceCentersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(schema.partial(), req.body);
    const existing = await prisma.serviceCenter.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Service center not found");
    const center = await prisma.serviceCenter.update({ where: { id: existing.id }, data: body });
    res.json({ center });
  }),
);
