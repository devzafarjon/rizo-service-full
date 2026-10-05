import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { assertPhone, normalizePhone } from "../lib/phone.js";
import { parseBody } from "../lib/parse.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { forgetStaffActiveCache, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

// Admins manage the people who use the system, so no one needs database access to add a technician or reset a password.
export const staffAdminRouter = Router();
staffAdminRouter.use(staffAuth, requireStaffRole("admin"));

const passwordRule = z.string().min(8, "Password must be at least 8 characters").max(100);

const baseFields = {
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: z.string().min(1, "Phone is required"),
  role: z.enum(["admin", "technician", "receptionist"]),
  technicianType: z.enum(["service_center", "mobile"]).nullable().optional(),
  serviceCenterId: z.string().min(1).nullable().optional(),
  payPercent: z.coerce.number().min(0).max(100).optional(),
  payFixedPerJob: z.coerce.number().min(0).optional(),
};

function serialize(user: {
  id: string;
  name: string;
  phone: string;
  role: string;
  technicianType: string | null;
  isActive: boolean;
  isAvailable: boolean;
  serviceCenterId: string | null;
  payPercent: { toString(): string };
  payFixedPerJob: { toString(): string };
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    technicianType: user.technicianType,
    isActive: user.isActive,
    isAvailable: user.isAvailable,
    serviceCenterId: user.serviceCenterId,
    payPercent: Number(user.payPercent),
    payFixedPerJob: Number(user.payFixedPerJob),
    createdAt: user.createdAt.toISOString(),
  };
}

staffAdminRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.staffUser.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
    res.json({ staff: users.map(serialize) });
  }),
);

staffAdminRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ ...baseFields, password: passwordRule }), req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);
    if (body.role === "technician" && !body.technicianType) {
      throw new HttpError(400, "Choose the technician type", "technicianTypeRequired");
    }
    try {
      const user = await prisma.staffUser.create({
        data: {
          name: body.name,
          phone,
          passwordHash: await hashPassword(body.password),
          role: body.role,
          technicianType: body.role === "technician" ? body.technicianType : null,
          serviceCenterId: body.serviceCenterId ?? null,
          payPercent: body.payPercent ?? 0,
          payFixedPerJob: body.payFixedPerJob ?? 0,
        },
      });
      await writeAudit({ actor: staffActor(req.staff), action: "staff.create", entityType: "StaffUser", entityId: user.id, newValue: { role: user.role, phone: user.phone } });
      res.status(201).json({ user: serialize(user) });
    } catch (error) {
      handlePrismaError(error, { phone: "An account with this phone number already exists" });
    }
  }),
);

staffAdminRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ ...baseFields, isActive: z.boolean().optional() }).partial(), req.body);
    const existing = await prisma.staffUser.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Technician not found");
    if (existing.id === req.staff!.sub && (body.isActive === false || (body.role && body.role !== "admin"))) {
      throw new HttpError(400, "You cannot deactivate or demote your own account", "cannotDeactivateSelf");
    }
    const phone = body.phone ? normalizePhone(body.phone) : undefined;
    if (phone) assertPhone(phone);
    const nextRole = body.role ?? existing.role;
    try {
      const user = await prisma.staffUser.update({
        where: { id: existing.id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(phone ? { phone } : {}),
          ...(body.role ? { role: body.role } : {}),
          technicianType: nextRole === "technician" ? (body.technicianType === undefined ? existing.technicianType : body.technicianType) : null,
          ...(body.serviceCenterId !== undefined ? { serviceCenterId: body.serviceCenterId } : {}),
          ...(body.payPercent !== undefined ? { payPercent: body.payPercent } : {}),
          ...(body.payFixedPerJob !== undefined ? { payFixedPerJob: body.payFixedPerJob } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
      forgetStaffActiveCache(user.id);
      await writeAudit({
        actor: staffActor(req.staff),
        action: body.role && body.role !== existing.role ? "staff.role" : "staff.update",
        entityType: "StaffUser",
        entityId: user.id,
        oldValue: { role: existing.role, isActive: existing.isActive },
        newValue: { role: user.role, isActive: user.isActive },
      });
      res.json({ user: serialize(user) });
    } catch (error) {
      handlePrismaError(error, { phone: "An account with this phone number already exists" });
    }
  }),
);

staffAdminRouter.post(
  "/:id/password",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ password: passwordRule }), req.body);
    const existing = await prisma.staffUser.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Technician not found");
    await prisma.staffUser.update({ where: { id: existing.id }, data: { passwordHash: await hashPassword(body.password) } });
    await writeAudit({ actor: staffActor(req.staff), action: "staff.password", entityType: "StaffUser", entityId: existing.id });
    res.json({ ok: true });
  }),
);
