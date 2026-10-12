import { Router } from "express";
import { z } from "zod";
import { botIsLive, botUsername } from "../lib/telegram/api.js";
import { telegramWebhook, webhookMode } from "../lib/telegram/index.js";
import { createLinkToken, unlinkChat } from "../lib/telegram/links.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { customerAuth } from "../middleware/customerAuth.js";
import { staffAuth } from "../middleware/staffAuth.js";

/** Telegram updates arrive here when the bot runs in webhook mode (the secret header is checked inside). */
export const telegramWebhookRouter = Router();
telegramWebhookRouter.post("/webhook", asyncHandler(async (req, res) => telegramWebhook(req, res)));

async function status(linked: boolean, extra: Record<string, unknown> = {}) {
  return { configured: botIsLive(), username: await botUsername(), mode: webhookMode() ? "webhook" : "polling", linked, ...extra };
}

async function makeLink(kind: "customer" | "staff", subjectId: string) {
  if (!botIsLive()) throw new HttpError(503, "The Telegram bot is not set up yet", "telegramNotConfigured");
  const link = await createLinkToken(kind, subjectId);
  if (!link.url) throw new HttpError(503, "The Telegram bot is not set up yet", "telegramNotConfigured");
  return { url: link.url, expiresAt: link.expiresAt.toISOString() };
}

/** The signed-in customer connects or disconnects Telegram (the "Connect Telegram" button of the portal and the customer app). */
export const customerTelegramRouter = Router();
customerTelegramRouter.use(customerAuth);
customerTelegramRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = await prisma.customer.findUnique({ where: { id: req.customer!.sub }, select: { telegramChatId: true } });
    res.json(await status(Boolean(me?.telegramChatId)));
  }),
);
customerTelegramRouter.post(
  "/link",
  asyncHandler(async (req, res) => {
    res.json(await makeLink("customer", req.customer!.sub));
  }),
);
customerTelegramRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    const me = await prisma.customer.findUnique({ where: { id: req.customer!.sub }, select: { telegramChatId: true } });
    if (me?.telegramChatId) await unlinkChat(me.telegramChatId);
    res.json(await status(false));
  }),
);

/** The same for staff (alerts also go to Telegram while it is on). */
export const staffTelegramRouter = Router();
staffTelegramRouter.use(staffAuth);
staffTelegramRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const me = await prisma.staffUser.findUnique({ where: { id: req.staff!.sub }, select: { telegramChatId: true, telegramNotify: true } });
    res.json(await status(Boolean(me?.telegramChatId), { notify: me?.telegramNotify ?? true }));
  }),
);
staffTelegramRouter.post(
  "/link",
  asyncHandler(async (req, res) => {
    res.json(await makeLink("staff", req.staff!.sub));
  }),
);
staffTelegramRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ notify: z.boolean() }), req.body);
    const me = await prisma.staffUser.update({ where: { id: req.staff!.sub }, data: { telegramNotify: body.notify }, select: { telegramChatId: true, telegramNotify: true } });
    res.json(await status(Boolean(me.telegramChatId), { notify: me.telegramNotify }));
  }),
);
staffTelegramRouter.delete(
  "/",
  asyncHandler(async (req, res) => {
    const me = await prisma.staffUser.findUnique({ where: { id: req.staff!.sub }, select: { telegramChatId: true } });
    if (me?.telegramChatId) await unlinkChat(me.telegramChatId);
    res.json(await status(false, { notify: true }));
  }),
);
