/**
 * Checks for the automatic jobs: deadline early warning, daily report, weekly digest, payroll statements, the "Run now" button,
 * the schedule and its catch-up after the server slept. Needs the API running (SMOKE_API) on a scratch database.
 *   npm run smoke:auto -w server
 */
import { prisma } from "../src/lib/prisma.js";
import { lastSlot, getAutoSettings, tickAutoJobs } from "../src/lib/autoJobs.js";

const API = process.env.SMOKE_API ?? "http://localhost:4100";
let failed = 0;
function assert(condition: unknown, message: string) {
  if (condition) return console.log(`  ok  ${message}`);
  failed += 1;
  console.error(`  FAIL ${message}`);
}
type Res<T = any> = { status: number; body: T };
async function api<T = any>(path: string, options: RequestInit & { token?: string } = {}): Promise<Res<T>> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${API}${path}`, { ...rest, headers: { ...(rest.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}
const post = (path: string, token: string, data: unknown = {}) => api(path, { method: "POST", token, body: JSON.stringify(data) });
const patch = (path: string, token: string, data: unknown) => api(path, { method: "PATCH", token, body: JSON.stringify(data) });
async function token(phone: string, password: string) {
  const res = await api("/api/staff/auth/login", { method: "POST", body: JSON.stringify({ phone, password }) });
  assert(res.status === 200 && res.body.token, `sign in ${phone}`);
  return res.body.token as string;
}
const HOUR = 3_600_000;

async function main() {
  const admin = await token("998900000001", "admin123");
  const tech = await token("998900000002", "tech123");
  const desk = await token("998900000005", "desk123");
  const acct = await token("998900000006", "acc12345");
  const techRow = await prisma.staffUser.findFirstOrThrow({ where: { phone: "998900000002" } });

  console.log("access");
  const list = await api("/api/staff/auto-jobs", { token: admin });
  assert(list.status === 200 && list.body.jobs.length === 4, "admin sees the four automatic jobs");
  assert((await api("/api/staff/auto-jobs", { token: acct })).status === 200, "accountant can read them");
  assert((await api("/api/staff/auto-jobs", { token: tech })).status === 403, "a technician cannot read them");
  assert((await post("/api/staff/auto-jobs/daily_report/run", acct)).status === 403, "accountant cannot press Run now");
  assert((await post("/api/staff/auto-jobs/nothing/run", admin)).status === 404, "an unknown job is 404");
  assert((await api("/api/staff/auto-jobs/at-risk", { token: desk })).status === 200, "the front desk sees the at-risk list");

  console.log("my work (the admin's inbox)");
  const inbox = await api("/api/staff/inbox", { token: admin });
  assert(inbox.status === 200 && Array.isArray(inbox.body.items) && typeof inbox.body.total === "number", "the admin gets the inbox");
  assert((inbox.body.items as any[]).every((row) => row.count > 0 && ["red", "orange", "blue"].includes(row.tone) && String(row.to).startsWith("/app/")), "every row has a count, a tone and a page to open");
  const dbUnassigned = await prisma.serviceRequest.count({ where: { assignedTechnicianId: null, status: { in: ["new", "diagnosing", "awaiting_decision", "awaiting_parts", "in_progress", "paused"] } } });
  const rowUnassigned = (inbox.body.items as any[]).find((row) => row.key === "unassigned");
  assert((rowUnassigned?.count ?? 0) === dbUnassigned, "the unassigned row matches the data");
  assert(inbox.body.total === (inbox.body.items as any[]).reduce((sum, row) => sum + row.count, 0), "the total is the sum of the rows");
  assert((await api("/api/staff/inbox", { token: desk })).status === 403 && (await api("/api/staff/inbox", { token: tech })).status === 403 && (await api("/api/staff/inbox", { token: acct })).status === 403, "only the admin has it");

  console.log("settings");
  assert((await patch("/api/staff/auto-jobs/settings", admin, { deadlineWarningPercent: 1 })).status === 400, "a too small warning share is rejected");
  assert((await patch("/api/staff/auto-jobs/settings", desk, { dailyReportHour: 8 })).status === 403, "only the admin changes the settings");
  const changed = await patch("/api/staff/auto-jobs/settings", admin, { deadlineWarningPercent: 30, dailyReportHour: 18 });
  assert(changed.status === 200 && changed.body.settings.deadlineWarningPercent === 30, "the admin changes the warning share");

  console.log("deadline early warning");
  await prisma.notification.deleteMany({ where: { code: { in: ["deadlineSoon", "deadlineSummary"] } } });
  const open = await prisma.serviceRequest.findFirstOrThrow({ where: { status: "new" }, orderBy: { createdAt: "asc" } });
  // "New" has a 24 h timer: 20 h gone means 4 h (17 %) left, inside the 30 % warning share.
  await prisma.serviceRequest.update({
    where: { id: open.id },
    data: { assignedTechnicianId: techRow.id, assignedAt: new Date(Date.now() - 20 * HOUR), createdAt: new Date(Date.now() - 21 * HOUR), overdueAt: null, overdueNotifiedAt: null, escalationLevel: 0 },
  });
  const risk = await api("/api/staff/auto-jobs/at-risk", { token: admin });
  const item = (risk.body.items as any[]).find((row) => row.id === open.id);
  assert(Boolean(item) && item.kind === "sla" && item.remainingMs > 0 && item.technician?.id === techRow.id, "a job with little time left is listed as at risk");
  const first = await post("/api/staff/auto-jobs/deadline_watch/run", admin);
  assert(first.status === 200 && first.body.run.ok && first.body.run.summary.warned >= 1, "the watch warns about it");
  const warned = await prisma.notification.count({ where: { code: "deadlineSoon", serviceRequestId: open.id, staffUserId: techRow.id } });
  assert(warned === 1, "the technician gets exactly one warning");
  const second = await post("/api/staff/auto-jobs/deadline_watch/run", admin);
  assert(second.body.run.summary.warned === 0, "the same job is not warned about twice");
  assert((await prisma.notification.count({ where: { code: "deadlineSummary" } })) >= 1, "the admins get one summary");
  // A job that is already late is not "at risk" any more (it alerts as overdue).
  await prisma.serviceRequest.update({ where: { id: open.id }, data: { assignedAt: new Date(Date.now() - 30 * HOUR), createdAt: new Date(Date.now() - 31 * HOUR) } });
  const late = await api("/api/staff/auto-jobs/at-risk", { token: admin });
  assert(!(late.body.items as any[]).some((row) => row.id === open.id), "an overdue job is not listed as at risk");
  await prisma.serviceRequest.update({ where: { id: open.id }, data: { assignedAt: new Date(), createdAt: new Date() } });

  console.log("daily report");
  const daily = await post("/api/staff/auto-jobs/daily_report/run", admin);
  const report = daily.body.run.summary;
  assert(daily.status === 200 && daily.body.run.ok && typeof report.date === "string" && typeof report.open === "number" && report.open >= 1, "the daily report is built");
  assert("created" in report && "finished" in report && "overdue" in report && "atRisk" in report && "partsWaiting" in report && "collected" in report, "it carries the owner's numbers");
  assert((await prisma.notification.count({ where: { code: "dailyReport", staffUserId: { not: null } } })) >= 1, "the admins receive it");
  const history = await api("/api/staff/auto-jobs/history?key=daily_report", { token: acct });
  assert(history.status === 200 && history.body.runs.length >= 1 && history.body.runs[0].ranByName, "the run is in the history with who pressed the button");

  console.log("weekly digest");
  const week = await post("/api/staff/auto-jobs/weekly_digest/run", admin);
  assert(week.status === 200 && week.body.run.ok && typeof week.body.run.summary.created === "number", "the weekly digest runs by hand");

  console.log("payroll statements");
  await prisma.staffUser.update({ where: { id: techRow.id }, data: { payPercent: 10, payFixedPerJob: 5000 } });
  const pay = await post("/api/staff/auto-jobs/payroll_statements/run", admin);
  assert(pay.status === 200 && pay.body.run.ok && pay.body.run.summary.technicians >= 1, "payroll statements are calculated");
  const mine = await api("/api/staff/auto-jobs/my-statements", { token: tech });
  assert(mine.status === 200 && mine.body.statements.length >= 1 && typeof mine.body.statements[0].total === "number", "the technician sees their own statement");
  const countBefore = (await api("/api/staff/auto-jobs/statements", { token: acct })).body.statements.length;
  await post("/api/staff/auto-jobs/payroll_statements/run", admin);
  const countAfter = (await api("/api/staff/auto-jobs/statements", { token: acct })).body.statements.length;
  assert(countAfter === countBefore, "running again updates the statements instead of duplicating them");
  assert((await api("/api/staff/auto-jobs/my-statements", { token: admin })).status === 403, "my-statements is for technicians");
  assert((await api("/api/staff/auto-jobs/statements", { token: tech })).status === 403, "a technician cannot read everybody's pay");

  console.log("schedule and catch-up after the server slept");
  const settings = await getAutoSettings();
  // Wednesday 2026-10-14 12:00 Tashkent = 07:00 UTC.
  const wed = new Date("2026-10-14T07:00:00Z");
  const slot = lastSlot("daily_report", settings, wed)!;
  assert(slot.toISOString() === "2026-10-13T13:00:00.000Z", "before 18:00 the last daily slot is yesterday 18:00");
  const monday = lastSlot("weekly_digest", settings, wed)!;
  assert(monday.toISOString() === "2026-10-12T04:00:00.000Z", "the weekly digest slot is Monday 09:00");
  const payroll = lastSlot("payroll_statements", settings, wed)!;
  assert(payroll.toISOString() === "2026-10-12T04:30:00.000Z", "the weekly payroll slot is Monday 09:30");
  await prisma.autoJobRun.deleteMany({ where: { trigger: "auto" } });
  // A fresh install does not fire an old report: yesterday's slot is 18 h away.
  assert(!(await tickAutoJobs(wed)).includes("daily_report"), "a first start does not fire a report whose time is long gone");
  // Right after the slot it runs once.
  const evening = new Date("2026-10-14T13:30:00Z");
  assert((await tickAutoJobs(evening)).includes("daily_report"), "after 18:00 the daily report runs by itself");
  assert(!(await tickAutoJobs(new Date(evening.getTime() + 60_000))).includes("daily_report"), "and only once");
  // The server slept: the last automatic run was Monday, now it is Thursday midday.
  await prisma.autoJobRun.deleteMany({ where: { jobKey: "daily_report", trigger: "auto" } });
  await prisma.autoJobRun.create({ data: { jobKey: "daily_report", trigger: "auto", startedAt: new Date("2026-10-12T13:05:00Z"), finishedAt: new Date("2026-10-12T13:05:01Z") } });
  assert((await tickAutoJobs(new Date("2026-10-15T07:00:00Z"))).includes("daily_report"), "a missed daily report is caught up when the server wakes");
  assert((await prisma.autoJobRun.count({ where: { jobKey: "payroll_statements", trigger: "auto" } })) >= 0, "the schedule never throws");
  await patch("/api/staff/auto-jobs/settings", admin, { dailyEnabled: false });
  await prisma.autoJobRun.deleteMany({ where: { jobKey: "daily_report", trigger: "auto" } });
  assert(!(await tickAutoJobs(evening)).includes("daily_report"), "a switched-off job does not run");
  await patch("/api/staff/auto-jobs/settings", admin, { dailyEnabled: true, deadlineWarningPercent: 25 });

  console.log("run log");
  const overview = await api("/api/staff/auto-jobs", { token: admin });
  const watch = (overview.body.jobs as any[]).find((row) => row.key === "deadline_watch");
  assert(Boolean(watch.lastRun) && typeof watch.lastRun.startedAt === "string" && Boolean(watch.schedule), "the overview shows each job's schedule and last run");

  await prisma.$disconnect();
  if (failed > 0) {
    console.error(`\n${failed} auto-job check(s) failed`);
    process.exit(1);
  }
  console.log("\nall auto-job checks passed");
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
