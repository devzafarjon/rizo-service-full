import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { StatCard } from "../../components/StatCard";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDate, formatMoney, formatRequestId } from "../../lib/format";

const PRESETS = ["week", "month", "quarter", "year"] as const;

/** The technician's own pay: a share of the labor on each finished job plus bonuses and penalties. */
export function MyEarningsPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("month");
  const data = useQuery({
    queryKey: ["staff", "my-jobs", "earnings", preset],
    enabled: Boolean(token),
    queryFn: () =>
      api<{
        technician: { payPercent: number; payFixedPerJob: number };
        jobs: Array<{ id: string; displayId: string; completedAt: string | null; labor: number; earned: number }>;
        adjustments: Array<{ id: string; amount: number; reason: string; createdAt: string }>;
        jobsTotal: number;
        adjustmentsTotal: number;
        total: number;
      }>(`/api/staff/my-jobs/earnings?preset=${preset}`, { token }),
  });

  if (data.isLoading) return <PageSkeleton />;
  const result = data.data;
  if (!result) return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("payroll.myTitle")}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t("payroll.myIntro", { percent: result.technician.payPercent, fixed: formatMoney(result.technician.payFixedPerJob) })}</p>
      <div className="mt-4 inline-flex rounded-lg bg-neutral-100 p-1">
        {PRESETS.map((item) => (
          <button key={item} type="button" onClick={() => setPreset(item)} className={`h-9 rounded-md px-4 text-sm font-bold ${preset === item ? "bg-white shadow-sm" : "text-neutral-600"}`}>
            {t(`reports.preset.${item}`)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label={t("payroll.total")} value={formatMoney(result.total)} />
        <StatCard label={t("payroll.jobsTotal")} value={formatMoney(result.jobsTotal)} accent="green" />
        <StatCard label={t("payroll.adjustments")} value={formatMoney(result.adjustmentsTotal)} accent={result.adjustmentsTotal < 0 ? "red" : "orange"} />
      </div>
      <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("payroll.jobs")}</h2>
        {result.jobs.length === 0 ? <p className="mt-3 text-sm text-neutral-500">{t("payroll.noJobs")}</p> : null}
        <ul className="mt-3 divide-y divide-neutral-100 text-sm">
          {result.jobs.map((job) => (
            <li key={job.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-mono text-xs font-bold text-neutral-500">{formatRequestId(job.displayId)}</span>
                <span className="block text-xs text-neutral-500">
                  {job.completedAt ? formatDate(job.completedAt.slice(0, 10)) : ""} · {t("payroll.labor")}: {formatMoney(job.labor)}
                </span>
              </span>
              <span className="font-bold tabular-nums">{formatMoney(job.earned)}</span>
            </li>
          ))}
        </ul>
      </section>
      {result.adjustments.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-bold tracking-wide text-neutral-500 uppercase">{t("payroll.adjustments")}</h2>
          <ul className="mt-3 divide-y divide-neutral-100 text-sm">
            {result.adjustments.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {row.reason}
                  <span className="block text-xs text-neutral-500">{formatDate(row.createdAt.slice(0, 10))}</span>
                </span>
                <span className={`font-bold tabular-nums ${row.amount < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatMoney(row.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
