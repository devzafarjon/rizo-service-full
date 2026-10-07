import { tashkentCalendarDate } from "./displayId.js";
import { notifyAdmins } from "./notifyStaff.js";
import { prisma } from "./prisma.js";
import { average, loadReportJobs, moneyTotals } from "./reportJobs.js";
import { computeServiceKpis } from "./serviceKpis.js";
import { getSetting, getAppSettings, setSetting } from "./settings.js";
import { OPEN_STATUSES } from "./status.js";

/** A short summary of the last seven days for the admins (the bell and the admin Telegram chat). */
export async function sendWeeklyDigest(now = new Date()) {
  const to = now;
  const from = new Date(now.getTime() - 7 * 86_400_000);
  const jobs = await loadReportJobs({ preset: "custom", from, to });
  const money = moneyTotals(jobs);
  const kpis = await computeServiceKpis(jobs);
  const ratings = jobs.map((job) => job.rating).filter((value): value is number => value != null);
  const [open, overdue, legal] = await Promise.all([
    prisma.serviceRequest.count({ where: { status: { in: OPEN_STATUSES } } }),
    prisma.serviceRequest.count({ where: { overdueAt: { not: null }, status: { in: OPEN_STATUSES } } }),
    prisma.serviceRequest.count({ where: { legalDueAt: { lt: now }, status: { in: OPEN_STATUSES } } }),
  ]);
  const params = {
    from: tashkentCalendarDate(from),
    to: tashkentCalendarDate(to),
    created: jobs.length,
    finished: money.done,
    open,
    overdue,
    legalOverdue: legal,
    revenue: money.revenue,
    avgRating: average(ratings),
    firstTimeFixRate: kpis.firstTimeFixRate,
  };
  await notifyAdmins({
    message: `Week ${params.from} – ${params.to}: ${params.created} new, ${params.finished} finished, ${open} open, ${overdue} overdue`,
    code: "weeklyDigest",
    params,
  });
  return params;
}

/** Runs once on Monday morning (Tashkent), remembering the week it already sent so a restart does not repeat it. */
export async function maybeSendWeeklyDigest(now = new Date()) {
  if (!(await getAppSettings()).weeklyDigest) return false;
  const shifted = new Date(now.getTime() + 5 * 3_600_000);
  if (shifted.getUTCDay() !== 1 || shifted.getUTCHours() < 9) return false;
  const key = tashkentCalendarDate(now);
  if ((await getSetting("weekly_digest_last")) === key) return false;
  await setSetting("weekly_digest_last", key);
  await sendWeeklyDigest(now);
  return true;
}
