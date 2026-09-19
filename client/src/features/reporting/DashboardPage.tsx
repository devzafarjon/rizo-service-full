import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const [query, setQuery] = useState(() => defaultReportQuery("day"));
  const labels = useChartLabels();

  const dash = useQuery({
    queryKey: ["staff", "reports", "dashboard", query],
    enabled: Boolean(token),
    queryFn: () => api<DashboardReport>(`/api/staff/reports/dashboard?${reportQueryString(query)}`, { token }),
  });

  if (dash.isLoading) return <PageSkeleton />;
  const data = dash.data;
  if (!data) {
    return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  }

  const products = data.topProducts.map((row) => ({ ...row, label: localizedName(row) }));
  const parts = data.topParts.map((row) => ({ ...row, label: localizedName(row) }));
  const defects = data.defectsByCategory.map((row) => ({ ...row, label: categoryLabel(row.category) }));
  const statuses = data.byStatus.map((row) => ({
    ...row,
    label: row.status === "paused" ? t("reports.paused") : statusLabel(row.status),
  }));
  const warranty = [
    { name: t("reports.inWarrantyFree"), value: data.warrantySplit.free, color: CHART.green },
    { name: t("reports.paidRepair"), value: data.warrantySplit.paid, color: CHART.orange },
  ];

  return (
    <div>
      <p className="text-sm font-semibold text-[#B439FD]">{t("staffHome.welcome")}</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-black sm:text-3xl">{user?.name}</h1>
      <p className="mt-2 max-w-2xl text-sm text-gray-500">{t("dashboard.intro")}</p>

      <div className="mt-5">
        <DateRangeBar query={query} onChange={setQuery} grain />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label={t("reports.requests")} value={String(data.totals.requests)} />
        <Kpi label={t("reports.paidRevenue")} value={formatMoney(data.totals.revenue)} accent="orange" />
        <Kpi label={t("reports.profit")} value={formatMoney(data.totals.profit)} />
        <Kpi label={t("reports.avgHours")} value={formatDurationHours(data.totals.avgResolutionHours)} />
        <Kpi
          label={t("reports.avgRating")}
          value={data.totals.avgRating == null ? t("common.dash") : `${data.totals.avgRating.toFixed(1)} / 5`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ChartPanel title={t("dashboard.trend")}>
          <ResponsiveContainer>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
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

        <ChartPanel title={t("dashboard.topProducts")}>
          <ResponsiveContainer>
            <BarChart data={products} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
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
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
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
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CountTooltip />} />
              <Bar dataKey="count" name={t("reports.defects")} fill={CHART.sky} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title={t("dashboard.status")}>
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
    </div>
  );
}

function Kpi({ label, value, accent = "purple" }: { label: string; value: string; accent?: "purple" | "orange" }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className={`text-xs font-bold tracking-wide uppercase ${accent === "orange" ? "text-[#F6921E]" : "text-[#B439FD]"}`}>
        {label}
      </p>
      <p className="mt-2 text-xl font-extrabold tracking-tight text-neutral-900">{value}</p>
    </div>
  );
}
