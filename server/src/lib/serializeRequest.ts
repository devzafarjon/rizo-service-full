import { Prisma } from "@prisma/client";
import { computeWarrantyStatus, money, toDateOnly } from "./warranty.js";

export const requestInclude = Prisma.validator<Prisma.ServiceRequestInclude>()({
  customer: { select: { id: true, name: true, phone: true, address: true, regionCode: true } },
  product: true,
  assignedTechnician: { select: { id: true, name: true, technicianType: true, isAvailable: true } },
  sale: { include: { product: true } },
});

export type RequestRecord = Prisma.ServiceRequestGetPayload<{ include: typeof requestInclude }>;

export type CustomerLocation = {
  address: string;
  lat: number | null;
  lng: number | null;
};

export function serializeLocation(value: Prisma.JsonValue | null): CustomerLocation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const loc = value as Record<string, unknown>;
  if (typeof loc.address !== "string" || !loc.address.trim()) {
    return null;
  }
  return {
    address: loc.address.trim(),
    lat: typeof loc.lat === "number" ? loc.lat : null,
    lng: typeof loc.lng === "number" ? loc.lng : null,
  };
}

export function serializeRequest(request: RequestRecord) {
  const warrantyStatus = request.sale
    ? computeWarrantyStatus(request.sale.warrantyMonths, request.sale.warrantyExpiry)
    : request.warrantyStatus;
  return {
    id: request.id,
    displayId: request.displayId,
    type: request.type,
    source: request.source,
    submittedByCustomer: request.submittedByCustomer,
    saleId: request.saleId,
    customerId: request.customerId,
    productId: request.productId,
    issueDescription: request.issueDescription,
    defectType: request.defectType,
    locationType: request.locationType,
    customerLocation: serializeLocation(request.customerLocation),
    technicianTypeRequired: request.technicianTypeRequired,
    assignedTechnicianId: request.assignedTechnicianId,
    status: request.status,
    priority: request.priority,
    warrantyStatus,
    isPaidRepair: request.isPaidRepair,
    estimatedCost: request.estimatedCost == null ? null : money(request.estimatedCost),
    finalCost: request.finalCost == null ? null : money(request.finalCost),
    paymentStatus: request.paymentStatus,
    receivedAt: request.receivedAt?.toISOString() ?? null,
    acceptedAt: request.acceptedAt?.toISOString() ?? null,
    arrivedAt: request.arrivedAt?.toISOString() ?? null,
    completedAt: request.completedAt?.toISOString() ?? null,
    overdueAt: request.overdueAt?.toISOString() ?? null,
    isOverdue: Boolean(request.overdueAt) && !["completed", "closed", "replaced"].includes(request.status),
    pickupConfirmedAt: request.pickupConfirmedAt?.toISOString() ?? null,
    pickupSignatureUrl: request.pickupSignatureUrl,
    createdAt: request.createdAt.toISOString(),
    customer: request.customer,
    product: request.product,
    assignedTechnician: request.assignedTechnician,
    sale: request.sale
      ? {
          id: request.sale.id,
          invoiceNumber: request.sale.invoiceNumber,
          saleDate: toDateOnly(request.sale.saleDate),
          warrantyMonths: request.sale.warrantyMonths,
          warrantyExpiry: toDateOnly(request.sale.warrantyExpiry),
          warrantyStatus: computeWarrantyStatus(request.sale.warrantyMonths, request.sale.warrantyExpiry),
          product: request.sale.product,
        }
      : null,
  };
}
