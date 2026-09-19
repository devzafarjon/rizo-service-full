import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney, formatNumber } from "../../lib/format";

export const CHART = {
  purple: "#B439FD",
  orange: "#F6921E",
  green: "#10B981",
  sky: "#0EA5E9",
  rose: "#F43F5E",
  slate: "#94A3B8",
};

export const STATUS_COLORS = [CHART.purple, CHART.orange, CHART.sky, CHART.green, CHART.rose, "#8B5CF6", CHART.slate, "#14B8A6", "#F59E0B"];

export function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-bold text-neutral-900">{title}</h2>
      <div className="h-72 w-full">{children}</div>
    </section>
  );
}

export function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/5">
      <p className="mb-1 font-bold text-neutral-800">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }} className="font-semibold">
          {item.name}: {formatMoney(item.value)}
        </p>
      ))}
    </div>
  );
}

export function CountTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/5">
      <p className="mb-1 font-bold text-neutral-800">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }} className="font-semibold">
          {item.name}: {formatNumber(item.value)}
        </p>
      ))}
    </div>
  );
}

export function useChartLabels() {
  const { t } = useTranslation();
  return {
    revenue: t("reports.paidRevenue"),
    costs: t("reports.costs"),
    profit: t("reports.profit"),
    requests: t("reports.requests"),
  };
}
