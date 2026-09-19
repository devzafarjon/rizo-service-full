import type { PaymentStatus, ServiceType, WarrantyStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { paymentFor } from "./assignment.js";
import { money, computeWarrantyStatus } from "./warranty.js";
import { serializeNamed, type NamedRecord } from "./named.js";

export const workInclude = Prisma.validator<Prisma.ServiceRequestInclude>()({
  serviceLines: { include: { serviceCatalogItem: true }, orderBy: { id: "asc" } },
  partLines: { include: { sparePart: true }, orderBy: { id: "asc" } },
  extraExpenses: { orderBy: { id: "asc" } },
  photos: { orderBy: { createdAt: "asc" } },
});

export type JobWorkRecord = {
  warrantyStatus: WarrantyStatus;
  isPaidRepair?: boolean;
  serviceLines: Array<{
    id: string;
    serviceCatalogItemId: string;
    priceAtTime: { toString(): string } | number;
    serviceCatalogItem: NamedRecord;
  }>;
  partLines: Array<{
    id: string;
    sparePartId: string;
    quantity: number;
    priceAtTime: { toString(): string } | number;
    sparePart: NamedRecord;
  }>;
  extraExpenses: Array<{
    id: string;
    description: string;
    price: { toString(): string } | number;
  }>;
  photos: Array<{
    id: string;
    photoUrl: string;
    uploadedBy: string;
    createdAt: Date;
  }>;
};

export function computeJobCost(
  work: Pick<JobWorkRecord, "warrantyStatus" | "isPaidRepair" | "serviceLines" | "partLines" | "extraExpenses">,
) {
  const servicesTotal = work.serviceLines.reduce((sum, line) => sum + money(line.priceAtTime), 0);
  const partsTotal = work.partLines.reduce((sum, line) => sum + money(line.priceAtTime) * line.quantity, 0);
  const extrasTotal = work.extraExpenses.reduce((sum, line) => sum + money(line.price), 0);
  const catalogTotal = servicesTotal + partsTotal;
  const workTotal = catalogTotal + extrasTotal;
  const coveredByWarranty = work.warrantyStatus === "in_warranty" && !work.isPaidRepair;
  return {
    servicesTotal,
    partsTotal,
    extrasTotal,
    catalogTotal,
    workTotal,
    chargedTotal: coveredByWarranty ? extrasTotal : workTotal,
    coveredByWarranty,
  };
}

export function completionGaps(
  work: Pick<JobWorkRecord, "serviceLines" | "partLines" | "photos">,
  options?: { requireService?: boolean },
) {
  const gaps: Array<"service" | "part" | "photo"> = [];
  if (options?.requireService !== false && work.serviceLines.length === 0) gaps.push("service");
  if (work.photos.length === 0) gaps.push("photo");
  return gaps;
}

export function resolveJobFinancials(
  work: Pick<JobWorkRecord, "warrantyStatus" | "isPaidRepair" | "serviceLines" | "partLines" | "extraExpenses">,
  type: ServiceType,
  sale: { warrantyMonths: number; warrantyExpiry: Date } | null,
) {
  const warrantyStatus = sale
    ? computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry)
    : work.warrantyStatus;
  const payment = paymentFor(type, warrantyStatus);
  const cost = computeJobCost({ ...work, warrantyStatus, isPaidRepair: payment.isPaidRepair });
  return {
    warrantyStatus,
    isPaidRepair: payment.isPaidRepair,
    estimatedCost: cost.workTotal,
    finalCost: cost.chargedTotal,
    paymentStatus: (cost.chargedTotal === 0 ? "not_required" : "pending") as PaymentStatus,
    cost,
  };
}

export function serializeJobWork(
  work: JobWorkRecord,
  options?: {
    requireService?: boolean;
    type?: ServiceType;
    sale?: { warrantyMonths: number; warrantyExpiry: Date } | null;
  },
) {
  const cost = options?.type
    ? resolveJobFinancials(work, options.type, options.sale ?? null).cost
    : computeJobCost(work);
  const gaps = completionGaps(work, { requireService: options?.requireService });
  return {
    serviceLines: work.serviceLines.map((line) => ({
      id: line.id,
      serviceCatalogItemId: line.serviceCatalogItemId,
      ...serializeNamed(line.serviceCatalogItem),
      priceAtTime: money(line.priceAtTime),
    })),
    partLines: work.partLines.map((line) => ({
      id: line.id,
      sparePartId: line.sparePartId,
      ...serializeNamed(line.sparePart),
      quantity: line.quantity,
      priceAtTime: money(line.priceAtTime),
      lineTotal: money(line.priceAtTime) * line.quantity,
    })),
    extraExpenses: work.extraExpenses.map((line) => ({
      id: line.id,
      description: line.description,
      price: money(line.price),
    })),
    photos: work.photos.map((photo) => ({
      id: photo.id,
      photoUrl: photo.photoUrl,
      uploadedBy: photo.uploadedBy,
      createdAt: photo.createdAt.toISOString(),
    })),
    cost,
    canComplete: gaps.length === 0,
    missing: gaps,
  };
}
