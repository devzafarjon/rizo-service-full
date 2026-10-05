import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "../../components/EmptyState";
import { Field, inputClass } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PageSkeleton } from "../../components/PageSkeleton";
import { StatCard, type StatAccent } from "../../components/StatCard";
import { SurfaceTable, Td, Th } from "../../components/SurfaceTable";
import { StatusBadge } from "../../components/Badges";
import { useToast } from "../../components/toast";
import { useStaffAuth } from "../auth/StaffAuthContext";
import { api, apiErrorMessage } from "../../lib/api";
import { formatDate, formatMoney, formatPhone, formatRequestId } from "../../lib/format";
import { categoryLabel, localizedName } from "../../lib/localized";
import { defaultReportQuery, downloadCsv, reportQueryString, type ReportQuery } from "../../lib/reportQuery";
import type { Named, RequestStatus } from "../../lib/types";
import { CHART, ChartPanel } from "./charts";
import { ReportChrome, ReportPanel } from "./ReportChrome";

const Summary = ({ label, value, accent }: { label: string; value: string; accent?: StatAccent }) => <StatCard label={label} value={value} accent={accent} />;

export function DefectsReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useState<ReportQuery>(() => defaultReportQuery());
  const report = useQuery({
    queryKey: ["staff", "reports", "defects", query],
    enabled: Boolean(token),
    queryFn: () =>
      api<{
        total: number;
        uncoded: number;
        codes: Array<Named & { id: string; code: string; count: number; categories: Array<{ category: string; count: number }> }>;
        products: Array<Named & { id: string; sku: string; category: string; repairs: number; repeats: number; unitsSold: number; claimRate: number | null }>;
      }>(`/api/staff/reports/defects?${reportQueryString(query)}`, { token }),
  });
  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  if (!data) return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  const chart = data.codes.slice(0, 10).map((row) => ({ name: `${row.code}`, label: localizedName(row), count: row.count }));

  return (
    <ReportChrome
      title={t("reports.nav.defects")}
      intro={t("reports.nav.defectsBody")}
      query={query}
      onChange={setQuery}
      onExport={() =>
        downloadCsv("rizo-report-defects.csv", [
          [t("common.product"), "SKU", t("reports.repairs"), t("reports.repeats"), t("reports.unitsSold"), t("reports.claimRate")],
          ...data.products.map((row) => [localizedName(row), row.sku, row.repairs, row.repeats, row.unitsSold, row.claimRate ?? ""]),
        ])
      }
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Summary label={t("reports.repairs")} value={String(data.total)} />
        <Summary label={t("reports.withoutCode")} value={String(data.uncoded)} accent="orange" />
        <Summary label={t("reports.repeats")} value={String(data.products.reduce((sum, row) => sum + row.repeats, 0))} accent="red" />
      </div>
      {data.codes.length > 0 ? (
        <ChartPanel title={t("reports.topDefects")}>
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => [value, t("reports.repairs")]} labelFormatter={(_label, payload) => payload?.[0]?.payload?.label ?? ""} />
              <Bar dataKey="count" fill={CHART.purple} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      ) : null}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ReportPanel title={t("reports.byCode")}>
          {data.codes.length === 0 ? (
            <p className="text-sm text-neutral-500">{t("reports.noCodes")}</p>
          ) : (
            <SurfaceTable>
              <thead>
                <tr>
                  <Th>{t("detail.defectCode")}</Th>
                  <Th>{t("reports.repairs")}</Th>
                  <Th>{t("common.category")}</Th>
                </tr>
              </thead>
              <tbody>
                {data.codes.map((row) => (
                  <tr key={row.id}>
                    <Td className="text-left font-semibold">
                      {row.code} · {localizedName(row)}
                    </Td>
                    <Td>{row.count}</Td>
                    <Td className="text-left text-xs">{row.categories.map((item) => `${categoryLabel(item.category)} (${item.count})`).join(", ")}</Td>
                  </tr>
                ))}
              </tbody>
            </SurfaceTable>
          )}
        </ReportPanel>
        <ReportPanel title={t("reports.byProduct")}>
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("common.product")}</Th>
                <Th>{t("reports.repairs")}</Th>
                <Th>{t("reports.repeats")}</Th>
                <Th>{t("reports.claimRate")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((row) => (
                <tr key={row.id}>
                  <Td className="text-left font-semibold">{localizedName(row)}</Td>
                  <Td>{row.repairs}</Td>
                  <Td>{row.repeats}</Td>
                  <Td>{row.claimRate == null ? t("common.dash") : `${row.claimRate}%`}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        </ReportPanel>
      </div>
    </ReportChrome>
  );
}

export function OutcomesReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useState<ReportQuery>(() => defaultReportQuery());
  const report = useQuery({
    queryKey: ["staff", "reports", "outcomes", query],
    enabled: Boolean(token),
    queryFn: () => api<{ rows: Array<{ outcome: string; count: number; charged: number; cost: number; avgCost: number }> }>(`/api/staff/reports/outcomes?${reportQueryString(query)}`, { token }),
  });
  if (report.isLoading) return <PageSkeleton />;
  const rows = report.data?.rows ?? [];
  return (
    <ReportChrome
      title={t("reports.nav.outcomes")}
      intro={t("reports.nav.outcomesBody")}
      query={query}
      onChange={setQuery}
      onExport={() => downloadCsv("rizo-report-outcomes.csv", [[t("reports.outcome"), t("reports.requests"), t("reports.charged"), t("reports.cost"), t("reports.avgCost")], ...rows.map((row) => [t(`outcome.${row.outcome}`), row.count, row.charged, row.cost, row.avgCost])])}
    >
      <ReportPanel>
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("reports.outcome")}</Th>
              <Th>{t("reports.requests")}</Th>
              <Th>{t("reports.charged")}</Th>
              <Th>{t("reports.cost")}</Th>
              <Th>{t("reports.avgCost")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.outcome}>
                <Td className="text-left font-semibold">{t(`outcome.${row.outcome}`)}</Td>
                <Td>{row.count}</Td>
                <Td>{formatMoney(row.charged)}</Td>
                <Td>{formatMoney(row.cost)}</Td>
                <Td>{formatMoney(row.avgCost)}</Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
        <p className="mt-3 text-xs text-neutral-500">{t("reports.outcomeNote")}</p>
      </ReportPanel>
    </ReportChrome>
  );
}

export function LegalReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const [query, setQuery] = useState<ReportQuery>(() => defaultReportQuery());
  const report = useQuery({
    queryKey: ["staff", "reports", "legal", query],
    enabled: Boolean(token),
    queryFn: () =>
      api<{
        total: number;
        late: number;
        onTimeRate: number | null;
        avgDays: number | null;
        rows: Array<{ id: string; displayId: string; status: RequestStatus; customer: { name: string; phone: string }; product: Named; technician: string | null; createdAt: string; legalDueAt: string; finished: boolean; days: number; lateDays: number; late: boolean }>;
      }>(`/api/staff/reports/legal?${reportQueryString(query)}`, { token }),
  });
  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  if (!data) return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  return (
    <ReportChrome
      title={t("reports.nav.legal")}
      intro={t("reports.nav.legalBody")}
      query={query}
      onChange={setQuery}
      onExport={() => downloadCsv("rizo-report-legal.csv", [[t("common.requestId"), t("common.customer"), t("common.product"), t("common.technician"), t("reports.days"), t("reports.lateDays")], ...data.rows.map((row) => [formatRequestId(row.displayId), row.customer.name, localizedName(row.product), row.technician ?? "", row.days, row.lateDays])])}
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Summary label={t("reports.repairs")} value={String(data.total)} />
        <Summary label={t("reports.late")} value={String(data.late)} accent="red" />
        <Summary label={t("reports.onTimeRate")} value={data.onTimeRate == null ? t("common.dash") : `${data.onTimeRate}%`} accent="green" />
        <Summary label={t("reports.avgDays")} value={data.avgDays == null ? t("common.dash") : String(data.avgDays)} accent="orange" />
      </div>
      <ReportPanel title={t("reports.lateAndOpen")}>
        {data.rows.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("reports.nothingLate")}</p>
        ) : (
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("common.requestId")}</Th>
                <Th>{t("common.customer")}</Th>
                <Th>{t("common.status")}</Th>
                <Th>{t("common.technician")}</Th>
                <Th>{t("reports.days")}</Th>
                <Th>{t("reports.lateDays")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <Td className="font-mono text-xs font-semibold">
                    <Link to={`/app/requests/${row.id}`} className="text-[#7B00E0] hover:underline">
                      {formatRequestId(row.displayId)}
                    </Link>
                  </Td>
                  <Td>{row.customer.name}</Td>
                  <Td>
                    <StatusBadge status={row.status} />
                  </Td>
                  <Td>{row.technician ?? t("common.unassigned")}</Td>
                  <Td>{row.days}</Td>
                  <Td className={row.late ? "font-bold text-red-700" : ""}>{row.lateDays || t("common.dash")}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        )}
      </ReportPanel>
    </ReportChrome>
  );
}

export function DebtsReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const report = useQuery({
    queryKey: ["staff", "reports", "debts"],
    enabled: Boolean(token),
    queryFn: () =>
      api<{
        total: number;
        rows: Array<{ id: string; displayId: string; status: RequestStatus; completedAt: string | null; customer: { id: string; name: string; phone: string }; product: Named; due: number; paid: number; balance: number }>;
        customers: Array<{ customer: { id: string; name: string; phone: string }; balance: number; jobs: number }>;
      }>("/api/staff/reports/debts", { token }),
  });
  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  if (!data) return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#1E293B] sm:text-[31px]">{t("reports.nav.debts")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">{t("reports.nav.debtsBody")}</p>
      </div>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Summary label={t("reports.totalDebt")} value={formatMoney(data.total)} accent="red" />
        <Summary label={t("reports.debtJobs")} value={String(data.rows.length)} accent="orange" />
        <Summary label={t("reports.debtors")} value={String(data.customers.length)} />
      </div>
      {data.rows.length === 0 ? (
        <EmptyState title={t("reports.noDebts")} body={t("reports.noDebtsBody")} />
      ) : (
        <ReportPanel>
          <SurfaceTable>
            <thead>
              <tr>
                <Th>{t("common.requestId")}</Th>
                <Th>{t("common.customer")}</Th>
                <Th>{t("common.completed")}</Th>
                <Th>{t("payments.due")}</Th>
                <Th>{t("payments.paid")}</Th>
                <Th>{t("payments.balance")}</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <Td className="font-mono text-xs font-semibold">
                    <Link to={`/app/requests/${row.id}`} className="text-[#7B00E0] hover:underline">
                      {formatRequestId(row.displayId)}
                    </Link>
                  </Td>
                  <Td>
                    <Link to={`/app/customers/${row.customer.id}`} className="font-semibold hover:underline">
                      {row.customer.name}
                    </Link>
                    <span className="block text-xs text-neutral-500">{formatPhone(row.customer.phone)}</span>
                  </Td>
                  <Td>{row.completedAt ? formatDate(row.completedAt.slice(0, 10)) : t("common.dash")}</Td>
                  <Td>{formatMoney(row.due)}</Td>
                  <Td>{formatMoney(row.paid)}</Td>
                  <Td className="font-bold text-red-700">{formatMoney(row.balance)}</Td>
                </tr>
              ))}
            </tbody>
          </SurfaceTable>
        </ReportPanel>
      )}
    </div>
  );
}

type PayrollRow = { id: string; name: string; payPercent: number; payFixedPerJob: number; jobs: number; jobsTotal: number; adjustmentsTotal: number; total: number };

export function PayrollReportPage() {
  const { t } = useTranslation();
  const { token } = useStaffAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState<ReportQuery>(() => defaultReportQuery());
  const [adjust, setAdjust] = useState<{ id: string; name: string; amount: string; reason: string } | null>(null);
  const report = useQuery({
    queryKey: ["staff", "payroll", query],
    enabled: Boolean(token),
    queryFn: () => api<{ rows: PayrollRow[]; grandTotal: number }>(`/api/staff/payroll?${reportQueryString(query)}`, { token }),
  });
  const save = useMutation({
    mutationFn: () => api("/api/staff/payroll/adjustments", { method: "POST", token, body: JSON.stringify({ staffUserId: adjust!.id, amount: Number(adjust!.amount), reason: adjust!.reason }) }),
    onSuccess: async () => {
      setAdjust(null);
      notify(t("payroll.adjustmentSaved"));
      await queryClient.invalidateQueries({ queryKey: ["staff", "payroll"] });
    },
    onError: (error) => notify(apiErrorMessage(error, t), "error"),
  });
  if (report.isLoading) return <PageSkeleton />;
  const data = report.data;
  if (!data) return <EmptyState title={t("reports.loadFailed")} body={t("reports.loadFailedBody")} />;
  return (
    <ReportChrome
      title={t("reports.nav.payroll")}
      intro={t("reports.nav.payrollBody")}
      query={query}
      onChange={setQuery}
      onExport={() => downloadCsv("rizo-report-payroll.csv", [[t("common.technician"), t("staffAdmin.payPercent"), t("staffAdmin.payFixed"), t("payroll.jobs"), t("payroll.jobsTotal"), t("payroll.adjustments"), t("payroll.total")], ...data.rows.map((row) => [row.name, row.payPercent, row.payFixedPerJob, row.jobs, row.jobsTotal, row.adjustmentsTotal, row.total])])}
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Summary label={t("payroll.grandTotal")} value={formatMoney(data.grandTotal)} />
        <Summary label={t("payroll.jobs")} value={String(data.rows.reduce((sum, row) => sum + row.jobs, 0))} accent="orange" />
      </div>
      <ReportPanel>
        <SurfaceTable>
          <thead>
            <tr>
              <Th>{t("common.technician")}</Th>
              <Th>{t("staffAdmin.pay")}</Th>
              <Th>{t("payroll.jobs")}</Th>
              <Th>{t("payroll.jobsTotal")}</Th>
              <Th>{t("payroll.adjustments")}</Th>
              <Th>{t("payroll.total")}</Th>
              <Th className="text-right">{t("common.actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <Td className="text-left font-semibold">{row.name}</Td>
                <Td>{`${row.payPercent}% + ${formatMoney(row.payFixedPerJob)}`}</Td>
                <Td>{row.jobs}</Td>
                <Td>{formatMoney(row.jobsTotal)}</Td>
                <Td className={row.adjustmentsTotal < 0 ? "text-red-700" : ""}>{formatMoney(row.adjustmentsTotal)}</Td>
                <Td className="font-bold">{formatMoney(row.total)}</Td>
                <Td className="text-right">
                  <button type="button" className="text-sm font-semibold text-[#7B00E0] hover:underline" onClick={() => setAdjust({ id: row.id, name: row.name, amount: "", reason: "" })}>
                    {t("payroll.addAdjustment")}
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </SurfaceTable>
        <p className="mt-3 text-xs text-neutral-500">{t("payroll.explain")}</p>
      </ReportPanel>
      <Modal open={Boolean(adjust)} onClose={() => setAdjust(null)} title={t("payroll.addAdjustment")}>
        {adjust ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <p className="text-sm text-neutral-600">{adjust.name}</p>
            <Field label={t("payroll.amount")} hint={t("payroll.amountHint")}>
              <input className={inputClass} type="number" step={1000} required value={adjust.amount} onChange={(event) => setAdjust({ ...adjust, amount: event.target.value })} />
            </Field>
            <Field label={t("payroll.reason")}>
              <input className={inputClass} required maxLength={200} value={adjust.reason} onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdjust(null)} className="h-11 rounded-xl px-4 text-sm font-semibold text-neutral-600 hover:bg-neutral-100">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={save.isPending || !Number(adjust.amount)} className="inline-flex h-12 items-center gap-2 rounded-lg bg-[#7B00E0] px-6 text-[12.8px] font-bold text-white disabled:opacity-50">
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>
    </ReportChrome>
  );
}
