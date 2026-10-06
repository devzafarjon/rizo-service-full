import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard, type StatAccent } from "../../components/StatCard";
import { EmptyState } from "../../components/EmptyState";
import { PageSkeleton } from "../../components/PageSkeleton";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDurationHours, formatMoney } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import { defaultReportQuery, reportQueryString } from "../../lib/reportQuery";
import { statusLabel } from "../../lib/status";
import type { DashboardReport } from "../../lib/types";
import { CHART, ChartPanel, CountTooltip, MoneyTooltip, STATUS_COLORS, useChartLabels } from "./charts";
import { DateRangeBar } from "./DateRangeBar";

export function DashboardPage() {
  const { t } = useTranslation();
  const { token, user } = useStaffAuth();
  const [params] = useSearchParams();
  const full = params.get("view") === "full";
  const [query, setQuery] = useState(() => defaultReportQuery("day"));
  const labels = useChartLabels();

  const dash = useQuery({
    queryKey: ["staff", "reports", "dashboard", query],
    enabled: Boolean(token),
    queryFn: () => api<DashboardReport>(`/api/staff/reports/dashboard?${reportQueryString(query)}`, { token }),
  });

  if (dash.isLoading) return <PageSkeleton cards={4} />;
  const data = dash.data;
  if (!data) {
    return <EmptyState tone="error" title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  }

  const products = data.topProducts.map((row) => ({ ...row, label: localizedName(row) }));
  const parts = data.topParts.map((row) => ({ ...row, label: localizedName(row) }));
  const defects = data.defectsByCategory.map((row) => ({ ...row, label: categoryLabel(row.category) }));
  const statuses = data.byStatus.map((row) => ({
    ...row,
    label: statusLabel(row.status),
  }));
  const warranty = [
    { name: t("reports.inWarrantyFree"), value: data.warrantySplit.free, color: CHART.green },
    { name: t("reports.paidRepair"), value: data.warrantySplit.paid, color: CHART.orange },
  ];

  return (
    <div>
      <p className="text-sm font-semibold text-[#7B00E0]">{t("staffHome.welcome")}</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{user?.name}</h1>
      <p className="mt-2 max-w-2xl text-sm text-gray-500">{full ? t("dashboard.intro") : t("dashboard.introShort")}</p>

      <div className="mt-5">
        <DateRangeBar query={query} onChange={setQuery} grain />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label={t("reports.requests")} value={String(data.totals.requests)} delta={delta(data.totals.requests, data.previous?.requests)} />
        <Kpi label={t("reports.paidRevenue")} value={formatMoney(data.totals.revenue)} accent="green" delta={delta(data.totals.revenue, data.previous?.revenue)} />
        <Kpi label={t("reports.profit")} value={formatMoney(data.totals.profit)} delta={delta(data.totals.profit, data.previous?.profit)} />
        <Kpi label={t("reports.avgHours")} value={formatDurationHours(data.totals.avgResolutionHours)} accent="orange" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartPanel title={t("dashboard.trend")}>
          <ResponsiveContainer>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="key" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<MoneyTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="revenue" name={labels.revenue} stroke={CHART.orange} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="costs" name={labels.costs} stroke={CHART.rose} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit" name={labels.profit} stroke={CHART.purple} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title={t("dashboard.status")}>
          {statuses.some((row) => row.count > 0) ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statuses} dataKey="count" nameKey="label" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {statuses.map((row, index) => (
                    <Cell key={row.status} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CountTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-neutral-400">{t("reports.empty")}</p>
          )}
        </ChartPanel>
      </div>

      {!full ? (
        <Link
          to="/app?view=full"
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#F5EBFD] px-4 text-sm font-bold text-[#7B00E0]"
        >
          {t("dashboard.viewFull")}
        </Link>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={t("reports.avgRating")}
              value={data.totals.avgRating == null ? t("common.dash") : `${data.totals.avgRating.toFixed(1)} / 5`}
            />
            <Kpi label={t("dashboard.legalOverdue")} value={String(data.totals.legalOverdue)} accent="red" to="/app/reports/legal" />
            <Kpi label={t("dashboard.debt")} value={formatMoney(data.totals.debt)} accent="red" to="/app/reports/debts" />
            <Kpi label={t("dashboard.avgWork")} value={data.totals.avgWorkMinutes == null ? t("common.dash") : formatDurationHours(data.totals.avgWorkMinutes / 60)} accent="orange" />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartPanel title={t("dashboard.topProducts")}>
              <ResponsiveContainer>
                <BarChart data={products} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CountTooltip />} />
                  <Bar dataKey="count" name={labels.requests} fill={CHART.purple} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title={t("dashboard.topParts")}>
              <ResponsiveContainer>
                <BarChart data={parts} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CountTooltip />} />
                  <Bar dataKey="quantity" name={t("reports.qtyUsed")} fill={CHART.orange} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title={t("dashboard.defects")}>
              <ResponsiveContainer>
                <BarChart data={defects}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CountTooltip />} />
                  <Bar dataKey="count" name={t("reports.defects")} fill={CHART.sky} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>

            <ChartPanel title={t("dashboard.warranty")}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={warranty} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {warranty.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CountTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartPanel>
          </div>

          <Link
            to="/app/reports/technicians"
            className="mt-4 block rounded-2xl border border-neutral-200 bg-white p-5"
          >
            <p className="text-sm font-extrabold">{t("dashboard.techPerformance")}</p>
            <p className="mt-1 text-sm text-neutral-500">{t("dashboard.techPerformanceBody")}</p>
          </Link>

          <Link to="/app" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-neutral-100 px-4 text-sm font-bold text-neutral-700">
            {t("dashboard.viewSummary")}
          </Link>
        </>
      )}
    </div>
  );
}

function delta(current: number, previous: number | undefined) {
  if (previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function Kpi({ label, value, accent = "purple", delta: change, to }: { label: string; value: string; accent?: StatAccent; delta?: number | null; to?: string }) {
  const { t } = useTranslation();
  const card = <StatCard label={label} value={value} accent={accent} />;
  const body = (
    <div>
      {card}
      {change != null ? (
        <p className={`mt-1 px-1 text-xs font-bold ${change > 0 ? "text-emerald-700" : change < 0 ? "text-red-700" : "text-neutral-500"}`}>
          {change > 0 ? "▲" : change < 0 ? "▼" : "•"} {Math.abs(change)}% {t("dashboard.vsPrevious")}
        </p>
      ) : null}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
