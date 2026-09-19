import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../../components/EmptyState";
import { inputClass } from "../../components/Field";
import { PageSkeleton } from "../../components/PageSkeleton";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api } from "../../lib/api";
import { formatDurationHours, formatMoney, formatNumber } from "../../lib/format";
import { localizedName } from "../../lib/localized";
import { defaultReportQuery, downloadCsv, reportQueryString, type ReportQuery } from "../../lib/reportQuery";
import type {
  ExpensesReport,
  PartsReport,
  ProductReport,
  ProfitReport,
  SourcesReport,
  TechnicianReport,
  WarrantyReport,
} from "../../lib/types";
import { CHART, ChartPanel, MoneyTooltip, useChartLabels } from "./charts";
import { ReportChrome, ReportPanel } from "./ReportChrome";
import { REPORT_LINKS } from "./reportNav";

function useRange(grain?: boolean) {
  return useState<ReportQuery>(() => defaultReportQuery(grain ? "day" : undefined));
}

export function ReportsIndexPage() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{t("reports.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("reports.hubIntro")}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {REPORT_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-[0_8px_30px_rgba(180,57,253,0.12)]"
          >
            <h2 className="text-lg font-bold text-black">{t(item.labelKey)}</h2>
            <p className="mt-2 text-sm text-neutral-500">{t(`${item.labelKey}Body`)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ProductReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useRange();
  const report = useQuery({
    queryKey: ["staff", "reports", "products", query],
    enabled: Boolean(token),
    queryFn: () => api<ProductReport>(`/api/staff/reports/products?${reportQueryString(query)}`, { token }),
  });

  if (report.isLoading) return <PageSkeleton />;
  const rows = report.data?.rows ?? [];

  return (
    <ReportChrome
      title={t("reports.nav.products")}
      intro={t("reports.nav.productsBody")}
      query={query}
      onChange={setQuery}
      onExport={() =>
        downloadCsv("rizo-report-products.csv", [
          [t("common.product"), "SKU", t("reports.requests"), t("type.installation"), t("type.repair"), t("reports.paidRevenue"), t("reports.inWarranty"), t("reports.paid"), t("reports.warrantyRatio")],
          ...rows.map((row) => [
            localizedName(row),
            row.sku,
            row.requests,
            row.installation,
            row.repair,
            row.revenue,
            row.warranty,
            row.paid,
            `${row.warrantyRatio}%`,
          ]),
        ])
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={t("reports.empty")} body={t("reports.emptyBody")} />
      ) : (
        <ReportPanel>
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("common.product")}</Th>
                <Th>{t("reports.requests")}</Th>
                <Th>{t("type.installation")}</Th>
                <Th>{t("type.repair")}</Th>
                <Th>{t("reports.paidRevenue")}</Th>
                <Th>{t("reports.warrantyRatio")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <Td>
                    <p className="font-semibold">{localizedName(row)}</p>
                    <p className="text-xs text-neutral-400">{row.sku}</p>
                  </Td>
                  <Td>{row.requests}</Td>
                  <Td>{row.installation}</Td>
                  <Td>{row.repair}</Td>
                  <Td>{formatMoney(row.revenue)}</Td>
                  <Td>
                    {row.warranty + row.paid === 0
                      ? t("common.dash")
                      : t("reports.warrantyPaid", { warranty: row.warranty, paid: row.paid, ratio: row.warrantyRatio })}
                  </Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        </ReportPanel>
      )}
    </ReportChrome>
  );
}

export function PartsReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useRange();
  const report = useQuery({
    queryKey: ["staff", "reports", "parts", query],
    enabled: Boolean(token),
    queryFn: () => api<PartsReport>(`/api/staff/reports/parts?${reportQueryString(query)}`, { token }),
  });

  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  const rows = data?.rows ?? [];

  return (
    <ReportChrome
      title={t("reports.nav.parts")}
      intro={t("reports.nav.partsBody")}
      query={query}
      onChange={setQuery}
      onExport={() =>
        downloadCsv("rizo-report-parts.csv", [
          [t("reports.part"), t("reports.qtyUsed"), t("reports.partRevenue")],
          ...rows.map((row) => [localizedName(row), row.quantity, row.revenue]),
        ])
      }
    >
      <div className="mb-4 max-w-xs">
        <label className="text-xs font-bold text-neutral-500">
          {t("common.product")}
          <select
            className={`${inputClass} mt-1`}
            value={query.productId ?? ""}
            onChange={(event) => setQuery({ ...query, productId: event.target.value || undefined })}
          >
            <option value="">{t("reports.allProducts")}</option>
            {(data?.products ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {localizedName(product)} · {product.sku}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t("reports.empty")} body={t("reports.emptyBody")} />
      ) : (
        <ReportPanel>
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("reports.rank")}</Th>
                <Th>{t("reports.part")}</Th>
                <Th>{t("reports.qtyUsed")}</Th>
                <Th>{t("reports.partRevenue")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <Td>{index + 1}</Td>
                  <Td className="font-semibold">{localizedName(row)}</Td>
                  <Td>{formatNumber(row.quantity)}</Td>
                  <Td>{formatMoney(row.revenue)}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        </ReportPanel>
      )}
    </ReportChrome>
  );
}

export function ExpensesReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useRange();
  const report = useQuery({
    queryKey: ["staff", "reports", "expenses", query],
    enabled: Boolean(token),
    queryFn: () => api<ExpensesReport>(`/api/staff/reports/expenses?${reportQueryString(query)}`, { token }),
  });

  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  if (!data) return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;

  return (
    <ReportChrome
      title={t("reports.nav.expenses")}
      intro={t("reports.nav.expensesBody")}
      query={query}
      onChange={setQuery}
      onExport={() =>
        downloadCsv("rizo-report-expenses.csv", [
          [t("reports.group"), t("common.name"), t("reports.partsCost"), t("reports.extras"), t("reports.running")],
          ...data.byTechnician.map((row) => [t("common.technician"), row.name, row.parts, row.extras, row.total]),
          ...data.byProduct.map((row) => [t("common.product"), localizedName(row), row.parts, row.extras, row.total]),
        ])
      }
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Summary label={t("reports.partsCost")} value={formatMoney(data.totals.parts)} />
        <Summary label={t("reports.extras")} value={formatMoney(data.totals.extras)} />
        <Summary label={t("reports.running")} value={formatMoney(data.totals.running)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ReportPanel title={t("reports.byTechnician")}>
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("common.technician")}</Th>
                <Th>{t("reports.partsCost")}</Th>
                <Th>{t("reports.extras")}</Th>
                <Th>{t("common.total")}</Th>
                <Th>{t("reports.running")}</Th>
              </tr>
            </thead>
            <tbody>
              {withRunning(data.byTechnician).map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <Td className="font-semibold">{row.id === "unassigned" ? t("common.unassigned") : row.name}</Td>
                  <Td>{formatMoney(row.parts)}</Td>
                  <Td>{formatMoney(row.extras)}</Td>
                  <Td>{formatMoney(row.total)}</Td>
                  <Td>{formatMoney(row.running)}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        </ReportPanel>
        <ReportPanel title={t("reports.byProduct")}>
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("common.product")}</Th>
                <Th>{t("reports.partsCost")}</Th>
                <Th>{t("reports.extras")}</Th>
                <Th>{t("common.total")}</Th>
                <Th>{t("reports.running")}</Th>
              </tr>
            </thead>
            <tbody>
              {withRunning(data.byProduct).map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <Td className="font-semibold">{localizedName(row)}</Td>
                  <Td>{formatMoney(row.parts)}</Td>
                  <Td>{formatMoney(row.extras)}</Td>
                  <Td>{formatMoney(row.total)}</Td>
                  <Td>{formatMoney(row.running)}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        </ReportPanel>
      </div>
    </ReportChrome>
  );
}

export function ProfitReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useRange(true);
  const labels = useChartLabels();
  const report = useQuery({
    queryKey: ["staff", "reports", "profit", query],
    enabled: Boolean(token),
    queryFn: () => api<ProfitReport>(`/api/staff/reports/profit?${reportQueryString(query)}`, { token }),
  });

  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  if (!data) return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;

  return (
    <ReportChrome
      title={t("reports.nav.profit")}
      intro={t("reports.nav.profitBody")}
      query={query}
      onChange={setQuery}
      grain
      onExport={() =>
        downloadCsv("rizo-report-profit.csv", [
          [t("reports.period"), labels.revenue, labels.costs, labels.profit, t("reports.requests")],
          ...data.trend.map((row) => [row.key, row.revenue, row.costs, row.profit, row.requests]),
        ])
      }
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Summary label={t("reports.paidRevenue")} value={formatMoney(data.totals.revenue)} />
        <Summary label={t("reports.partsCost")} value={formatMoney(data.totals.parts)} />
        <Summary label={t("reports.extras")} value={formatMoney(data.totals.extras)} />
        <Summary label={t("reports.profit")} value={formatMoney(data.totals.profit)} />
      </div>
      <ChartPanel title={t("reports.profitTrend")}>
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
    </ReportChrome>
  );
}

export function TechnicianReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useRange();
  const report = useQuery({
    queryKey: ["staff", "reports", "technicians", query],
    enabled: Boolean(token),
    queryFn: () => api<TechnicianReport>(`/api/staff/reports/technicians?${reportQueryString(query)}`, { token }),
  });

  if (report.isLoading) return <PageSkeleton />;
  const rows = report.data?.rows ?? [];

  return (
    <ReportChrome
      title={t("reports.nav.technicians")}
      intro={t("reports.nav.techniciansBody")}
      query={query}
      onChange={setQuery}
      onExport={() =>
        downloadCsv("rizo-report-technicians.csv", [
          [t("common.technician"), t("reports.jobsDone"), t("reports.avgHours"), t("reports.avgRating"), t("reports.paidRevenue")],
          ...rows.map((row) => [row.name, row.completed, row.avgResolutionHours ?? "", row.avgRating ?? "", row.revenue]),
        ])
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={t("reports.empty")} body={t("reports.emptyBody")} />
      ) : (
        <ReportPanel>
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("common.technician")}</Th>
                <Th>{t("reports.jobsDone")}</Th>
                <Th>{t("reports.avgHours")}</Th>
                <Th>{t("reports.avgRating")}</Th>
                <Th>{t("reports.paidRevenue")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-100">
                  <Td>
                    <p className="font-semibold">{row.name}</p>
                    <p className="text-xs text-neutral-400">
                      {row.technicianType ? t(`techType.${row.technicianType}`) : t("common.technician")}
                    </p>
                  </Td>
                  <Td>{row.completed}</Td>
                  <Td>{formatDurationHours(row.avgResolutionHours)}</Td>
                  <Td>{row.avgRating == null ? t("reports.noRatings") : `${row.avgRating.toFixed(1)} (${row.ratingCount})`}</Td>
                  <Td>{formatMoney(row.revenue)}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        </ReportPanel>
      )}
    </ReportChrome>
  );
}

export function WarrantyReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useRange(true);
  const report = useQuery({
    queryKey: ["staff", "reports", "warranty", query],
    enabled: Boolean(token),
    queryFn: () => api<WarrantyReport>(`/api/staff/reports/warranty?${reportQueryString(query)}`, { token }),
  });

  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  if (!data) return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;

  return (
    <ReportChrome
      title={t("reports.nav.warranty")}
      intro={t("reports.nav.warrantyBody")}
      query={query}
      onChange={setQuery}
      grain
      onExport={() =>
        downloadCsv("rizo-report-warranty.csv", [
          [t("reports.period"), t("reports.inWarranty"), t("reports.paid"), t("reports.freeValue"), t("reports.paidValue")],
          ...data.trend.map((row) => [row.key, row.free, row.paid, row.freeValue, row.paidValue]),
        ])
      }
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Summary label={t("reports.inWarranty")} value={String(data.totals.freeCount)} />
        <Summary label={t("reports.freeValue")} value={formatMoney(data.totals.freeValue)} />
        <Summary label={t("reports.paid")} value={String(data.totals.paidCount)} />
        <Summary label={t("reports.paidValue")} value={formatMoney(data.totals.paidValue)} />
      </div>
      <ChartPanel title={t("reports.warrantyTrend")}>
        <ResponsiveContainer>
          <LineChart data={data.trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
            <XAxis dataKey="key" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip content={<MoneyTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="freeValue" name={t("reports.freeValue")} stroke={CHART.green} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="paidValue" name={t("reports.paidValue")} stroke={CHART.orange} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>
    </ReportChrome>
  );
}

export function SourcesReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useRange();
  const report = useQuery({
    queryKey: ["staff", "reports", "sources", query],
    enabled: Boolean(token),
    queryFn: () => api<SourcesReport>(`/api/staff/reports/sources?${reportQueryString(query)}`, { token }),
  });

  if (report.isLoading) return <PageSkeleton />;
  const rows = report.data?.rows ?? [];
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <ReportChrome
      title={t("reports.nav.sources")}
      intro={t("reports.nav.sourcesBody")}
      query={query}
      onChange={setQuery}
      onExport={() =>
        downloadCsv("rizo-report-sources.csv", [
          [t("reports.sourceLabel"), t("reports.requests")],
          ...rows.map((row) => [t(`reports.source.${row.source}`), row.count]),
        ])
      }
    >
      {total === 0 ? (
        <EmptyState title={t("reports.empty")} body={t("reports.emptyBody")} />
      ) : (
        <ReportPanel>
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("reports.sourceLabel")}</Th>
                <Th>{t("reports.requests")}</Th>
                <Th>%</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.source} className="border-t border-neutral-100">
                  <Td className="font-semibold">{t(`reports.source.${row.source}`)}</Td>
                  <Td>{row.count}</Td>
                  <Td>{total ? `${Math.round((row.count / total) * 1000) / 10}%` : t("common.dash")}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        </ReportPanel>
      )}
    </ReportChrome>
  );
}

function withRunning<T extends { total: number }>(rows: T[]) {
  let running = 0;
  return rows.map((row) => {
    running += row.total;
    return { ...row, running };
  });
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold tracking-wide text-[#B439FD] uppercase">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-neutral-900">{value}</p>
    </div>
  );
}
