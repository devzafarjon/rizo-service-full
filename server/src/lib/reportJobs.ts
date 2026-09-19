import type { DefectType, RequestSource, RequestStatus, ServiceType, TechnicianType, WarrantyStatus } from "@prisma/client";
import { money } from "./warranty.js";
import { prisma } from "./prisma.js";
import { isDoneStatus } from "./status.js";
import { bucketKey, createdAtWhere, type ReportWindow, type TrendGrain } from "./reportRange.js";

export type NamedProduct = {
  id: string;
  name: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  sku: string;
  category: string;
};

export type ReportJob = {
  id: string;
  type: ServiceType;
  status: RequestStatus;
  source: RequestSource;
  submittedByCustomer: boolean;
  warrantyStatus: WarrantyStatus;
  isPaidRepair: boolean;
  defectType: DefectType | null;
  finalCost: number;
  estimatedCost: number;
  createdAt: Date;
  receivedAt: Date | null;
  completedAt: Date | null;
  product: NamedProduct;
  assignedTechnician: { id: string; name: string; technicianType: TechnicianType | null } | null;
  partLines: Array<{
    sparePartId: string;
    quantity: number;
    lineTotal: number;
    sparePart: { id: string; name: string; nameUz: string; nameRu: string; nameEn: string };
  }>;
  extrasTotal: number;
  rating: number | null;
  paused: boolean;
};

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function isFreeWarranty(job: Pick<ReportJob, "warrantyStatus" | "isPaidRepair">) {
  return job.warrantyStatus === "in_warranty" && !job.isPaidRepair;
}

export function jobRevenue(job: ReportJob) {
  if (!isDoneStatus(job.status)) return 0;
  return job.finalCost;
}

export function jobPartsCost(job: ReportJob) {
  return job.partLines.reduce((sum, line) => sum + line.lineTotal, 0);
}

export function jobCost(job: ReportJob) {
  return jobPartsCost(job) + job.extrasTotal;
}

export function jobProfit(job: ReportJob) {
  if (!isDoneStatus(job.status)) return 0;
  return jobRevenue(job) - jobCost(job);
}

export function resolutionHours(job: ReportJob) {
  if (!job.completedAt || !isDoneStatus(job.status)) return null;
  const start = job.receivedAt ?? job.createdAt;
  const hours = (job.completedAt.getTime() - start.getTime()) / 3_600_000;
  return hours >= 0 ? hours : null;
}

export async function loadReportJobs(window: ReportWindow, productId?: string): Promise<ReportJob[]> {
  const rows = await prisma.serviceRequest.findMany({
    where: {
      ...createdAtWhere(window),
      ...(productId ? { productId } : {}),
    },
    select: {
      id: true,
      type: true,
      status: true,
      source: true,
      submittedByCustomer: true,
      warrantyStatus: true,
      isPaidRepair: true,
      defectType: true,
      finalCost: true,
      estimatedCost: true,
      createdAt: true,
      receivedAt: true,
      completedAt: true,
      product: { select: { id: true, name: true, nameUz: true, nameRu: true, nameEn: true, sku: true, category: true } },
      assignedTechnician: { select: { id: true, name: true, technicianType: true } },
      partLines: {
        select: {
          sparePartId: true,
          quantity: true,
          priceAtTime: true,
          sparePart: { select: { id: true, name: true, nameUz: true, nameRu: true, nameEn: true } },
        },
      },
      extraExpenses: { select: { price: true } },
      feedback: { select: { rating: true } },
      pauses: { where: { resumedAt: null }, select: { id: true }, take: 1 },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    status: row.status,
    source: row.source,
    submittedByCustomer: row.submittedByCustomer,
    warrantyStatus: row.warrantyStatus,
    isPaidRepair: row.isPaidRepair,
    defectType: row.defectType,
    finalCost: row.finalCost == null ? 0 : money(row.finalCost),
    estimatedCost: row.estimatedCost == null ? 0 : money(row.estimatedCost),
    createdAt: row.createdAt,
    receivedAt: row.receivedAt,
    completedAt: row.completedAt,
    product: row.product,
    assignedTechnician: row.assignedTechnician,
    partLines: row.partLines.map((line) => ({
      sparePartId: line.sparePartId,
      quantity: line.quantity,
      lineTotal: money(line.priceAtTime) * line.quantity,
      sparePart: line.sparePart,
    })),
    extrasTotal: row.extraExpenses.reduce((sum, line) => sum + money(line.price), 0),
    rating: row.feedback?.rating ?? null,
    paused: !isDoneStatus(row.status) && row.pauses.length > 0,
  }));
}

export function moneyTotals(jobs: ReportJob[]) {
  let revenue = 0;
  let parts = 0;
  let extras = 0;
  let done = 0;
  for (const job of jobs) {
    if (!isDoneStatus(job.status)) continue;
    done += 1;
    revenue += jobRevenue(job);
    parts += jobPartsCost(job);
    extras += job.extrasTotal;
  }
  return {
    revenue: roundMoney(revenue),
    parts: roundMoney(parts),
    extras: roundMoney(extras),
    costs: roundMoney(parts + extras),
    profit: roundMoney(revenue - parts - extras),
    done,
  };
}

export function trendSeries(jobs: ReportJob[], grain: TrendGrain) {
  const buckets = new Map<string, { key: string; requests: number; revenue: number; costs: number; profit: number }>();
  for (const job of jobs) {
    const key = bucketKey(job.createdAt, grain);
    const row = buckets.get(key) ?? { key, requests: 0, revenue: 0, costs: 0, profit: 0 };
    row.requests += 1;
    if (isDoneStatus(job.status)) {
      const revenue = jobRevenue(job);
      const costs = jobCost(job);
      row.revenue += revenue;
      row.costs += costs;
      row.profit += revenue - costs;
    }
    buckets.set(key, row);
  }
  return [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({
      key: row.key,
      requests: row.requests,
      revenue: roundMoney(row.revenue),
      costs: roundMoney(row.costs),
      profit: roundMoney(row.profit),
    }));
}
