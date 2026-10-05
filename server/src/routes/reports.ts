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
import { isDoneStatus, ALL_STATUSES } from "../lib/status.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { OPEN_STATUSES } from "../lib/status.js";
import { serializeNamed } from "../lib/named.js";
import { money as toMoney } from "../lib/warranty.js";

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
    for (const status of ALL_STATUSES) statusCounts.set(status, 0);
    for (const job of jobs) {
      statusCounts.set(job.status, (statusCounts.get(job.status) ?? 0) + 1);
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

    // The same numbers for the period just before, so the cards can show the change.
    let previous: { requests: number; revenue: number; profit: number } | null = null;
    if (window.from) {
      const span = window.to.getTime() - window.from.getTime();
      const prevWindow = { ...window, from: new Date(window.from.getTime() - span - 1), to: new Date(window.from.getTime() - 1) };
      const prevJobs = await loadReportJobs(prevWindow);
      const prevMoney = moneyTotals(prevJobs);
      previous = { requests: prevJobs.length, revenue: prevMoney.revenue, profit: prevMoney.profit };
    }
    const [legalOverdue, debtRows, workedRows] = await Promise.all([
      prisma.serviceRequest.count({ where: { legalDueAt: { lt: new Date() }, status: { in: OPEN_STATUSES } } }),
      prisma.serviceRequest.findMany({ where: { finalCost: { gt: 0 }, status: { in: ["ready", "completed", "picked_up", "replaced"] } }, select: { finalCost: true, payments: { select: { kind: true, amount: true } } } }),
      jobs.filter((job) => job.workedMinutes != null).map((job) => job.workedMinutes as number),
    ]);
    const debt = debtRows.reduce((sum, row) => {
      const paidSum = row.payments.reduce((acc, pay) => acc + (pay.kind === "payment" ? toMoney(pay.amount) : -toMoney(pay.amount)), 0);
      return sum + Math.max(0, toMoney(row.finalCost ?? 0) - paidSum);
    }, 0);

    res.json({
      range: serializeWindow(window),
      grain,
      previous,
      totals: {
        requests: jobs.length,
        revenue: money.revenue,
        profit: money.profit,
        costs: money.costs,
        avgResolutionHours: average(hours),
        avgWorkMinutes: average(workedRows),
        avgRating: average(ratings),
        ratingCount: ratings.length,
        legalOverdue,
        debt: roundMoney(debt),
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
      byStatus: ALL_STATUSES.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })).filter((row) => row.count > 0),
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

// ---- Defects: which codes, which products, which categories fail (claim rate = repairs / units sold) ----
reportsRouter.get(
  "/defects",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const jobs = (await loadReportJobs(window)).filter((job) => job.type === "repair");
    const sold = await prisma.sale.groupBy({ by: ["productId"], _sum: { quantity: true } });
    const soldByProduct = new Map(sold.map((row) => [row.productId, row._sum.quantity ?? 0]));

    const codes = new Map<string, { id: string; code: string; names: ReturnType<typeof serializeNamed>; count: number; category: Map<string, number> }>();
    const products = new Map<string, { product: (typeof jobs)[number]["product"]; repairs: number; repeats: number }>();
    let uncoded = 0;
    for (const job of jobs) {
      const row = products.get(job.product.id) ?? { product: job.product, repairs: 0, repeats: 0 };
      row.repairs += 1;
      if (job.isRepeat) row.repeats += 1;
      products.set(job.product.id, row);
      if (job.defectCode) {
        const code = codes.get(job.defectCode.id) ?? { id: job.defectCode.id, code: job.defectCode.code, names: serializeNamed(job.defectCode), count: 0, category: new Map() };
        code.count += 1;
        code.category.set(job.product.category, (code.category.get(job.product.category) ?? 0) + 1);
        codes.set(job.defectCode.id, code);
      } else uncoded += 1;
    }
    res.json({
      range: serializeWindow(window),
      total: jobs.length,
      uncoded,
      codes: [...codes.values()]
        .map((row) => ({ id: row.id, code: row.code, ...row.names, count: row.count, categories: [...row.category.entries()].map(([category, count]) => ({ category, count })) }))
        .sort((a, b) => b.count - a.count),
      products: [...products.values()]
        .map((row) => {
          const units = soldByProduct.get(row.product.id) ?? 0;
          return { ...row.product, repairs: row.repairs, repeats: row.repeats, unitsSold: units, claimRate: units > 0 ? roundMoney((row.repairs / units) * 100) : null };
        })
        .sort((a, b) => b.repairs - a.repairs),
    });
  }),
);

// ---- Outcomes: what a repair, a replacement and a refund each cost ----
reportsRouter.get(
  "/outcomes",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const jobs = (await loadReportJobs(window)).filter((job) => job.type === "repair");
    const rows = new Map<string, { outcome: string; count: number; charged: number; cost: number }>();
    for (const job of jobs) {
      let outcome: string | null = null;
      if (job.status === "replaced") outcome = "replace";
      else if (job.status === "refunded") outcome = "refund";
      else if (job.status === "rejected") outcome = "reject";
      else if (isDoneStatus(job.status)) outcome = "repair";
      if (!outcome) continue;
      const row = rows.get(outcome) ?? { outcome, count: 0, charged: 0, cost: 0 };
      row.count += 1;
      row.charged += job.finalCost;
      row.cost += jobCost(job);
      rows.set(outcome, row);
    }
    res.json({
      range: serializeWindow(window),
      rows: ["repair", "replace", "refund", "reject"].map((key) => {
        const row = rows.get(key) ?? { outcome: key, count: 0, charged: 0, cost: 0 };
        return { outcome: key, count: row.count, charged: roundMoney(row.charged), cost: roundMoney(row.cost), avgCost: row.count ? roundMoney(row.cost / row.count) : 0 };
      }),
    });
  }),
);

// ---- Debts: finished jobs with an unpaid balance ----
reportsRouter.get(
  "/debts",
  asyncHandler(async (_req, res) => {
    const requests = await prisma.serviceRequest.findMany({
      where: { finalCost: { gt: 0 }, status: { in: ["ready", "completed", "picked_up", "replaced"] } },
      include: { customer: { select: { id: true, name: true, phone: true } }, payments: { select: { kind: true, amount: true } }, product: true },
      orderBy: { completedAt: "asc" },
    });
    const rows = requests
      .map((request) => {
        const paid = request.payments.reduce((acc, pay) => acc + (pay.kind === "payment" ? toMoney(pay.amount) : -toMoney(pay.amount)), 0);
        const due = toMoney(request.finalCost ?? 0);
        return {
          id: request.id,
          displayId: request.displayId,
          status: request.status,
          completedAt: request.completedAt?.toISOString() ?? null,
          customer: request.customer,
          product: { ...serializeNamed(request.product) },
          due,
          paid,
          balance: Math.max(0, due - paid),
        };
      })
      .filter((row) => row.balance > 0)
      .sort((a, b) => b.balance - a.balance);
    const byCustomer = new Map<string, { customer: (typeof rows)[number]["customer"]; balance: number; jobs: number }>();
    for (const row of rows) {
      const entry = byCustomer.get(row.customer.id) ?? { customer: row.customer, balance: 0, jobs: 0 };
      entry.balance += row.balance;
      entry.jobs += 1;
      byCustomer.set(row.customer.id, entry);
    }
    res.json({
      total: roundMoney(rows.reduce((sum, row) => sum + row.balance, 0)),
      rows,
      customers: [...byCustomer.values()].sort((a, b) => b.balance - a.balance),
    });
  }),
);

// ---- Legal deadline: repairs against the 20-day limit ----
reportsRouter.get(
  "/legal",
  asyncHandler(async (req, res) => {
    const window = parseReportRange(req.query);
    const repairs = await prisma.serviceRequest.findMany({
      where: { type: "repair", legalDueAt: { not: null }, createdAt: { gte: window.from ?? new Date(0), lte: window.to } },
      include: { customer: { select: { name: true, phone: true } }, product: true, assignedTechnician: { select: { name: true } } },
      orderBy: { legalDueAt: "asc" },
    });
    const now = Date.now();
    const rows = repairs.map((request) => {
      const finished = isDoneStatus(request.status) || request.status === "rejected" || request.status === "refunded";
      const end = finished ? (request.completedAt?.getTime() ?? now) : now;
      const dueAt = request.legalDueAt!.getTime();
      return {
        id: request.id,
        displayId: request.displayId,
        status: request.status,
        customer: request.customer,
        product: serializeNamed(request.product),
        technician: request.assignedTechnician?.name ?? null,
        createdAt: request.createdAt.toISOString(),
        legalDueAt: request.legalDueAt!.toISOString(),
        finished,
        days: roundMoney((end - request.createdAt.getTime()) / 86_400_000),
        lateDays: end > dueAt ? roundMoney((end - dueAt) / 86_400_000) : 0,
        late: end > dueAt,
      };
    });
    const finishedRows = rows.filter((row) => row.finished);
    res.json({
      range: serializeWindow(window),
      total: rows.length,
      late: rows.filter((row) => row.late).length,
      onTimeRate: finishedRows.length ? roundMoney((finishedRows.filter((row) => !row.late).length / finishedRows.length) * 100) : null,
      avgDays: average(finishedRows.map((row) => row.days)),
      rows: rows.filter((row) => row.late || !row.finished).sort((a, b) => b.lateDays - a.lateDays),
    });
  }),
);
