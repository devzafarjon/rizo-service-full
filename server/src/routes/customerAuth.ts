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
import { loginLimiter, registerLimiter, resetLimiter } from "../middleware/rateLimit.js";
import { sendSms } from "../lib/notifyDispatch.js";
import { notifyAdmins } from "../lib/notifyStaff.js";

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
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(loginSchema, req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);

    const user = await prisma.customer.findUnique({ where: { phone } });
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "Incorrect phone number or password");
    }

    res.locals.rateLimitReset?.();
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
  registerLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);
    const existing = await prisma.customer.findUnique({ where: { phone } });
    if (existing) {
      throw new HttpError(409, "An account with this phone number already exists", "phoneExists", {
        name: existing.name,
        phone: existing.phone,
      });
    }
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
  resetLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(forgotSchema, req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);
    const user = await prisma.customer.findUnique({ where: { phone } });
    if (user) {
      const temporaryPassword = `Rizo-${crypto.randomBytes(3).toString("hex")}`;
      await prisma.customer.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(temporaryPassword) },
      });
      // The new password only ever travels by SMS; it is never returned to the caller or stored in the outbound log.
      await sendSms(user.phone, `RIZO Service: your new password is ${temporaryPassword}`).catch((error) => {
        console.error("[forgot] SMS failed", error instanceof Error ? error.message : error);
      });
    }
    // Same answer whether or not the number has an account, so phone numbers cannot be probed.
    res.json({ sent: true });
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

// Where status messages go: sms, telegram (when the chat is linked) or both.
customerAuthRouter.patch(
  "/preferences",
  customerAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ preferredChannel: z.enum(["sms", "telegram", "both"]) }), req.body);
    const user = await prisma.customer.update({ where: { id: req.customer!.sub }, data: { preferredChannel: body.preferredChannel } });
    res.json({ user: serializeCustomer(user) });
  }),
);

// Everything we hold about the customer, as a file they can keep.
customerAuthRouter.get(
  "/me/export",
  customerAuth,
  asyncHandler(async (req, res) => {
    const id = req.customer!.sub;
    const [customer, sales, requests, feedback, notifications] = await Promise.all([
      prisma.customer.findUnique({ where: { id }, select: { id: true, name: true, phone: true, address: true, regionCode: true, locale: true, preferredChannel: true, createdAt: true } }),
      prisma.sale.findMany({ where: { customerId: id }, include: { product: { select: { name: true, sku: true } } } }),
      prisma.serviceRequest.findMany({
        where: { customerId: id },
        include: { product: { select: { name: true, sku: true } }, payments: { select: { kind: true, method: true, amount: true, createdAt: true } }, notes: { where: { isVisibleToCustomer: true }, select: { noteText: true, authorScope: true, createdAt: true } } },
      }),
      prisma.feedback.findMany({ where: { customerId: id } }),
      prisma.notification.findMany({ where: { customerId: id }, select: { message: true, createdAt: true } }),
    ]);
    res.setHeader("Content-Disposition", 'attachment; filename="rizo-my-data.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      customer,
      purchases: sales.map((sale) => ({ invoiceNumber: sale.invoiceNumber, product: sale.product, saleDate: sale.saleDate, serialNumber: sale.serialNumber, warrantyExpiry: sale.warrantyExpiry, pricePaid: Number(sale.pricePaid) })),
      requests: requests.map((request) => ({
        number: request.displayId,
        type: request.type,
        status: request.status,
        product: request.product,
        issue: request.issueDescription,
        createdAt: request.createdAt,
        finalCost: request.finalCost == null ? null : Number(request.finalCost),
        payments: request.payments.map((row) => ({ ...row, amount: Number(row.amount) })),
        messages: request.notes,
      })),
      feedback,
      notifications,
    });
  }),
);

// The customer asks us to erase their personal data; the office anonymizes the account (requests stay for the accounts).
customerAuthRouter.post(
  "/me/delete-request",
  customerAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.customer.findUnique({ where: { id: req.customer!.sub } });
    if (!user) throw new HttpError(401, "Account no longer exists");
    if (!user.deletionRequestedAt) {
      await prisma.customer.update({ where: { id: user.id }, data: { deletionRequestedAt: new Date() } });
      await notifyAdmins({ message: `${user.name} asked to delete their account`, code: "deletionRequest", params: { customer: user.name, phone: user.phone, customerId: user.id } });
    }
    res.json({ ok: true });
  }),
);

customerAuthRouter.delete(
  "/me/delete-request",
  customerAuth,
  asyncHandler(async (req, res) => {
    await prisma.customer.update({ where: { id: req.customer!.sub }, data: { deletionRequestedAt: null } });
    res.json({ ok: true });
  }),
);

function serializeCustomer(user: {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  locale: string;
  preferredChannel?: string;
  deletionRequestedAt?: Date | null;
  telegramChatId?: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    address: user.address,
    locale: parseLocale(user.locale),
    preferredChannel: user.preferredChannel ?? "both",
    telegramLinked: Boolean(user.telegramChatId),
    deletionRequested: Boolean(user.deletionRequestedAt),
  };
}
