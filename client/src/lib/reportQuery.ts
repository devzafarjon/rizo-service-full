import type { ReportPreset, TrendGrain } from "./types";

export type ReportQuery = {
  preset: ReportPreset;
  from: string;
  to: string;
  grain?: TrendGrain;
  productId?: string;
};

export function todayIso() {
  const now = new Date();
  const tashkent = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return tashkent.toISOString().slice(0, 10);
}

export function defaultGrain(preset: ReportPreset): TrendGrain {
  if (preset === "week" || preset === "month") return "day";
  if (preset === "quarter") return "week";
  return "month";
}

export function defaultReportQuery(grain?: TrendGrain): ReportQuery {
  return { preset: "month", from: todayIso(), to: todayIso(), grain };
}

export function reportQueryString(query: ReportQuery) {
  const params = new URLSearchParams();
  params.set("preset", query.preset);
  if (query.preset === "custom") {
    params.set("from", query.from);
    params.set("to", query.to);
  }
  if (query.grain) params.set("grain", query.grain);
  if (query.productId) params.set("productId", query.productId);
  return params.toString();
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };
  const csv = `\uFEFF${rows.map((row) => row.map(escape).join(",")).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
