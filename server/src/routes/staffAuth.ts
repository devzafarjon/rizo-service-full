import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import { signToken } from "../lib/jwt.js";
import { isAppLocale, parseLocale } from "../lib/locale.js";
import { assertPhone, normalizePhone } from "../lib/phone.js";
import { verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { emitToStaff } from "../lib/realtime.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

const loginSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(1, "Password is required"),
});

export const staffAuthRouter = Router();

staffAuthRouter.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);

    const user = await prisma.staffUser.findUnique({ where: { phone } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Incorrect phone number or password");
    }

    const token = signToken({
      sub: user.id,
      scope: "staff",
      role: user.role,
      name: user.name,
      phone: user.phone,
    });

    res.json({ token, user: serializeStaff(user) });
  } catch (error) {
    next(error instanceof z.ZodError ? new HttpError(400, error.issues[0]?.message ?? "Invalid input") : error);
  }
});

staffAuthRouter.get("/me", staffAuth, async (req, res, next) => {
  try {
    const user = await prisma.staffUser.findUnique({ where: { id: req.staff!.sub } });
    if (!user) {
      throw new HttpError(401, "Account no longer exists");
    }
    res.json({ user: serializeStaff(user) });
  } catch (error) {
    next(error);
  }
});

staffAuthRouter.patch("/locale", staffAuth, async (req, res, next) => {
  try {
    const locale = req.body?.locale;
    if (!isAppLocale(locale)) {
      throw new HttpError(400, "Invalid input", "invalidInput");
    }
    const user = await prisma.staffUser.update({
      where: { id: req.staff!.sub },
      data: { locale },
    });
    res.json({ user: serializeStaff(user) });
  } catch (error) {
    next(error);
  }
});

staffAuthRouter.patch("/availability", staffAuth, requireStaffRole("technician"), async (req, res, next) => {
  try {
    const isAvailable = z.boolean().parse(req.body?.isAvailable);
    const user = await prisma.staffUser.update({
      where: { id: req.staff!.sub },
      data: { isAvailable },
    });
    const serialized = serializeStaff(user);
    emitToStaff("technician:updated", serialized);
    res.json({ user: serialized });
  } catch (error) {
    next(error instanceof z.ZodError ? new HttpError(400, "isAvailable must be true or false") : error);
  }
});

function serializeStaff(user: {
  id: string;
  name: string;
  phone: string;
  role: "admin" | "technician";
  technicianType: "service_center" | "mobile" | null;
  isAvailable: boolean;
  locale: string;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    technicianType: user.technicianType,
    isAvailable: user.isAvailable,
    locale: parseLocale(user.locale),
  };
}
