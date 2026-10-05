import type { Prisma, RequestStatus, ServiceType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { emitToCustomer } from "./realtime.js";
import { serializeNamed, type NamedRecord } from "./named.js";
import { statusLabel } from "./status.js";
import { dispatchOutbound } from "./notifyDispatch.js";
import { env } from "../config.js";

type NotificationParams = Record<string, unknown>;

export function serializeNotification(row: {
  id: string;
  serviceRequestId: string | null;
  message: string;
  code: string | null;
  params: Prisma.JsonValue | null;
  isRead: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    serviceRequestId: row.serviceRequestId,
    message: row.message,
    code: row.code,
    params: (row.params && typeof row.params === "object" && !Array.isArray(row.params)
      ? (row.params as NotificationParams)
      : null),
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createCustomerNotification(
  customerId: string,
  serviceRequestId: string,
  message: string,
  code?: string,
  params?: NotificationParams,
) {
  const row = await prisma.notification.create({
    data: {
      customerId,
      serviceRequestId,
      message,
      code: code ?? null,
      params: params ? (params as Prisma.InputJsonValue) : undefined,
    },
  });
  const payload = serializeNotification(row);
  emitToCustomer(customerId, "notification:created", payload);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { phone: true, telegramChatId: true },
  });
  if (customer) {
    await dispatchOutbound({
      target: { phone: customer.phone, telegramChatId: customer.telegramChatId },
      body: message,
      code: code ?? "customer",
      entityId: serviceRequestId,
    });
  }
  return payload;
}

function productParams(product: NamedRecord) {
  const named = serializeNamed(product);
  return {
    product: named.name,
    productName: named.name,
    nameUz: named.nameUz,
    nameRu: named.nameRu,
    nameEn: named.nameEn,
  };
}

export async function notifyRequestCreated(request: {
  id: string;
  customerId: string;
  type: ServiceType;
  submittedByCustomer: boolean;
  product: NamedRecord;
  trackingToken?: string;
}) {
  const kind = request.type;
  const product = request.product.name;
  const code = request.submittedByCustomer ? "createdByCustomer" : "createdByStaff";
  const message = request.submittedByCustomer
    ? `We received your ${kind} request for ${product}.`
    : `A ${kind} request was created for your ${product}.`;
  // The tracking link works without signing in, so it is part of the SMS / Telegram text.
  const link = request.trackingToken ? ` Track it: ${env.clientOrigin}/t/${request.trackingToken}` : "";
  await createCustomerNotification(request.customerId, request.id, `${message}${link}`, code, {
    type: request.type,
    ...productParams(request.product),
  });
}

export async function backfillNotificationI18n() {
  const rows = await prisma.notification.findMany({
    where: { code: null },
    include: { serviceRequest: { include: { product: true } } },
  });
  for (const row of rows) {
    if (!row.serviceRequest) continue;
    const message = row.message;
    const code = message.startsWith("We received")
      ? "createdByCustomer"
      : /was created for your/.test(message)
        ? "createdByStaff"
        : "status";
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        code,
        params: {
          type: row.serviceRequest.type,
          status: row.serviceRequest.status,
          ...productParams(row.serviceRequest.product),
        },
      },
    });
  }
  return rows.length;
}

export async function notifyRequestStatus(
  request: {
    id: string;
    customerId: string;
    type: ServiceType;
    status: RequestStatus;
    product: NamedRecord;
  },
  extra?: Record<string, unknown>,
) {
  const reason = typeof extra?.reason === "string" && extra.reason ? ` Reason: ${extra.reason}` : "";
  const message = `Your ${request.type} for ${request.product.name} is now ${statusLabel(request.status)}.${reason}`;
  await createCustomerNotification(request.customerId, request.id, message, "status", {
    type: request.type,
    status: request.status,
    ...productParams(request.product),
    ...(extra ?? {}),
  });
}
