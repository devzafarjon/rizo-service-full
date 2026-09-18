import { Router } from "express";
import type { DefectType, RequestStatus, ServiceType, TechnicianType } from "@prisma/client";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { money } from "../lib/warranty.js";
import { prisma } from "../lib/prisma.js";
import { isDoneStatus, KANBAN_COLUMNS } from "../lib/status.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

const RANGE_KEYS = ["all", "30d", "90d", "year"] as const;
type RangeKey = (typeof RANGE_KEYS)[number];

const TYPES: ServiceType[] = ["installation", "repair", "maintenance"];
const DEFECTS: Array<DefectType | "unspecified"> = ["failed_during_use", "dead_on_arrival", "unspecified"];

function parseRange(value: unknown): RangeKey {
  if (typeof value !== "string" || value === "") return "all";
  if ((RANGE_KEYS as readonly string[]).includes(value)) return value as RangeKey;
  throw new HttpError(400, "Use all, 30d, 90d, or year");
}

function rangeFrom(key: RangeKey, now = new Date()): Date | null {
  if (key === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (key === "90d") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (key === "year") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export const reportsRouter = Router();
reportsRouter.use(staffAuth, requireStaffRole("admin"));

reportsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const range = parseRange(req.query.range);
    const now = new Date();
    const from = rangeFrom(range, now);
    const createdAtFilter = from ? { gte: from } : undefined;

    const [requests, feedback] = await Promise.all([
      prisma.serviceRequest.findMany({
        where: createdAtFilter ? { createdAt: createdAtFilter } : undefined,
        select: {
          id: true,
          type: true,
          status: true,
          defectType: true,
          warrantyStatus: true,
          isPaidRepair: true,
          finalCost: true,
          createdAt: true,
          receivedAt: true,
          completedAt: true,
          assignedTechnicianId: true,
          product: { select: { id: true, name: true, nameUz: true, nameRu: true, nameEn: true, sku: true, category: true } },
          assignedTechnician: { select: { id: true, name: true, technicianType: true } },
        },
      }),
      prisma.feedback.findMany({
        where: createdAtFilter ? { createdAt: createdAtFilter } : undefined,
        select: {
          rating: true,
          serviceRequest: {
            select: {
              assignedTechnician: { select: { id: true, name: true, technicianType: true } },
            },
          },
        },
      }),
    ]);

    const typeCounts = Object.fromEntries(TYPES.map((type) => [type, 0])) as Record<ServiceType, number>;
    const statusCounts = Object.fromEntries(KANBAN_COLUMNS.map((status) => [status, 0])) as Record<RequestStatus, number>;
    const defectCounts: Record<DefectType | "unspecified", number> = {
      dead_on_arrival: 0,
      failed_during_use: 0,
      unspecified: 0,
    };
    const productCounts = new Map<
      string,
      { productId: string; name: string; nameUz: string; nameRu: string; nameEn: string; sku: string; category: string; count: number }
    >();
    const technicians = new Map<
      string,
      {
        id: string;
        name: string;
        technicianType: TechnicianType | null;
        ratings: number[];
        jobsDone: number;
      }
    >();

    let open = 0;
    let done = 0;
    const resolutionHours: number[] = [];
    let inWarrantyJobs = 0;
    let inWarrantyAmount = 0;
    let paidJobs = 0;
    let paidAmount = 0;

    for (const request of requests) {
      typeCounts[request.type] += 1;
      statusCounts[request.status] += 1;

      if (request.type === "repair") {
        defectCounts[request.defectType ?? "unspecified"] += 1;
      }

      const product = productCounts.get(request.product.id) ?? {
        productId: request.product.id,
        name: request.product.name,
        nameUz: request.product.nameUz,
        nameRu: request.product.nameRu,
        nameEn: request.product.nameEn,
        sku: request.product.sku,
        category: request.product.category,
        count: 0,
      };
      product.count += 1;
      productCounts.set(request.product.id, product);

      const tech = request.assignedTechnician;
      if (tech) {
        const row = technicians.get(tech.id) ?? {
          id: tech.id,
          name: tech.name,
          technicianType: tech.technicianType,
          ratings: [],
          jobsDone: 0,
        };
        technicians.set(tech.id, row);
      }

      if (isDoneStatus(request.status)) {
        done += 1;
        if (tech) {
          const row = technicians.get(tech.id);
          if (row) row.jobsDone += 1;
        }
        if (request.completedAt) {
          const start = request.receivedAt ?? request.createdAt;
          const hours = (request.completedAt.getTime() - start.getTime()) / 3_600_000;
          if (hours >= 0) resolutionHours.push(hours);
        }
        const amount = request.finalCost ? money(request.finalCost) : 0;
        if (request.warrantyStatus === "in_warranty" && !request.isPaidRepair) {
          inWarrantyJobs += 1;
          inWarrantyAmount += amount;
        } else {
          paidJobs += 1;
          paidAmount += amount;
        }
      } else {
        open += 1;
      }
    }

    for (const item of feedback) {
      const tech = item.serviceRequest.assignedTechnician;
      if (!tech) continue;
      const row = technicians.get(tech.id) ?? {
        id: tech.id,
        name: tech.name,
        technicianType: tech.technicianType,
        ratings: [],
        jobsDone: 0,
      };
      row.ratings.push(item.rating);
      technicians.set(tech.id, row);
    }

    const allRatings = feedback.map((item) => item.rating);

    res.json({
      range: {
        key: range,
        from: from ? from.toISOString() : null,
        to: now.toISOString(),
      },
      totals: {
        requests: requests.length,
        open,
        done,
        avgResolutionHours: average(resolutionHours),
        resolvedCount: resolutionHours.length,
        avgRating: average(allRatings),
        ratingCount: allRatings.length,
      },
      byType: TYPES.map((type) => ({ type, count: typeCounts[type] })),
      byStatus: KANBAN_COLUMNS.map((status) => ({ status, count: statusCounts[status] })).filter((row) => row.count > 0),
      defects: DEFECTS.map((type) => ({ type, count: defectCounts[type] })),
      products: [...productCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8),
      revenue: {
        inWarranty: {
          jobs: inWarrantyJobs,
          amount: Math.round(inWarrantyAmount * 100) / 100,
        },
        paid: {
          jobs: paidJobs,
          amount: Math.round(paidAmount * 100) / 100,
        },
      },
      technicians: [...technicians.values()]
        .map((tech) => ({
          id: tech.id,
          name: tech.name,
          technicianType: tech.technicianType,
          avgRating: average(tech.ratings),
          ratingCount: tech.ratings.length,
          jobsDone: tech.jobsDone,
        }))
        .sort((a, b) => {
          if ((b.avgRating ?? -1) !== (a.avgRating ?? -1)) return (b.avgRating ?? -1) - (a.avgRating ?? -1);
          return a.name.localeCompare(b.name);
        }),
    });
  }),
);
