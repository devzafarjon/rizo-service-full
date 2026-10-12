import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { READ_MONEY } from "../lib/roles.js";
import { JOB_KEYS, describeSchedule, findAtRisk, getAutoSettings, lastSlot, runJob, updateAutoSettings, type JobKey } from "../lib/autoJobs.js";
import { readWriteRoles, requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const autoJobsRouter = Router();

const isKey = (value: string): value is JobKey => (JOB_KEYS as string[]).includes(value);

function serializeRun(row: { id: string; jobKey: string; trigger: string; ok: boolean; summary: unknown; error: string | null; ranByName: string | null; startedAt: Date; finishedAt: Date | null }) {
  return {
    id: row.id,
    jobKey: row.jobKey,
    trigger: row.trigger,
    ok: row.ok,
    summary: row.summary ?? null,
    error: row.error,
    ranByName: row.ranByName,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function serializeStatement(row: { id: string; periodFrom: Date; periodTo: Date; kind: string; jobs: number; jobsTotal: unknown; adjustmentsTotal: unknown; total: unknown; createdAt: Date; staffUser?: { id: string; name: string } }) {
  return {
    id: row.id,
    from: row.periodFrom.toISOString().slice(0, 10),
    to: row.periodTo.toISOString().slice(0, 10),
    kind: row.kind,
    jobs: row.jobs,
    jobsTotal: Number(row.jobsTotal),
    adjustmentsTotal: Number(row.adjustmentsTotal),
    total: Number(row.total),
    createdAt: row.createdAt.toISOString(),
    technician: row.staffUser ? { id: row.staffUser.id, name: row.staffUser.name } : null,
  };
}

/** A technician's own pay statements (all roles that have a pay rate see only their own). */
autoJobsRouter.get(
  "/my-statements",
  staffAuth,
  requireStaffRole("technician"),
  asyncHandler(async (req, res) => {
    const rows = await prisma.payrollStatement.findMany({ where: { staffUserId: req.staff!.sub }, orderBy: [{ periodTo: "desc" }, { createdAt: "desc" }], take: 30 });
    res.json({ statements: rows.map((row) => serializeStatement(row)) });
  }),
);

autoJobsRouter.get(
  "/at-risk",
  staffAuth,
  requireStaffRole("admin", "receptionist"),
  asyncHandler(async (_req, res) => {
    const settings = await getAutoSettings();
    res.json({ items: await findAtRisk(settings), warningPercent: settings.deadlineWarningPercent, legalWarningDays: settings.legalWarningDays });
  }),
);

autoJobsRouter.get(
  "/",
  staffAuth,
  readWriteRoles(READ_MONEY, ["admin"]),
  asyncHandler(async (_req, res) => {
    const settings = await getAutoSettings();
    const now = new Date();
    const jobs = [];
    for (const key of JOB_KEYS) {
      const [last, lastAuto] = await Promise.all([
        prisma.autoJobRun.findFirst({ where: { jobKey: key }, orderBy: { startedAt: "desc" } }),
        prisma.autoJobRun.findFirst({ where: { jobKey: key, trigger: "auto" }, orderBy: { startedAt: "desc" } }),
      ]);
      const slot = lastSlot(key, settings, now);
      jobs.push({
        key,
        schedule: describeSchedule(key, settings),
        enabled: { deadline_watch: settings.deadlineEnabled, daily_report: settings.dailyEnabled, weekly_digest: settings.weeklyEnabled, payroll_statements: settings.payrollEnabled }[key],
        lastRun: last ? serializeRun(last) : null,
        lastAutoRun: lastAuto ? serializeRun(lastAuto) : null,
        // A scheduled job that missed its slot (the server slept) runs by itself within a minute of waking.
        overdueSince: slot && (!lastAuto || lastAuto.startedAt < slot) && now.getTime() - slot.getTime() <= 12 * 3_600_000 ? slot.toISOString() : null,
      });
    }
    res.json({ settings, jobs });
  }),
);

autoJobsRouter.patch(
  "/settings",
  staffAuth,
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        deadlineEnabled: z.boolean().optional(),
        deadlineWarningPercent: z.coerce.number().int().min(5).max(90).optional(),
        legalWarningDays: z.coerce.number().int().min(0).max(20).optional(),
        dailyEnabled: z.boolean().optional(),
        dailyReportHour: z.coerce.number().int().min(0).max(23).optional(),
        payrollEnabled: z.boolean().optional(),
        payrollPeriod: z.enum(["weekly", "monthly"]).optional(),
        weeklyEnabled: z.boolean().optional(),
      }),
      req.body,
    );
    const before = await getAutoSettings();
    const settings = await updateAutoSettings(body);
    await writeAudit({ actor: staffActor(req.staff), action: "settings.update", entityType: "AppSetting", entityId: "auto-jobs", oldValue: before, newValue: settings });
    res.json({ settings });
  }),
);

autoJobsRouter.post(
  "/:key/run",
  staffAuth,
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    if (!isKey(req.params.key)) throw new HttpError(404, "Unknown job");
    const result = await runJob(req.params.key, { trigger: "manual", ranByName: req.staff!.name });
    await writeAudit({ actor: staffActor(req.staff), action: "autojob.run", entityType: "AutoJob", entityId: req.params.key, newValue: { ok: result.run.ok } });
    res.json({ run: serializeRun(result.run) });
  }),
);

autoJobsRouter.get(
  "/history",
  staffAuth,
  readWriteRoles(READ_MONEY, ["admin"]),
  asyncHandler(async (req, res) => {
    const key = typeof req.query.key === "string" && isKey(req.query.key) ? req.query.key : undefined;
    const rows = await prisma.autoJobRun.findMany({ where: key ? { jobKey: key } : {}, orderBy: { startedAt: "desc" }, take: 40 });
    res.json({ runs: rows.map(serializeRun) });
  }),
);

autoJobsRouter.get(
  "/statements",
  staffAuth,
  readWriteRoles(READ_MONEY, ["admin"]),
  asyncHandler(async (_req, res) => {
    const rows = await prisma.payrollStatement.findMany({ orderBy: [{ periodTo: "desc" }, { createdAt: "desc" }], take: 200, include: { staffUser: { select: { id: true, name: true } } } });
    res.json({ statements: rows.map((row) => serializeStatement(row)) });
  }),
);

