import type { Prisma } from "@prisma/client";
import { earningsFor } from "../routes/payroll.js";
import { tashkentCalendarDate, formatRequestId } from "./displayId.js";
import { prisma } from "./prisma.js";
import { average } from "./reportJobs.js";
import { sendWeeklyDigest } from "./digest.js";
import { notifyAdmins } from "./notifyStaff.js";
import { pushToStaff } from "./push.js";
import { getSetting, setSetting } from "./settings.js";
import { slaTimerFor } from "./sla.js";
import { DONE_STATUSES, OPEN_STATUSES } from "./status.js";

/**
 * Automatic jobs: what the system does by itself so that nobody has to write reports or watch the clock.
 * Every job can run by schedule and by the admin's "Run now" button; every run is logged (`auto_job_runs`).
 * A job whose scheduled time passed while the server slept (a free host sleeps) runs as soon as the server is awake again.
 */

export type JobKey = "deadline_watch" | "daily_report" | "weekly_digest" | "payroll_statements";
export const JOB_KEYS: JobKey[] = ["deadline_watch", "daily_report", "weekly_digest", "payroll_statements"];

const DAY = 86_400_000;
const TASHKENT_OFFSET_MS = 5 * 3_600_000;

const DEFAULTS = {
  auto_deadline_enabled: "true",
  deadline_warning_percent: "25", // warn when this share of a job's time is left
  legal_warning_days: "3", // warn when the legal repair limit is this close
  auto_daily_enabled: "true",
  daily_report_hour: "18",
  auto_payroll_enabled: "true",
  payroll_period: "weekly", // weekly (Monday for the week before) | monthly (the 1st for the month before)
} as const;
type SettingKey = keyof typeof DEFAULTS;

async function read(key: SettingKey) {
  return (await getSetting(key)) ?? DEFAULTS[key];
}

export async function getAutoSettings() {
  const [deadlineEnabled, warnPercent, legalDays, dailyEnabled, dailyHour, payrollEnabled, payrollPeriod, weekly] = await Promise.all([
    read("auto_deadline_enabled"),
    read("deadline_warning_percent"),
    read("legal_warning_days"),
    read("auto_daily_enabled"),
    read("daily_report_hour"),
    read("auto_payroll_enabled"),
    read("payroll_period"),
    getSetting("weekly_digest"),
  ]);
  return {
    deadlineEnabled: deadlineEnabled !== "false",
    deadlineWarningPercent: Number(warnPercent),
    legalWarningDays: Number(legalDays),
    dailyEnabled: dailyEnabled !== "false",
    dailyReportHour: Number(dailyHour),
    payrollEnabled: payrollEnabled !== "false",
    payrollPeriod: (payrollPeriod === "monthly" ? "monthly" : "weekly") as "weekly" | "monthly",
    weeklyEnabled: weekly !== "false",
  };
}
export type AutoSettings = Awaited<ReturnType<typeof getAutoSettings>>;

export async function updateAutoSettings(input: Partial<AutoSettings>) {
  const pairs: Array<[SettingKey | "weekly_digest", string | undefined]> = [
    ["auto_deadline_enabled", input.deadlineEnabled === undefined ? undefined : String(input.deadlineEnabled)],
    ["deadline_warning_percent", input.deadlineWarningPercent === undefined ? undefined : String(input.deadlineWarningPercent)],
    ["legal_warning_days", input.legalWarningDays === undefined ? undefined : String(input.legalWarningDays)],
    ["auto_daily_enabled", input.dailyEnabled === undefined ? undefined : String(input.dailyEnabled)],
    ["daily_report_hour", input.dailyReportHour === undefined ? undefined : String(input.dailyReportHour)],
    ["auto_payroll_enabled", input.payrollEnabled === undefined ? undefined : String(input.payrollEnabled)],
    ["payroll_period", input.payrollPeriod],
    ["weekly_digest", input.weeklyEnabled === undefined ? undefined : String(input.weeklyEnabled)],
  ];
  for (const [key, value] of pairs) if (value !== undefined) await setSetting(key, value);
  return getAutoSettings();
}

/* ---------- time helpers (Tashkent has no daylight saving: UTC+5) ---------- */

function tashkentParts(at: Date) {
  const shifted = new Date(at.getTime() + TASHKENT_OFFSET_MS);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours(), weekday: shifted.getUTCDay() };
}
function tashkentMidnight(day: string) {
  return new Date(`${day}T00:00:00+05:00`);
}
function addDays(day: string, days: number) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

/** The latest scheduled moment at or before `now` for a job, or null for a job that has no schedule (it runs every minute). */
export function lastSlot(key: JobKey, settings: AutoSettings, now: Date): Date | null {
  const { day, weekday } = tashkentParts(now);
  if (key === "daily_report") {
    const today = new Date(tashkentMidnight(day).getTime() + settings.dailyReportHour * 3_600_000);
    return today.getTime() <= now.getTime() ? today : new Date(today.getTime() - DAY);
  }
  if (key === "weekly_digest" || (key === "payroll_statements" && settings.payrollPeriod === "weekly")) {
    const sinceMonday = (weekday + 6) % 7;
    const monday = addDays(day, -sinceMonday);
    const at = new Date(tashkentMidnight(monday).getTime() + (key === "weekly_digest" ? 9 : 9.5) * 3_600_000);
    return at.getTime() <= now.getTime() ? at : new Date(at.getTime() - 7 * DAY);
  }
  if (key === "payroll_statements") {
    const first = `${day.slice(0, 8)}01`;
    const at = new Date(tashkentMidnight(first).getTime() + 9.5 * 3_600_000);
    if (at.getTime() <= now.getTime()) return at;
    const previous = new Date(`${first}T00:00:00Z`);
    previous.setUTCMonth(previous.getUTCMonth() - 1);
    return new Date(tashkentMidnight(previous.toISOString().slice(0, 10)).getTime() + 9.5 * 3_600_000);
  }
  return null;
}

/* ---------- notifications for a technician (push + a row, so the same warning is never sent twice) ---------- */

async function notifyTechnician(technicianId: string, input: { message: string; code: string; serviceRequestId?: string | null; params: Record<string, unknown> }) {
  const row = await prisma.notification.create({
    data: {
      audience: "staff",
      staffUserId: technicianId,
      serviceRequestId: input.serviceRequestId ?? null,
      message: input.message,
      code: input.code,
      params: input.params as Prisma.InputJsonValue,
    },
  });
  void pushToStaff(technicianId, { message: input.message, code: input.code, params: input.params, serviceRequestId: input.serviceRequestId, notificationId: row.id });
}

/* ---------- 1. deadline watch ---------- */

export type AtRiskItem = {
  id: string;
  displayId: string;
  product: string;
  status: string;
  priority: string;
  technician: { id: string; name: string } | null;
  kind: "sla" | "legal";
  remainingMs: number;
  percentLeft: number | null;
  startsAt: string | null;
  dueAt: string;
};

/** Open jobs whose time is running out: the status timer is close to its end, or the legal repair limit is near. Overdue jobs are not listed (they already alert). */
export async function findAtRisk(settings: AutoSettings, now = new Date()): Promise<AtRiskItem[]> {
  const open = await prisma.serviceRequest.findMany({
    where: { status: { in: OPEN_STATUSES } },
    include: { pauses: true, product: { select: { name: true } }, assignedTechnician: { select: { id: true, name: true } } },
  });
  const items: AtRiskItem[] = [];
  for (const job of open) {
    const technician = job.assignedTechnician ?? null;
    const base = { id: job.id, displayId: job.displayId, product: job.product.name, status: job.status, priority: job.priority, technician };
    const timer = slaTimerFor(job, now.getTime());
    let item: AtRiskItem | null = null;
    if (timer && !timer.isOverdue && timer.durationMs > 0) {
      const percentLeft = (timer.remainingMs / timer.durationMs) * 100;
      if (percentLeft <= settings.deadlineWarningPercent) {
        item = { ...base, kind: "sla", remainingMs: timer.remainingMs, percentLeft: Math.round(percentLeft), startsAt: timer.startsAt, dueAt: new Date(now.getTime() + timer.remainingMs).toISOString() };
      }
    }
    if (job.legalDueAt && job.legalDueAt.getTime() > now.getTime() && job.legalDueAt.getTime() - now.getTime() <= settings.legalWarningDays * DAY) {
      const remaining = job.legalDueAt.getTime() - now.getTime();
      if (!item || remaining < item.remainingMs) item = { ...base, kind: "legal", remainingMs: remaining, percentLeft: null, startsAt: null, dueAt: job.legalDueAt.toISOString() };
    }
    if (item) items.push(item);
  }
  return items.sort((a, b) => a.remainingMs - b.remainingMs);
}

/** Warns the technician (once per job and timer) before the deadline, and tells the admins once per run how many jobs are at risk. */
export async function runDeadlineWatch(now = new Date()) {
  const settings = await getAutoSettings();
  if (!settings.deadlineEnabled) return { skipped: true as const, scanned: 0, atRisk: 0, warned: 0 };
  const items = await findAtRisk(settings, now);
  const fresh: AtRiskItem[] = [];
  for (const item of items) {
    const marker = `${item.kind}:${item.kind === "sla" ? item.startsAt : item.dueAt}`;
    const already = await prisma.notification.count({ where: { code: { in: ["deadlineSoon", "deadlineLegal"] }, serviceRequestId: item.id, params: { path: ["marker"], equals: marker } } });
    if (already > 0) continue;
    const hoursLeft = Math.max(0, Math.round((item.remainingMs / 3_600_000) * 10) / 10);
    const params = { displayId: item.displayId, product: item.product, hoursLeft, kind: item.kind, marker };
    const message = `${formatRequestId(item.displayId)}: about ${hoursLeft} h left${item.kind === "legal" ? " until the legal repair limit" : ""}`;
    const code = item.kind === "legal" ? "deadlineLegal" : "deadlineSoon";
    if (item.technician) await notifyTechnician(item.technician.id, { message, code, serviceRequestId: item.id, params });
    else await prisma.notification.create({ data: { audience: "staff", staffUserId: null, serviceRequestId: item.id, message, code, params: params as Prisma.InputJsonValue } });
    fresh.push(item);
  }
  if (fresh.length > 0) {
    await notifyAdmins({
      message: `${fresh.length} job(s) are close to their deadline`,
      code: "deadlineSummary",
      params: { count: fresh.length, ids: fresh.slice(0, 3).map((item) => item.displayId), unassigned: fresh.filter((item) => !item.technician).length },
    });
  }
  return { skipped: false as const, scanned: items.length, atRisk: items.length, warned: fresh.length };
}

/* ---------- 2. daily report for the owner ---------- */

export async function buildDailyReport(now = new Date()) {
  const { day } = tashkentParts(now);
  const from = tashkentMidnight(day);
  const settings = await getAutoSettings();
  const finishedToday = { completedAt: { gte: from, lte: now }, status: { in: DONE_STATUSES } };
  const [open, overdue, partsWaiting, atRisk, created, finishedRows, collected, ratings] = await Promise.all([
    prisma.serviceRequest.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.serviceRequest.count({ where: { overdueAt: { not: null }, status: { in: OPEN_STATUSES } } }),
    prisma.serviceRequest.count({ where: { status: "awaiting_parts" } }),
    findAtRisk(settings, now).then((rows) => rows.length),
    prisma.serviceRequest.count({ where: { createdAt: { gte: from, lte: now } } }),
    prisma.serviceRequest.findMany({ where: finishedToday, select: { finalCost: true, assignedTechnician: { select: { name: true } } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: from, lte: now }, kind: "payment" } }).then((row) => Number(row._sum.amount ?? 0)),
    prisma.feedback.findMany({ where: { createdAt: { gte: from, lte: now } }, select: { rating: true } }),
  ]);
  const byTech = new Map<string, number>();
  for (const row of finishedRows) {
    const name = row.assignedTechnician?.name;
    if (name) byTech.set(name, (byTech.get(name) ?? 0) + 1);
  }
  const top = [...byTech.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    date: day,
    created,
    finished: finishedRows.length,
    open,
    overdue,
    atRisk,
    partsWaiting,
    revenue: Math.round(finishedRows.reduce((sum, row) => sum + Number(row.finalCost ?? 0), 0)),
    collected: Math.round(collected),
    avgRating: average(ratings.map((row) => row.rating)),
    topTechnician: top ? { name: top[0], done: top[1] } : null,
  };
}

export async function runDailyReport(now = new Date()) {
  const report = await buildDailyReport(now);
  await notifyAdmins({
    message: `Daily report ${report.date}: ${report.created} new, ${report.finished} finished, ${report.open} open, ${report.overdue} overdue`,
    code: "dailyReport",
    params: report as unknown as Record<string, unknown>,
  });
  return report;
}

/* ---------- 3. weekly digest (existing) ---------- */

export async function runWeeklyDigest(now = new Date()) {
  return sendWeeklyDigest(now);
}

/* ---------- 4. payroll statements ---------- */

export async function runPayrollStatements(now = new Date(), trigger: "auto" | "manual" = "auto") {
  const settings = await getAutoSettings();
  const { day } = tashkentParts(now);
  let fromDay: string;
  let toDay: string;
  let windowTo: Date;
  if (trigger === "manual") {
    // "Run now" shows the pay of the last seven days up to this moment, so there is always something to look at.
    toDay = day;
    fromDay = addDays(day, -6);
    windowTo = now;
  } else if (settings.payrollPeriod === "monthly") {
    const first = `${day.slice(0, 8)}01`;
    toDay = addDays(first, -1);
    fromDay = `${toDay.slice(0, 8)}01`;
    windowTo = new Date(tashkentMidnight(addDays(toDay, 1)).getTime() - 1);
  } else {
    const sinceMonday = (tashkentParts(now).weekday + 6) % 7;
    const thisMonday = addDays(day, -sinceMonday);
    fromDay = addDays(thisMonday, -7);
    toDay = addDays(thisMonday, -1);
    windowTo = new Date(tashkentMidnight(thisMonday).getTime() - 1);
  }
  const windowFrom = tashkentMidnight(fromDay);
  const technicians = await prisma.staffUser.findMany({ where: { role: "technician", isActive: true }, orderBy: { name: "asc" } });
  const rows: Array<{ id: string; name: string; jobs: number; total: number }> = [];
  for (const technician of technicians) {
    const result = await earningsFor(technician.id, { from: windowFrom, to: windowTo } as never);
    const data = { kind: trigger, jobs: result.jobs.length, jobsTotal: result.jobsTotal, adjustmentsTotal: result.adjustmentsTotal, total: result.total };
    await prisma.payrollStatement.upsert({
      where: { staffUserId_periodFrom_periodTo: { staffUserId: technician.id, periodFrom: new Date(`${fromDay}T00:00:00Z`), periodTo: new Date(`${toDay}T00:00:00Z`) } },
      update: data,
      create: { staffUserId: technician.id, periodFrom: new Date(`${fromDay}T00:00:00Z`), periodTo: new Date(`${toDay}T00:00:00Z`), ...data },
    });
    rows.push({ id: technician.id, name: technician.name, jobs: result.jobs.length, total: result.total });
    if (result.jobs.length > 0 || result.adjustmentsTotal !== 0) {
      await notifyTechnician(technician.id, {
        message: `Your pay for ${fromDay} – ${toDay} is ready: ${Math.round(result.total)}`,
        code: "payrollStatement",
        params: { from: fromDay, to: toDay, jobs: result.jobs.length, total: Math.round(result.total) },
      });
    }
  }
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
  await notifyAdmins({
    message: `Payroll ${fromDay} – ${toDay}: ${rows.length} technicians, total ${Math.round(grandTotal)}`,
    code: "payrollSummary",
    params: { from: fromDay, to: toDay, technicians: rows.length, total: Math.round(grandTotal) },
  });
  return { from: fromDay, to: toDay, kind: trigger, technicians: rows.length, total: Math.round(grandTotal), rows };
}

/* ---------- registry, logging, scheduling ---------- */

async function execute(key: JobKey, trigger: "auto" | "manual", now: Date): Promise<unknown> {
  switch (key) {
    case "deadline_watch":
      return runDeadlineWatch(now);
    case "daily_report":
      return runDailyReport(now);
    case "weekly_digest":
      return runWeeklyDigest(now);
    case "payroll_statements":
      return runPayrollStatements(now, trigger);
  }
}

export async function runJob(key: JobKey, input: { trigger: "auto" | "manual"; ranByName?: string; now?: Date; log?: boolean }) {
  const now = input.now ?? new Date();
  const run = await prisma.autoJobRun.create({ data: { jobKey: key, trigger: input.trigger, ranByName: input.ranByName ?? null, startedAt: now } });
  try {
    const summary = await execute(key, input.trigger, now);
    const done = await prisma.autoJobRun.update({ where: { id: run.id }, data: { ok: true, summary: summary as Prisma.InputJsonValue, finishedAt: new Date() } });
    return { run: done, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await prisma.autoJobRun.update({ where: { id: run.id }, data: { ok: false, error: message.slice(0, 500), finishedAt: new Date() } });
    return { run: failed, summary: null, error: message };
  }
}

function enabled(key: JobKey, settings: AutoSettings) {
  return { deadline_watch: settings.deadlineEnabled, daily_report: settings.dailyEnabled, weekly_digest: settings.weeklyEnabled, payroll_statements: settings.payrollEnabled }[key];
}

/** Called every minute. Runs each scheduled job whose slot has passed without an automatic run; the deadline watch runs every time. */
export async function tickAutoJobs(now = new Date()) {
  const settings = await getAutoSettings();
  const ran: JobKey[] = [];
  for (const key of JOB_KEYS) {
    if (!enabled(key, settings)) continue;
    if (key === "deadline_watch") {
      // Quiet by default: only a run that warned someone (or failed) is written to the log.
      const result = await runDeadlineWatch(now).catch((error) => {
        console.error("[deadline-watch]", error);
        return null;
      });
      if (result && !result.skipped && result.warned > 0) {
        await prisma.autoJobRun.create({ data: { jobKey: key, trigger: "auto", ok: true, summary: result as Prisma.InputJsonValue, startedAt: now, finishedAt: new Date() } });
        ran.push(key);
      }
      continue;
    }
    const slot = lastSlot(key, settings, now);
    if (!slot) continue;
    const last = await prisma.autoJobRun.findFirst({ where: { jobKey: key, trigger: "auto" }, orderBy: { startedAt: "desc" } });
    // Never run a job for the first time long after its slot (a fresh install must not fire last week's report).
    const due = last ? last.startedAt.getTime() < slot.getTime() : now.getTime() - slot.getTime() <= 12 * 3_600_000;
    if (!due) continue;
    await runJob(key, { trigger: "auto", now });
    ran.push(key);
  }
  return ran;
}

export function describeSchedule(key: JobKey, settings: AutoSettings) {
  switch (key) {
    case "deadline_watch":
      return { type: "minutely" as const };
    case "daily_report":
      return { type: "daily" as const, hour: settings.dailyReportHour };
    case "weekly_digest":
      return { type: "weekly" as const, weekday: 1, hour: 9 };
    case "payroll_statements":
      return settings.payrollPeriod === "monthly" ? { type: "monthly" as const, day: 1, hour: 9.5 } : { type: "weekly" as const, weekday: 1, hour: 9.5 };
  }
}

export { tashkentCalendarDate };
