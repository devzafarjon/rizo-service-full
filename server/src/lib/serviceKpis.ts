import { prisma } from "./prisma.js";
import { average, jobCost, roundMoney, type ReportJob } from "./reportJobs.js";
import { isDoneStatus } from "./status.js";
import { money } from "./warranty.js";

const HOUR = 3_600_000;

/**
 * Service-quality figures for the jobs of a report window.
 *  - First-time fix: a finished repair that needed no part order and was not followed by a repeat request
 *    (a customer coming back for the same unit). Installations do not count.
 *  - Callback rate: finished repairs that were followed by a repeat request.
 *  - Callback cost: parts and extras spent on those repeat requests.
 *  - Time per status: how long finished jobs stayed in each status (from the audit trail), and how long
 *    they waited for parts or for the customer's decision.
 */
export async function computeServiceKpis(jobs: ReportJob[]) {
  const repairs = jobs.filter((job) => job.type === "repair" && isDoneStatus(job.status));
  const ids = repairs.map((job) => job.id);

  const [partOrders, repeats] = ids.length
    ? await Promise.all([
        prisma.partOrder.findMany({ where: { serviceRequestId: { in: ids } }, select: { serviceRequestId: true } }),
        prisma.serviceRequest.findMany({
          where: { repeatOfId: { in: ids } },
          select: {
            repeatOfId: true,
            partLines: { select: { quantity: true, costAtTime: true } },
            extraExpenses: { select: { price: true } },
          },
        }),
      ])
    : [[], []];

  const needsParts = new Set(partOrders.map((row) => row.serviceRequestId));
  const hasRepeat = new Set(repeats.map((row) => row.repeatOfId));
  let firstTimeFixed = 0;
  for (const job of repairs) {
    if (!needsParts.has(job.id) && !hasRepeat.has(job.id)) firstTimeFixed += 1;
  }
  const callbackCost = repeats.reduce(
    (sum, row) => sum + row.partLines.reduce((acc, line) => acc + money(line.costAtTime) * line.quantity, 0) + row.extraExpenses.reduce((acc, line) => acc + money(line.price), 0),
    0,
  );

  const statusHours = await timeInStatus(jobs.filter((job) => isDoneStatus(job.status)).map((job) => job.id));
  return {
    repairsFinished: repairs.length,
    firstTimeFixRate: repairs.length ? Math.round((firstTimeFixed / repairs.length) * 1000) / 10 : null,
    callbackRate: repairs.length ? Math.round((repeats.filter((row, index, all) => all.findIndex((other) => other.repeatOfId === row.repeatOfId) === index).length / repairs.length) * 1000) / 10 : null,
    callbackCost: roundMoney(callbackCost),
    statusHours,
    avgPartsWaitHours: statusHours.find((row) => row.status === "awaiting_parts")?.hours ?? null,
    avgDecisionWaitHours: statusHours.find((row) => row.status === "awaiting_decision")?.hours ?? null,
    jobsCost: roundMoney(repairs.reduce((sum, job) => sum + jobCost(job), 0)),
  };
}

/** Average hours spent in each status by the given jobs, replayed from the audit trail. */
async function timeInStatus(ids: string[]) {
  if (ids.length === 0) return [] as Array<{ status: string; hours: number; jobs: number }>;
  const subset = ids.slice(0, 600);
  const [requests, trail] = await Promise.all([
    prisma.serviceRequest.findMany({ where: { id: { in: subset } }, select: { id: true, createdAt: true, completedAt: true } }),
    prisma.auditLog.findMany({
      where: { entityType: "ServiceRequest", entityId: { in: subset }, action: "request.status" },
      orderBy: { createdAt: "asc" },
      select: { entityId: true, createdAt: true, newValue: true },
    }),
  ]);
  const byJob = new Map<string, Array<{ at: Date; status: string }>>();
  for (const row of trail) {
    const status = (row.newValue as { status?: string } | null)?.status;
    if (!status) continue;
    const list = byJob.get(row.entityId) ?? [];
    list.push({ at: row.createdAt, status });
    byJob.set(row.entityId, list);
  }
  const totals = new Map<string, { sum: number; jobs: Set<string> }>();
  for (const request of requests) {
    const steps = [{ at: request.createdAt, status: "new" }, ...(byJob.get(request.id) ?? [])];
    for (let i = 0; i < steps.length - 1; i += 1) {
      const hours = (steps[i + 1].at.getTime() - steps[i].at.getTime()) / HOUR;
      if (hours < 0) continue;
      const row = totals.get(steps[i].status) ?? { sum: 0, jobs: new Set<string>() };
      row.sum += hours;
      row.jobs.add(request.id);
      totals.set(steps[i].status, row);
    }
  }
  return [...totals.entries()]
    .map(([status, row]) => ({ status, hours: average([row.sum / row.jobs.size]) ?? 0, jobs: row.jobs.size }))
    .sort((a, b) => b.hours - a.hours);
}
