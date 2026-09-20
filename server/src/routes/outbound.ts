import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const outboundRouter = Router();
outboundRouter.use(staffAuth, requireStaffRole("admin"));

outboundRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const messages = await prisma.outboundMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({
      messages: messages.map((row) => ({
        id: row.id,
        channel: row.channel,
        to: row.to,
        body: row.body,
        status: row.status,
        error: row.error,
        code: row.code,
        createdAt: row.createdAt.toISOString(),
        sentAt: row.sentAt?.toISOString() ?? null,
      })),
    });
  }),
);
