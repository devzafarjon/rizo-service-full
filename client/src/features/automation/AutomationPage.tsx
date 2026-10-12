import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileText, Play, ShieldAlert, Wallet } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { Spinner } from "../../components/Spinner";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatDateTime, formatDurationMs, formatMoney, formatRequestId } from "../../lib/format";
import type { AtRiskItem, AutoJob, AutoJobKey, AutoRun, AutoSettings, PayrollStatement } from "../../lib/types";

const ICONS = { deadline_watch: ShieldAlert, daily_report: FileText, weekly_digest: CalendarClock, payroll_statements: Wallet } as const;

function scheduleText(t: (key: string, options?: Record<string, unknown>) => string, schedule: AutoJob["schedule"]) {
  const time = (hour: number) => `${String(Math.floor(hour)).padStart(2, "0")}:${hour % 1 ? "30" : "00"}`;
  if (schedule.type === "minutely") return t("auto.schedule.minutely");
  if (schedule.type === "daily") return t("auto.schedule.daily", { time: time(schedule.hour) });
  if (schedule.type === "weekly") return t("auto.schedule.weekly", { time: time(schedule.hour) });
  return t("auto.schedule.monthly", { time: time(schedule.hour) });
}

function resultText(t: (key: string, options?: Record<string, unknown>) => string, run: AutoRun) {
  if (!run.ok) return t("auto.result.failed", { error: run.error ?? "" });
  const s = run.summary ?? {};
  switch (run.jobKey) {
    case "deadline_watch":
      return s.skipped ? t("auto.result.off") : t("auto.result.deadline", { atRisk: s.atRisk ?? 0, warned: s.warned ?? 0 });
    case "daily_report":
      return t("auto.result.daily", { created: s.created ?? 0, finished: s.finished ?? 0, open: s.open ?? 0, overdue: s.overdue ?? 0 });
    case "weekly_digest":
      return t("auto.result.weekly", { created: s.created ?? 0, finished: s.finished ?? 0, open: s.open ?? 0, overdue: s.overdue ?? 0 });
    case "payroll_statements":
      return t("auto.result.payroll", { technicians: s.technicians ?? 0, total: formatMoney(s.total ?? 0) });
  }
}

/** What the system does by itself: deadline warnings, owner reports and technicians' pay statements, each with a "Run now" button. */
export function AutomationPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const isAdmin = user?.role === "admin";
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff", "auto"] });

  const overview = useQuery({ queryKey: ["staff", "auto", "jobs"], enabled: Boolean(token), refetchInterval: 30_000, queryFn: () => api<{ settings: AutoSettings; jobs: AutoJob[] }>("/api/staff/auto-jobs", { token }) });
  const atRisk = useQuery({ queryKey: ["staff", "auto", "at-risk"], enabled: Boolean(token && isAdmin), refetchInterval: 30_000, queryFn: () => api<{ items: AtRiskItem[] }>("/api/staff/auto-jobs/at-risk", { token }) });
  const history = useQuery({ queryKey: ["staff", "auto", "history"], enabled: Boolean(token), queryFn: () => api<{ runs: AutoRun[] }>("/api/staff/auto-jobs/history", { token }) });
  const statements = useQuery({ queryKey: ["staff", "auto", "statements"], enabled: Boolean(token), queryFn: () => api<{ statements: PayrollStatement[] }>("/api/staff/auto-jobs/statements", { token }) });

  const [form, setForm] = useState({ deadlineWarningPercent: "25", legalWarningDays: "3", dailyReportHour: "18", payrollPeriod: "weekly" as "weekly" | "monthly" });
  useEffect(() => {
    const value = overview.data?.settings;
    if (!value) return;
    setForm({ deadlineWarningPercent: String(value.deadlineWarningPercent), legalWarningDays: String(value.legalWarningDays), dailyReportHour: String(value.dailyReportHour), payrollPeriod: value.payrollPeriod });
  }, [overview.data]);

  const run = useMutation({
    mutationFn: (key: AutoJobKey) => api<{ run: AutoRun }>(`/api/staff/auto-jobs/${key}/run`, { method: "POST", token }),
    onSuccess: async (data) => {
      notify(data.run.ok ? t("auto.ranOk", { result: resultText(t, data.run) }) : t("auto.result.failed", { error: data.run.error ?? "" }), data.run.ok ? "success" : "error");
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  const save = useMutation({
    mutationFn: (body: Partial<AutoSettings>) => api("/api/staff/auto-jobs/settings", { method: "PATCH", token, body: JSON.stringify(body) }),
    onSuccess: async () => {
      notify(t("catalog.settingsSaved"));
      await refresh();
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });

  if (overview.isLoading) return <PageSkeleton />;
  if (!overview.data) return <EmptyState tone="error" title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  const { jobs } = overview.data;
  const enabledKey = { deadline_watch: "deadlineEnabled", daily_report: "dailyEnabled", weekly_digest: "weeklyEnabled", payroll_statements: "payrollEnabled" } as const;
  const dailyRuns = (history.data?.runs ?? []).filter((row) => (row.jobKey === "daily_report" || row.jobKey === "weekly_digest") && row.ok && row.summary);
  const rows = statements.data?.statements ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("auto.title")}</h1>
      <p className="mt-1 max-w-3xl text-sm text-neutral-500">{t("auto.intro")}</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {jobs.map((job) => {
          const Icon = ICONS[job.key];
          const last = job.lastRun;
          return (
            <section key={job.key} className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EBFD] text-[#7B00E0]">
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-bold text-neutral-900">{t(`auto.job.${job.key}.title`)}</h2>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${job.enabled ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{job.enabled ? t("auto.on") : t("auto.off")}</span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">{t(`auto.job.${job.key}.body`)}</p>
                  <p className="mt-2 text-xs font-semibold text-neutral-500">{scheduleText(t, job.schedule)}</p>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm">
                {last ? (
                  <>
                    <p className="text-xs text-neutral-500">
                      {t("auto.lastRun")}: {formatDateTime(last.startedAt)} · {t(`auto.trigger.${last.trigger}`)}
                      {last.ranByName ? ` · ${last.ranByName}` : ""}
                    </p>
                    <p className={`mt-0.5 font-semibold ${last.ok ? "text-neutral-800" : "text-red-700"}`}>{resultText(t, last)}</p>
                  </>
                ) : (
                  <p className="text-neutral-500">{t("auto.never")}</p>
                )}
                {job.overdueSince ? <p className="mt-1 text-xs font-semibold text-amber-700">{t("auto.catchUp")}</p> : null}
              </div>
              {isAdmin ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={overview.data.settings[enabledKey[job.key]]} onChange={(event) => save.mutate({ [enabledKey[job.key]]: event.target.checked } as Partial<AutoSettings>)} />
                    {t("auto.enabled")}
                  </label>
                  <button type="button" disabled={run.isPending} onClick={() => run.mutate(job.key)} className="btn-rizo h-11">
                    {run.isPending && run.variables === job.key ? <Spinner className="h-4 w-4" /> : <Play size={16} />}
                    {t("auto.runNow")}
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {isAdmin ? (
        <form
          className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            save.mutate({ deadlineWarningPercent: Number(form.deadlineWarningPercent), legalWarningDays: Number(form.legalWarningDays), dailyReportHour: Number(form.dailyReportHour), payrollPeriod: form.payrollPeriod });
          }}
        >
          <h2 className="text-sm font-extrabold">{t("auto.settings.title")}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("auto.settings.percent")} hint={t("auto.settings.percentHint")}>
              <input className={inputClass} type="number" min={5} max={90} value={form.deadlineWarningPercent} onChange={(event) => setForm({ ...form, deadlineWarningPercent: event.target.value })} />
            </Field>
            <Field label={t("auto.settings.legalDays")} hint={t("auto.settings.legalDaysHint")}>
              <input className={inputClass} type="number" min={0} max={20} value={form.legalWarningDays} onChange={(event) => setForm({ ...form, legalWarningDays: event.target.value })} />
            </Field>
            <Field label={t("auto.settings.dailyHour")} hint={t("auto.settings.dailyHourHint")}>
              <input className={inputClass} type="number" min={0} max={23} value={form.dailyReportHour} onChange={(event) => setForm({ ...form, dailyReportHour: event.target.value })} />
            </Field>
            <Field label={t("auto.settings.payrollPeriod")} hint={t("auto.settings.payrollPeriodHint")}>
              <select className={`${inputClass} bg-white`} value={form.payrollPeriod} onChange={(event) => setForm({ ...form, payrollPeriod: event.target.value as "weekly" | "monthly" })}>
                <option value="weekly">{t("auto.settings.weekly")}</option>
                <option value="monthly">{t("auto.settings.monthly")}</option>
              </select>
            </Field>
          </div>
          <button type="submit" disabled={save.isPending} className="btn-rizo mt-4 h-12">
            {save.isPending ? <Spinner className="h-4 w-4" /> : null}
            {t("common.save")}
          </button>
        </form>
      ) : null}

      {isAdmin ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold text-[#1E293B]">{t("auto.atRisk.title")}</h2>
          <p className="mt-1 text-sm text-neutral-500">{t("auto.atRisk.intro", { percent: overview.data.settings.deadlineWarningPercent, days: overview.data.settings.legalWarningDays })}</p>
          <div className="mt-3">
            {(atRisk.data?.items ?? []).length === 0 ? (
              <EmptyState title={t("auto.atRisk.emptyTitle")} body={t("auto.atRisk.emptyBody")} />
            ) : (
              <SurfaceTable>
                <thead>
                  <tr>
                    <Th>{t("auto.atRisk.request")}</Th>
                    <Th>{t("auto.atRisk.product")}</Th>
                    <Th>{t("auto.atRisk.technician")}</Th>
                    <Th>{t("auto.atRisk.left")}</Th>
                    <Th>{t("auto.atRisk.kind")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.data!.items.map((item) => (
                    <tr key={item.id}>
                      <Td>
                        <Link to={`/app/requests/${item.id}`} className="font-mono font-bold text-[#7B00E0] hover:underline">
                          {formatRequestId(item.displayId)}
                        </Link>
                      </Td>
                      <Td>{item.product}</Td>
                      <Td>{item.technician?.name ?? <span className="font-semibold text-amber-700">{t("auto.atRisk.unassigned")}</span>}</Td>
                      <Td className="font-bold tabular-nums">{formatDurationMs(item.remainingMs)}</Td>
                      <Td>{t(`auto.atRisk.kinds.${item.kind}`)}</Td>
                    </tr>
                  ))}
                </tbody>
              </SurfaceTable>
            )}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-lg font-bold text-[#1E293B]">{t("auto.reports.title")}</h2>
        <p className="mt-1 text-sm text-neutral-500">{t("auto.reports.intro")}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dailyRuns.length === 0 ? <p className="text-sm text-neutral-500">{t("auto.never")}</p> : null}
          {dailyRuns.slice(0, 6).map((row) => {
            const s = row.summary as Record<string, any>;
            const daily = row.jobKey === "daily_report";
            const cells: Array<[string, string]> = [
              [t("auto.reports.created"), String(s.created ?? 0)],
              [t("auto.reports.finished"), String(s.finished ?? 0)],
              [t("auto.reports.open"), String(s.open ?? 0)],
              [t("auto.reports.overdue"), String(s.overdue ?? 0)],
              ...(daily ? ([[t("auto.reports.atRisk"), String(s.atRisk ?? 0)], [t("auto.reports.partsWaiting"), String(s.partsWaiting ?? 0)], [t("auto.reports.collected"), formatMoney(s.collected ?? 0)]] as Array<[string, string]>) : [[t("auto.reports.revenue"), formatMoney(s.revenue ?? 0)] as [string, string]]),
              [t("auto.reports.rating"), s.avgRating != null ? Number(s.avgRating).toFixed(1) : "—"],
            ];
            return (
              <article key={row.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-neutral-900">{daily ? t("auto.reports.dailyTitle", { date: s.date }) : t("auto.reports.weeklyTitle", { from: s.from, to: s.to })}</h3>
                  <span className="text-xs text-neutral-500">{t(`auto.trigger.${row.trigger}`)}</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {cells.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-neutral-500">{label}</dt>
                      <dd className="font-bold tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                {daily && s.topTechnician ? <p className="mt-3 text-xs text-neutral-600">{t("auto.reports.top", { name: s.topTechnician.name, count: s.topTechnician.done })}</p> : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold text-[#1E293B]">{t("auto.statements.title")}</h2>
        <p className="mt-1 text-sm text-neutral-500">{t("auto.statements.intro")}</p>
        <div className="mt-3">
          {rows.length === 0 ? (
            <EmptyState title={t("auto.statements.emptyTitle")} body={t("auto.statements.emptyBody")} />
          ) : (
            <SurfaceTable>
              <thead>
                <tr>
                  <Th>{t("auto.statements.technician")}</Th>
                  <Th>{t("auto.statements.period")}</Th>
                  <Th>{t("auto.statements.jobs")}</Th>
                  <Th>{t("payroll.jobsTotal")}</Th>
                  <Th>{t("payroll.adjustments")}</Th>
                  <Th>{t("payroll.total")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.technician?.name}</Td>
                    <Td>
                      {formatDate(row.from)} – {formatDate(row.to)}
                      {row.kind === "manual" ? <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase">{t("auto.statements.interim")}</span> : null}
                    </Td>
                    <Td className="tabular-nums">{row.jobs}</Td>
                    <Td className="tabular-nums">{formatMoney(row.jobsTotal)}</Td>
                    <Td className={`tabular-nums ${row.adjustmentsTotal < 0 ? "text-red-700" : ""}`}>{formatMoney(row.adjustmentsTotal)}</Td>
                    <Td className="font-bold tabular-nums">{formatMoney(row.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </SurfaceTable>
          )}
        </div>
      </section>
    </div>
  );
}
