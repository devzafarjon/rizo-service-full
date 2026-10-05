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
  replacement: { include: { product: true } },
});

export type JobWorkRecord = {
  warrantyStatus: WarrantyStatus;
  resolutionType?: "repair" | "replace" | "refund" | null;
  replacement?: { id: string; productId: string; serialNumber: string; product: NamedRecord & { sku: string } } | null;
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

/** What the manufacturer warranty pays for: labor (services) and parts; extra expenses are always charged. */
export type WarrantyCoverage = { labor: boolean; parts: boolean };
const FULL_COVERAGE: WarrantyCoverage = { labor: true, parts: true };

export function coverageOf(product: { warrantyCoversLabor: boolean; warrantyCoversParts: boolean } | null | undefined): WarrantyCoverage {
  return product ? { labor: product.warrantyCoversLabor, parts: product.warrantyCoversParts } : FULL_COVERAGE;
}

export function computeJobCost(
  work: Pick<JobWorkRecord, "warrantyStatus" | "isPaidRepair" | "serviceLines" | "partLines" | "extraExpenses">,
  coverage: WarrantyCoverage = FULL_COVERAGE,
) {
  const servicesTotal = work.serviceLines.reduce((sum, line) => sum + money(line.priceAtTime), 0);
  const partsTotal = work.partLines.reduce((sum, line) => sum + money(line.priceAtTime) * line.quantity, 0);
  const extrasTotal = work.extraExpenses.reduce((sum, line) => sum + money(line.price), 0);
  const catalogTotal = servicesTotal + partsTotal;
  const workTotal = catalogTotal + extrasTotal;
  const coveredByWarranty = work.warrantyStatus === "in_warranty" && !work.isPaidRepair;
  const waived = coveredByWarranty ? (coverage.labor ? servicesTotal : 0) + (coverage.parts ? partsTotal : 0) : 0;
  return {
    servicesTotal,
    partsTotal,
    extrasTotal,
    catalogTotal,
    workTotal,
    waivedTotal: waived,
    chargedTotal: workTotal - waived,
    coveredByWarranty,
  };
}

export type CompletionGap = "service" | "part" | "photo" | "replacement" | "estimate";

export function completionGaps(
  work: Pick<JobWorkRecord, "serviceLines" | "partLines" | "photos" | "resolutionType" | "replacement">,
  options?: { requireService?: boolean },
) {
  const gaps: CompletionGap[] = [];
  // A replacement swaps the whole device, so no service line is needed.
  const replacing = work.resolutionType === "replace";
  if (!replacing && options?.requireService !== false && work.serviceLines.length === 0) gaps.push("service");
  if (work.photos.length === 0) gaps.push("photo");
  if (replacing && !work.replacement) gaps.push("replacement");
  return gaps;
}

export function resolveJobFinancials(
  work: Pick<JobWorkRecord, "warrantyStatus" | "isPaidRepair" | "serviceLines" | "partLines" | "extraExpenses">,
  type: ServiceType,
  sale: { warrantyMonths: number; warrantyExpiry: Date } | null,
  options?: { coverage?: WarrantyCoverage; forcePaid?: boolean; forceFree?: boolean },
) {
  const warrantyStatus = sale
    ? computeWarrantyStatus(sale.warrantyMonths, sale.warrantyExpiry)
    : work.warrantyStatus;
  const payment = paymentFor(type, warrantyStatus);
  // A staff decision ("paid repair" / "warranty repair") overrides what the dates alone would say.
  const isPaidRepair = options?.forcePaid ? true : options?.forceFree ? false : payment.isPaidRepair;
  const cost = computeJobCost({ ...work, warrantyStatus, isPaidRepair }, options?.coverage);
  return {
    warrantyStatus,
    isPaidRepair,
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
    coverage?: WarrantyCoverage;
    decision?: "warranty_repair" | "paid_repair" | "replace" | "refund" | "reject" | null;
  },
) {
  const cost = options?.type
    ? resolveJobFinancials(work, options.type, options.sale ?? null, {
        coverage: options.coverage,
        forcePaid: options.decision === "paid_repair",
        forceFree: options.decision === "warranty_repair",
      }).cost
    : computeJobCost(work, options?.coverage);
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
    resolutionType: work.resolutionType ?? null,
    replacement: work.replacement
      ? {
          id: work.replacement.id,
          productId: work.replacement.productId,
          serialNumber: work.replacement.serialNumber,
          ...serializeNamed(work.replacement.product),
          sku: work.replacement.product.sku,
        }
      : null,
    cost,
    canComplete: gaps.length === 0,
    missing: gaps,
  };
}
