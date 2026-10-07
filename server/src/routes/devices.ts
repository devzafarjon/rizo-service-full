import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { parseBody } from "../lib/parse.js";
import { parseLocale } from "../lib/locale.js";
import { prisma } from "../lib/prisma.js";
import { customerAuth } from "../middleware/customerAuth.js";
import { staffAuth } from "../middleware/staffAuth.js";

// A signed-in phone or tablet registers the Firebase token it got from the OS, and removes it again on sign-out (POST /remove: the app's HTTP client has no DELETE body).
const registerSchema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z.enum(["android", "ios"]),
  locale: z.string().optional(),
});
const removeSchema = z.object({ token: z.string().trim().min(20).max(4096) });

export const staffDevicesRouter = Router();
staffDevicesRouter.use(staffAuth);

staffDevicesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req.body);
    const data = { scope: "staff", staffUserId: req.staff!.sub, customerId: null, platform: body.platform, locale: parseLocale(body.locale), lastSeenAt: new Date() };
    // The same phone can be handed to another person: the token follows whoever signed in last.
    await prisma.deviceToken.upsert({ where: { token: body.token }, create: { token: body.token, ...data }, update: data });
    res.status(204).end();
  }),
);

staffDevicesRouter.post(
  "/remove",
  asyncHandler(async (req, res) => {
    const body = parseBody(removeSchema, req.body);
    await prisma.deviceToken.deleteMany({ where: { token: body.token, staffUserId: req.staff!.sub } });
    res.status(204).end();
  }),
);

export const customerDevicesRouter = Router();
customerDevicesRouter.use(customerAuth);

customerDevicesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(registerSchema, req.body);
    const data = { scope: "customer", customerId: req.customer!.sub, staffUserId: null, platform: body.platform, locale: parseLocale(body.locale), lastSeenAt: new Date() };
    await prisma.deviceToken.upsert({ where: { token: body.token }, create: { token: body.token, ...data }, update: data });
    res.status(204).end();
  }),
);

customerDevicesRouter.post(
  "/remove",
  asyncHandler(async (req, res) => {
    const body = parseBody(removeSchema, req.body);
    await prisma.deviceToken.deleteMany({ where: { token: body.token, customerId: req.customer!.sub } });
    res.status(204).end();
  }),
);
