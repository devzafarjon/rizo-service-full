import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { parseDateOnly } from "../lib/warranty.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const auditRouter = Router();
auditRouter.use(staffAuth, requireStaffRole("admin"));

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const entityId = typeof req.query.entityId === "string" ? req.query.entityId.trim() : "";
    const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
    const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
    const createdAt =
      from || to
        ? {
            ...(from ? { gte: parseDateOnly(from) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          }
        : undefined;
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(entityId ? { entityId } : {}),
        ...(userId ? { userId } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({
      logs: logs.map((row) => ({
        id: row.id,
        userId: row.userId,
        userType: row.userType,
        userName: row.userName,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        oldValue: row.oldValue,
        newValue: row.newValue,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }),
);
