import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { emitToStaff } from "./realtime.js";
import { dispatchOutbound } from "./notifyDispatch.js";
import { env } from "../config.js";

export function serializeStaffAlert(row: {
  id: string;
  serviceRequestId: string | null;
  sparePartId: string | null;
  message: string;
  code: string | null;
  params: Prisma.JsonValue | null;
  isRead: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    serviceRequestId: row.serviceRequestId,
    sparePartId: row.sparePartId,
    message: row.message,
    code: row.code,
    params: row.params && typeof row.params === "object" && !Array.isArray(row.params) ? row.params : null,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function notifyAdmins(input: {
  message: string;
  code: string;
  serviceRequestId?: string | null;
  sparePartId?: string | null;
  params?: Record<string, unknown>;
}) {
  const admins = await prisma.staffUser.findMany({
    where: { role: "admin" },
    select: { id: true, phone: true },
  });
  const created = [];
  for (const admin of admins) {
    const row = await prisma.notification.create({
      data: {
        audience: "staff",
        staffUserId: admin.id,
        serviceRequestId: input.serviceRequestId ?? null,
        sparePartId: input.sparePartId ?? null,
        message: input.message,
        code: input.code,
        params: input.params as Prisma.InputJsonValue | undefined,
      },
    });
    created.push(serializeStaffAlert(row));
  }
  emitToStaff("alert:created", { code: input.code, message: input.message });
  await dispatchOutbound({
    target: { phone: admins[0]?.phone, telegramChatId: env.telegramAdminChatId || null },
    body: input.message,
    code: input.code,
    entityId: input.serviceRequestId ?? input.sparePartId ?? undefined,
  });
  return created;
}
