import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { serializeStaffAlert } from "../lib/notifyStaff.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const alertsRouter = Router();
alertsRouter.use(staffAuth, requireStaffRole("admin"));

alertsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const [notifications, unreadCount, parts] = await Promise.all([
      prisma.notification.findMany({
        where: { staffUserId: req.staff!.sub },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { staffUserId: req.staff!.sub, isRead: false } }),
      prisma.sparePart.findMany({ orderBy: { stockQuantity: "asc" } }),
    ]);
    const low = parts.filter((part) => part.stockQuantity <= part.lowStockThreshold);
    res.json({
      notifications: notifications.map(serializeStaffAlert),
      unreadCount,
      lowStock: low.map((part) => ({
        id: part.id,
        name: part.name,
        nameUz: part.nameUz,
        nameRu: part.nameRu,
        nameEn: part.nameEn,
        stockQuantity: part.stockQuantity,
        lowStockThreshold: part.lowStockThreshold,
      })),
    });
  }),
);

alertsRouter.patch(
  "/read-all",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { staffUserId: req.staff!.sub, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true, unreadCount: 0 });
  }),
);

alertsRouter.patch(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const existing = await prisma.notification.findFirst({
      where: { id: req.params.id, staffUserId: req.staff!.sub },
    });
    if (!existing) throw new HttpError(404, "Notification not found");
    const row = existing.isRead
      ? existing
      : await prisma.notification.update({ where: { id: existing.id }, data: { isRead: true } });
    res.json({ notification: serializeStaffAlert(row) });
  }),
);
