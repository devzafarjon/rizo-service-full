import { Router } from "express";
import type { TechnicianType } from "@prisma/client";
import { asyncHandler } from "../lib/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import {
  average,
  isFreeWarranty,
  jobCost,
  jobPartsCost,
  jobRevenue,
  loadReportJobs,
  moneyTotals,
  resolutionHours,
  roundMoney,
  trendSeries,
} from "../lib/reportJobs.js";
import { bucketKey, defaultGrain, parseReportRange, parseTrendGrain, serializeWindow } from "../lib/reportRange.js";
import { isDoneStatus, KANBAN_COLUMNS } from "../lib/status.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const reportsRouter = Router();
reportsRouter.use(staffAuth, requireStaffRole("admin"));

function productIdQuery(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

reportsRouter.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const grain = parseTrendGrain(req.query.grain, defaultGrain(window.preset));
    const jobs = await loadReportJobs(window);
    const money = moneyTotals(jobs);
    const hours = jobs.map(resolutionHours).filter((value): value is number => value != null);
    const ratings = jobs.map((job) => job.rating).filter((value): value is number => value != null);

    const statusCounts = new Map<string, number>();
    for (const status of KANBAN_COLUMNS) statusCounts.set(status, 0);
    let paused = 0;
    for (const job of jobs) {
      statusCounts.set(job.status, (statusCounts.get(job.status) ?? 0) + 1);
      if (job.paused) paused += 1;
    }

    const products = new Map<string, { product: (typeof jobs)[number]["product"]; count: number }>();
    const parts = new Map<string, { name: string; nameUz: string; nameRu: string; nameEn: string; quantity: number }>();
    const defects = new Map<string, number>();
    let free = 0;
    let paid = 0;

    for (const job of jobs) {
      const product = products.get(job.product.id) ?? { product: job.product, count: 0 };
      product.count += 1;
      products.set(job.product.id, product);

      for (const line of job.partLines) {
        const part = parts.get(line.sparePartId) ?? {
          name: line.sparePart.name,
          nameUz: line.sparePart.nameUz,
          nameRu: line.sparePart.nameRu,
          nameEn: line.sparePart.nameEn,
          quantity: 0,
        };
        part.quantity += line.quantity;
        parts.set(line.sparePartId, part);
      }

      if (job.type === "repair") {
        const category = job.product.category || "Other";
        defects.set(category, (defects.get(category) ?? 0) + 1);
      }

      if (isFreeWarranty(job)) free += 1;
      else paid += 1;
    }

    res.json({
      range: serializeWindow(window),
      grain,
      totals: {
        requests: jobs.length,
        revenue: money.revenue,
        profit: money.profit,
        costs: money.costs,
        avgResolutionHours: average(hours),
        avgRating: average(ratings),
        ratingCount: ratings.length,
      },
      trend: trendSeries(jobs, grain),
      topProducts: [...products.values()]
        .sort((a, b) => b.count - a.count || a.product.name.localeCompare(b.product.name))
        .slice(0, 8)
        .map((row) => ({ ...row.product, count: row.count })),
      topParts: [...parts.entries()]
        .map(([id, row]) => ({ id, ...row }))
        .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
        .slice(0, 8),
      defectsByCategory: [...defects.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
      byStatus: [
        ...KANBAN_COLUMNS.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })).filter((row) => row.count > 0),
        ...(paused ? [{ status: "paused" as const, count: paused }] : []),
      ],
      warrantySplit: { free, paid },
    });
  }),
);

reportsRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const jobs = await loadReportJobs(window);
    const rows = new Map<
      string,
      {
        product: (typeof jobs)[number]["product"];
        requests: number;
        installation: number;
        repair: number;
        revenue: number;
        warranty: number;
        paid: number;
      }
    >();

    for (const job of jobs) {
      const row = rows.get(job.product.id) ?? {
        product: job.product,
        requests: 0,
        installation: 0,
        repair: 0,
        revenue: 0,
        warranty: 0,
        paid: 0,
      };
      row.requests += 1;
      if (job.type === "installation") row.installation += 1;
      if (job.type === "repair") row.repair += 1;
      if (isDoneStatus(job.status)) {
        row.revenue += jobRevenue(job);
        if (isFreeWarranty(job)) row.warranty += 1;
        else row.paid += 1;
      }
      rows.set(job.product.id, row);
    }

    res.json({
      range: serializeWindow(window),
      rows: [...rows.values()]
        .map((row) => {
          const finished = row.warranty + row.paid;
          return {
            ...row.product,
            requests: row.requests,
            installation: row.installation,
            repair: row.repair,
            revenue: roundMoney(row.revenue),
            warranty: row.warranty,
            paid: row.paid,
            warrantyRatio: finished ? Math.round((row.warranty / finished) * 1000) / 10 : 0,
          };
        })
        .sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name)),
    });
  }),
);

reportsRouter.get(
  "/parts",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const productId = productIdQuery(req.query.productId);
    const jobs = await loadReportJobs(window, productId);
    const rows = new Map<
      string,
      { id: string; name: string; nameUz: string; nameRu: string; nameEn: string; quantity: number; revenue: number }
    >();

    for (const job of jobs) {
      for (const line of job.partLines) {
        const row = rows.get(line.sparePartId) ?? {
          id: line.sparePart.id,
          name: line.sparePart.name,
          nameUz: line.sparePart.nameUz,
          nameRu: line.sparePart.nameRu,
          nameEn: line.sparePart.nameEn,
          quantity: 0,
          revenue: 0,
        };
        row.quantity += line.quantity;
        row.revenue += line.lineTotal;
        rows.set(line.sparePartId, row);
      }
    }

    const products = await prisma.product.findMany({
      select: { id: true, name: true, nameUz: true, nameRu: true, nameEn: true, sku: true },
      orderBy: { name: "asc" },
    });

    res.json({
      range: serializeWindow(window),
      productId: productId ?? null,
      products,
      rows: [...rows.values()]
        .map((row) => ({ ...row, revenue: roundMoney(row.revenue) }))
        .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)),
    });
  }),
);

reportsRouter.get(
  "/expenses",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const jobs = await loadReportJobs(window);
    const byTechnician = new Map<string, { id: string; name: string; extras: number; parts: number }>();
    const byProduct = new Map<string, { product: (typeof jobs)[number]["product"]; extras: number; parts: number }>();
    let extras = 0;
    let parts = 0;

    for (const job of jobs) {
      const extrasTotal = job.extrasTotal;
      const partsTotal = jobPartsCost(job);
      extras += extrasTotal;
      parts += partsTotal;

      const techId = job.assignedTechnician?.id ?? "unassigned";
      const techName = job.assignedTechnician?.name ?? "Unassigned";
      const tech = byTechnician.get(techId) ?? { id: techId, name: techName, extras: 0, parts: 0 };
      tech.extras += extrasTotal;
      tech.parts += partsTotal;
      byTechnician.set(techId, tech);

      const product = byProduct.get(job.product.id) ?? { product: job.product, extras: 0, parts: 0 };
      product.extras += extrasTotal;
      product.parts += partsTotal;
      byProduct.set(job.product.id, product);
    }

    res.json({
      range: serializeWindow(window),
      totals: {
        extras: roundMoney(extras),
        parts: roundMoney(parts),
        running: roundMoney(extras + parts),
      },
      byTechnician: [...byTechnician.values()]
        .map((row) => ({
          ...row,
          extras: roundMoney(row.extras),
          parts: roundMoney(row.parts),
          total: roundMoney(row.extras + row.parts),
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
      byProduct: [...byProduct.values()]
        .map((row) => ({
          ...row.product,
          extras: roundMoney(row.extras),
          parts: roundMoney(row.parts),
          total: roundMoney(row.extras + row.parts),
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    });
  }),
);

reportsRouter.get(
  "/profit",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const grain = parseTrendGrain(req.query.grain, defaultGrain(window.preset));
    const jobs = await loadReportJobs(window);
    const money = moneyTotals(jobs);
    res.json({
      range: serializeWindow(window),
      grain,
      totals: money,
      trend: trendSeries(jobs, grain),
    });
  }),
);

reportsRouter.get(
  "/technicians",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const jobs = await loadReportJobs(window);
    const rows = new Map<
      string,
      {
        id: string;
        name: string;
        technicianType: TechnicianType | null;
        completed: number;
        hours: number[];
        ratings: number[];
        revenue: number;
      }
    >();

    for (const job of jobs) {
      const tech = job.assignedTechnician;
      if (!tech) continue;
      const row = rows.get(tech.id) ?? {
        id: tech.id,
        name: tech.name,
        technicianType: tech.technicianType,
        completed: 0,
        hours: [],
        ratings: [],
        revenue: 0,
      };
      if (isDoneStatus(job.status)) {
        row.completed += 1;
        row.revenue += jobRevenue(job);
        const hours = resolutionHours(job);
        if (hours != null) row.hours.push(hours);
      }
      if (job.rating != null) row.ratings.push(job.rating);
      rows.set(tech.id, row);
    }

    res.json({
      range: serializeWindow(window),
      rows: [...rows.values()]
        .map((row) => ({
          id: row.id,
          name: row.name,
          technicianType: row.technicianType,
          completed: row.completed,
          avgResolutionHours: average(row.hours),
          avgRating: average(row.ratings),
          ratingCount: row.ratings.length,
          revenue: roundMoney(row.revenue),
        }))
        .sort((a, b) => b.revenue - a.revenue || b.completed - a.completed || a.name.localeCompare(b.name)),
    });
  }),
);

reportsRouter.get(
  "/warranty",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const grain = parseTrendGrain(req.query.grain, defaultGrain(window.preset));
    const jobs = await loadReportJobs(window);
    let freeCount = 0;
    let paidCount = 0;
    let freeValue = 0;
    let paidValue = 0;
    const trend = new Map<string, { key: string; free: number; paid: number; freeValue: number; paidValue: number }>();

    for (const job of jobs) {
      if (!isDoneStatus(job.status)) continue;
      const key = bucketKey(job.createdAt, grain);
      const row = trend.get(key) ?? { key, free: 0, paid: 0, freeValue: 0, paidValue: 0 };
      const charged = jobRevenue(job);
      const waived = Math.max(0, job.estimatedCost - job.finalCost);
      if (isFreeWarranty(job)) {
        freeCount += 1;
        freeValue += waived;
        paidValue += charged;
        row.free += 1;
        row.freeValue += waived;
        row.paidValue += charged;
      } else {
        paidCount += 1;
        paidValue += charged;
        row.paid += 1;
        row.paidValue += charged;
      }
      trend.set(key, row);
    }

    res.json({
      range: serializeWindow(window),
      grain,
      totals: {
        freeCount,
        paidCount,
        freeValue: roundMoney(freeValue),
        paidValue: roundMoney(paidValue),
      },
      trend: [...trend.values()]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((row) => ({
          ...row,
          freeValue: roundMoney(row.freeValue),
          paidValue: roundMoney(row.paidValue),
        })),
    });
  }),
);

reportsRouter.get(
  "/sources",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const jobs = await loadReportJobs(window);
    const counts = { rizo_market: 0, rizo_service: 0, portal: 0 };

    for (const job of jobs) {
      if (job.source === "rizo_market") counts.rizo_market += 1;
      else if (job.submittedByCustomer) counts.portal += 1;
      else counts.rizo_service += 1;
    }

    res.json({
      range: serializeWindow(window),
      rows: [
        { source: "rizo_market", count: counts.rizo_market },
        { source: "rizo_service", count: counts.rizo_service },
        { source: "portal", count: counts.portal },
      ],
    });
  }),
);
