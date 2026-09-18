import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDurationHours, formatMoney } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { statusLabel } from "../../lib/status";
import type { ReportRangeKey, ReportsSummary, ServiceType } from "../../lib/types";

const RANGES: ReportRangeKey[] = ["all", "30d", "90d", "year"];
const RANGE_KEYS: Record<ReportRangeKey, "reports.rangeAll" | "reports.range30" | "reports.range90" | "reports.rangeYear"> = {
  all: "reports.rangeAll",
  "30d": "reports.range30",
  "90d": "reports.range90",
  year: "reports.rangeYear",
};

const TYPE_COLORS: Record<ServiceType, string> = {
  installation: "bg-[#B439FD]",
  repair: "bg-[#F6921E]",
  maintenance: "bg-sky-500",
};

export function ReportingPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [range, setRange] = useState<ReportRangeKey>("all");

  const reports = useQuery({
    queryKey: ["staff", "reports", range],
    enabled: Boolean(token),
    queryFn: () => api<ReportsSummary>(`/api/staff/reports?range=${range}`, { token }),
  });

  if (reports.isLoading) {
    return <PageSkeleton />;
  }

  const data = reports.data;
  if (!data) {
    return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  }

  const typeMax = Math.max(1, ...data.byType.map((row) => row.count));
  const statusMax = Math.max(1, ...data.byStatus.map((row) => row.count));
  const defectMax = Math.max(1, ...data.defects.map((row) => row.count));
  const productMax = Math.max(1, ...data.products.map((row) => row.count));
  const revenueMax = Math.max(1, data.revenue.inWarranty.amount, data.revenue.paid.amount);
  const repairCount = data.defects.reduce((sum, row) => sum + row.count, 0);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("reports.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("reports.intro")}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {RANGES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={`inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-bold ${
                range === item ? "bg-[#B439FD] text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
              }`}
            >
              {t(RANGE_KEYS[item])}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={t("reports.requests")}
          value={String(data.totals.requests)}
          hint={`${data.totals.open} ${t("reports.open")} · ${data.totals.done} ${t("reports.done")}`}
        />
        <Kpi
          label={t("reports.avgHours")}
          value={formatDurationHours(data.totals.avgResolutionHours)}
          hint={
            data.totals.resolvedCount
              ? t("reports.jobsCount", { count: data.totals.resolvedCount })
              : t("reports.noCompleted")
          }
        />
        <Kpi
          label={t("reports.paidRevenue")}
          value={formatMoney(data.revenue.paid.amount)}
          hint={t("reports.jobsCount", { count: data.revenue.paid.jobs })}
          accent="orange"
        />
        <Kpi
          label={t("reports.avgRating")}
          value={data.totals.avgRating == null ? t("common.dash") : `${data.totals.avgRating.toFixed(1)} / 5`}
          hint={data.totals.ratingCount ? t("reports.ratingsCount", { count: data.totals.ratingCount }) : t("reports.noFeedback")}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title={t("reports.byType")}>
          {data.totals.requests === 0 ? (
            <EmptyCopy />
          ) : (
            <div className="space-y-4">
              {data.byType.map((row) => (
                <BarRow
                  key={row.type}
                  label={t(`type.${row.type}`)}
                  value={row.count}
                  max={typeMax}
                  barClass={TYPE_COLORS[row.type]}
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t("reports.byStatus")}>
          {data.byStatus.length === 0 ? (
            <EmptyCopy />
          ) : (
            <div className="space-y-3">
              {data.byStatus.map((row) => (
                <BarRow
                  key={row.status}
                  label={statusLabel(row.status)}
                  value={row.count}
                  max={statusMax}
                  barClass="bg-[#B439FD]"
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t("reports.revenue")}>
          {data.totals.done === 0 ? (
            <p className="text-sm text-neutral-500">{t("reports.revenueHint")}</p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <RevenueCard
                  label={t("reports.inWarranty")}
                  jobs={data.revenue.inWarranty.jobs}
                  amount={data.revenue.inWarranty.amount}
                  tone="green"
                />
                <RevenueCard
                  label={t("warranty.expired")}
                  jobs={data.revenue.paid.jobs}
                  amount={data.revenue.paid.amount}
                  tone="orange"
                />
              </div>
              <BarRow
                label={t("reports.inWarrantyFree")}
                value={data.revenue.inWarranty.amount}
                display={formatMoney(data.revenue.inWarranty.amount)}
                max={revenueMax}
                barClass="bg-emerald-500"
              />
              <BarRow
                label={t("reports.paidRepair")}
                value={data.revenue.paid.amount}
                display={formatMoney(data.revenue.paid.amount)}
                max={revenueMax}
                barClass="bg-[#F6921E]"
              />
            </div>
          )}
        </Panel>

        <Panel title={t("reports.defects")}>
          {repairCount === 0 ? (
            <p className="text-sm text-neutral-500">{t("reports.defectsHint")}</p>
          ) : (
            <div className="space-y-4">
              {data.defects.map((row) => (
                <BarRow
                  key={row.type}
                  label={t(`defect.${row.type}`)}
                  value={row.count}
                  max={defectMax}
                  barClass={row.type === "unspecified" ? "bg-neutral-400" : "bg-[#F6921E]"}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title={t("reports.products")}>
          {data.products.length === 0 ? (
            <EmptyCopy />
          ) : (
            <div className="space-y-4">
              {data.products.map((row) => (
                <BarRow
                  key={row.productId}
                  label={localizedName(row)}
                  hint={row.sku}
                  value={row.count}
                  max={productMax}
                  barClass="bg-[#B439FD]"
                />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={t("reports.technicians")}>
          {data.technicians.length === 0 ? (
            <EmptyCopy />
          ) : (
            <SurfaceTable>
              <thead>
                <tr>
                  <Th>{t("common.technician")}</Th>
                  <Th>{t("reports.rating")}</Th>
                  <Th>{t("reports.jobsDone")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.technicians.map((tech) => (
                  <tr key={tech.id} className="border-t border-neutral-100">
                    <Td>
                      <p className="font-semibold text-neutral-900">{tech.name}</p>
                      <p className="text-xs text-neutral-500">
                        {tech.technicianType ? t(`techType.${tech.technicianType}`) : t("common.technician")}
                      </p>
                    </Td>
                    <Td>
                      {tech.avgRating == null ? (
                        <span className="text-neutral-400">{t("reports.noRatings")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-bold">
                          <Star size={14} className="fill-[#F6921E] text-[#F6921E]" />
                          {tech.avgRating.toFixed(1)}
                          <span className="font-semibold text-neutral-400">({tech.ratingCount})</span>
                        </span>
                      )}
                    </Td>
                    <Td>{tech.jobsDone}</Td>
                  </tr>
                ))}
              </tbody>
            </SurfaceTable>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent = "purple",
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "purple" | "orange";
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className={`text-xs font-bold tracking-wide uppercase ${accent === "orange" ? "text-[#F6921E]" : "text-[#B439FD]"}`}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-neutral-900">{value}</p>
      <p className="mt-1 text-xs font-semibold text-neutral-500">{hint}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-bold text-neutral-900">{title}</h2>
      {children}
    </section>
  );
}

function EmptyCopy() {
  const { t } = useTranslation();
  return <p className="text-sm text-neutral-500">{t("reports.empty")}</p>;
}

function RevenueCard({
  label,
  jobs,
  amount,
  tone,
}: {
  label: string;
  jobs: number;
  amount: number;
  tone: "green" | "orange";
}) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-2xl px-4 py-3 ${tone === "green" ? "bg-emerald-50" : "bg-[#FFF4E5]"}`}>
      <p className={`text-xs font-bold uppercase ${tone === "green" ? "text-emerald-700" : "text-[#C56A00]"}`}>{label}</p>
      <p className="mt-1 text-lg font-extrabold text-neutral-900">{formatMoney(amount)}</p>
      <p className="text-xs font-semibold text-neutral-500">{t("reports.jobsCount", { count: jobs })}</p>
    </div>
  );
}

function BarRow({
  label,
  hint,
  value,
  display,
  max,
  barClass,
}: {
  label: string;
  hint?: string;
  value: number;
  display?: string;
  max: number;
  barClass: string;
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 6 : 0, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-800">{label}</p>
          {hint ? <p className="text-xs text-neutral-400">{hint}</p> : null}
        </div>
        <p className="shrink-0 font-bold text-neutral-900">{display ?? value}</p>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
