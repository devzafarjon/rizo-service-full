import { Router } from "express";
import type { StaffRoleName } from "../lib/roles.js";
import { z } from "zod";
import { HttpError } from "../lib/httpError.js";
import { signToken } from "../lib/jwt.js";
import { isAppLocale, parseLocale } from "../lib/locale.js";
import { assertPhone, normalizePhone } from "../lib/phone.js";
import { verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { emitToStaff } from "../lib/realtime.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import QRCode from "qrcode";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "../lib/totp.js";
import { loginLimiter } from "../middleware/rateLimit.js";

const loginSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(1, "Password is required"),
  /** Six-digit code from the authenticator app, when two-step sign-in is on. */
  code: z.string().trim().max(12).optional(),
});

export const staffAuthRouter = Router();

staffAuthRouter.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);

    const user = await prisma.staffUser.findUnique({ where: { phone } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Incorrect phone number or password");
    }
    if (!user.isActive) {
      throw new HttpError(403, "This account has been deactivated", "accountInactive");
    }
    if (user.totpEnabled && user.totpSecret) {
      if (!body.code) throw new HttpError(401, "Enter the code from your authenticator app", "totpRequired");
      if (!verifyTotp(user.totpSecret, body.code)) throw new HttpError(401, "That code is not correct", "totpInvalid");
    }

    res.locals.rateLimitReset?.();
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
    if (!user || !user.isActive) {
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
  role: StaffRoleName;
  technicianType: "service_center" | "mobile" | null;
  isAvailable: boolean;
  locale: string;
  totpEnabled?: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    technicianType: user.technicianType,
    isAvailable: user.isAvailable,
    locale: parseLocale(user.locale),
    totpEnabled: Boolean(user.totpEnabled),
  };
}

// Two-step sign-in: scan the QR code with an authenticator app, then confirm with a code.
staffAuthRouter.post("/2fa/setup", staffAuth, async (req, res, next) => {
  try {
    const user = await prisma.staffUser.findUnique({ where: { id: req.staff!.sub } });
    if (!user) throw new HttpError(401, "Account no longer exists");
    if (user.totpEnabled) throw new HttpError(409, "Two-step sign-in is already on", "totpAlreadyOn");
    const secret = generateTotpSecret();
    await prisma.staffUser.update({ where: { id: user.id }, data: { totpSecret: secret, totpEnabled: false } });
    const url = otpauthUrl(user.phone, secret);
    res.json({ secret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) });
  } catch (error) {
    next(error);
  }
});

staffAuthRouter.post("/2fa/enable", staffAuth, async (req, res, next) => {
  try {
    const body = z.object({ code: z.string().trim().min(6).max(12) }).parse(req.body);
    const user = await prisma.staffUser.findUnique({ where: { id: req.staff!.sub } });
    if (!user?.totpSecret) throw new HttpError(400, "Start the setup first", "totpNotStarted");
    if (!verifyTotp(user.totpSecret, body.code)) throw new HttpError(401, "That code is not correct", "totpInvalid");
    const updated = await prisma.staffUser.update({ where: { id: user.id }, data: { totpEnabled: true } });
    res.json({ user: serializeStaff(updated) });
  } catch (error) {
    next(error instanceof z.ZodError ? new HttpError(400, "Invalid input", "invalidInput") : error);
  }
});

staffAuthRouter.post("/2fa/disable", staffAuth, async (req, res, next) => {
  try {
    const body = z.object({ password: z.string().min(1), code: z.string().trim().min(6).max(12) }).parse(req.body);
    const user = await prisma.staffUser.findUnique({ where: { id: req.staff!.sub } });
    if (!user) throw new HttpError(401, "Account no longer exists");
    if (!(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(401, "Incorrect phone number or password");
    if (user.totpEnabled && user.totpSecret && !verifyTotp(user.totpSecret, body.code)) throw new HttpError(401, "That code is not correct", "totpInvalid");
    const updated = await prisma.staffUser.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
    res.json({ user: serializeStaff(updated) });
  } catch (error) {
    next(error instanceof z.ZodError ? new HttpError(400, "Invalid input", "invalidInput") : error);
  }
});
