import type { Prisma, RequestStatus, ServiceType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { emitToCustomer } from "./realtime.js";
import { serializeNamed, type NamedRecord } from "./named.js";
import { statusLabel } from "./status.js";

type NotificationParams = Record<string, unknown>;

export function serializeNotification(row: {
  id: string;
  serviceRequestId: string;
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
}) {
  const kind = request.type;
  const product = request.product.name;
  const code = request.submittedByCustomer ? "createdByCustomer" : "createdByStaff";
  const message = request.submittedByCustomer
    ? `We received your ${kind} request for ${product}.`
    : `A ${kind} request was created for your ${product}.`;
  await createCustomerNotification(request.customerId, request.id, message, code, {
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

export async function notifyRequestStatus(request: {
  id: string;
  customerId: string;
  type: ServiceType;
  status: RequestStatus;
  product: NamedRecord;
}) {
  const message = `Your ${request.type} for ${request.product.name} is now ${statusLabel(request.status)}.`;
  await createCustomerNotification(request.customerId, request.id, message, "status", {
    type: request.type,
    status: request.status,
    ...productParams(request.product),
  });
}
