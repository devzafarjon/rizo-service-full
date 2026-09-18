import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { signToken } from "../lib/jwt.js";
import { parseBody } from "../lib/parse.js";
import { assertPhone, normalizePhone } from "../lib/phone.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { handlePrismaError } from "../lib/prismaErrors.js";
import { resolveRegionCode } from "../lib/regions.js";
import { isAppLocale, parseLocale } from "../lib/locale.js";
import { optionalText } from "../lib/zodFields.js";
import { customerAuth } from "../middleware/customerAuth.js";

const loginSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  address: optionalText,
  locale: z.enum(["uz", "ru", "en"]).optional(),
});

const forgotSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
});

export const customerAuthRouter = Router();

customerAuthRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);

    const user = await prisma.customer.findUnique({ where: { phone } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Incorrect phone number or password");
    }

    const token = signToken({
      sub: user.id,
      scope: "customer",
      name: user.name,
      phone: user.phone,
    });

    res.json({ token, user: serializeCustomer(user) });
  }),
);

customerAuthRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);
    try {
      const user = await prisma.customer.create({
        data: {
          name: body.name,
          phone,
          passwordHash: await hashPassword(body.password),
          address: body.address ?? null,
          regionCode: resolveRegionCode(body.address),
          locale: parseLocale(body.locale),
        },
      });
      const token = signToken({
        sub: user.id,
        scope: "customer",
        name: user.name,
        phone: user.phone,
      });
      res.status(201).json({ token, user: serializeCustomer(user) });
    } catch (error) {
      handlePrismaError(error, { phone: "An account with this phone number already exists" });
    }
  }),
);

customerAuthRouter.post(
  "/forgot",
  asyncHandler(async (req, res) => {
    const body = parseBody(forgotSchema, req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);
    const user = await prisma.customer.findUnique({ where: { phone } });
    if (!user) {
      throw new HttpError(404, "No portal account for this number. Create one instead.");
    }
    const temporaryPassword = `Rizo-${crypto.randomBytes(3).toString("hex")}`;
    await prisma.customer.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(temporaryPassword) },
    });
    res.json({
      temporaryPassword,
      message: "A new password was created. Save it now — it will not be shown again.",
    });
  }),
);

customerAuthRouter.get(
  "/me",
  customerAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.customer.findUnique({ where: { id: req.customer!.sub } });
    if (!user) {
      throw new HttpError(401, "Account no longer exists");
    }
    res.json({ user: serializeCustomer(user) });
  }),
);

customerAuthRouter.patch(
  "/locale",
  customerAuth,
  asyncHandler(async (req, res) => {
    const locale = req.body?.locale;
    if (!isAppLocale(locale)) {
      throw new HttpError(400, "Invalid input", "invalidInput");
    }
    const user = await prisma.customer.update({
      where: { id: req.customer!.sub },
      data: { locale },
    });
    res.json({ user: serializeCustomer(user) });
  }),
);

function serializeCustomer(user: {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  locale: string;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    address: user.address,
    locale: parseLocale(user.locale),
  };
}
