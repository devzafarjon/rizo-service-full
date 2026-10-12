import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { emitToStaff } from "./realtime.js";
import { dispatchOutbound } from "./notifyDispatch.js";
import { env } from "../config.js";
import { pushToStaff } from "./push.js";

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

type AlertInput = {
  message: string;
  code: string;
  serviceRequestId?: string | null;
  sparePartId?: string | null;
  params?: Record<string, unknown>;
  /** Who is told. Admins always; add "warehouse" for stock and delivery news. */
  roles?: Array<"admin" | "warehouse">;
};

export async function notifyAdmins(input: AlertInput) {
  const admins = await prisma.staffUser.findMany({
    where: { role: { in: input.roles && input.roles.length > 0 ? input.roles : ["admin"] }, isActive: true },
    select: { id: true, phone: true, role: true },
    orderBy: { createdAt: "asc" },
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
    void pushToStaff(admin.id, { message: input.message, code: input.code, params: input.params, serviceRequestId: input.serviceRequestId, notificationId: row.id });
  }
  emitToStaff("alert:created", { code: input.code, message: input.message });
  await dispatchOutbound({
    target: { phone: admins.find((item) => item.role === "admin")?.phone ?? admins[0]?.phone, telegramChatId: env.telegramAdminChatId || null },
    body: input.message,
    code: input.code,
    entityId: input.serviceRequestId ?? input.sparePartId ?? undefined,
  });
  return created;
}

/** An alert for one staff member (for example the technician whose part has arrived). */
export async function notifyStaffUser(userId: string, input: Omit<AlertInput, "roles">) {
  const row = await prisma.notification.create({
    data: {
      audience: "staff",
      staffUserId: userId,
      serviceRequestId: input.serviceRequestId ?? null,
      sparePartId: input.sparePartId ?? null,
      message: input.message,
      code: input.code,
      params: input.params as Prisma.InputJsonValue | undefined,
    },
  });
  void pushToStaff(userId, { message: input.message, code: input.code, params: input.params, serviceRequestId: input.serviceRequestId, notificationId: row.id });
  emitToStaff("alert:created", { code: input.code, message: input.message });
  return serializeStaffAlert(row);
}

/** Alerts for the keepers of one warehouse (and keepers who look after all of them). */
export async function notifyKeepers(warehouseId: string | null, input: Omit<AlertInput, "roles">) {
  const keepers = await prisma.staffUser.findMany({
    where: { role: "warehouse", isActive: true, OR: warehouseId ? [{ warehouseId }, { warehouseId: null }] : [{ warehouseId: null }] },
    select: { id: true },
  });
  for (const keeper of keepers) await notifyStaffUser(keeper.id, input);
  return keepers.length;
}
