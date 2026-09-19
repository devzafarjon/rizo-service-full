import { HttpError } from "./httpError.js";

export const REPORT_PRESETS = ["week", "month", "quarter", "year", "all", "custom"] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];
export const TREND_GRAINS = ["day", "week", "month"] as const;
export type TrendGrain = (typeof TREND_GRAINS)[number];

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export type ReportWindow = {
  preset: ReportPreset;
  from: Date | null;
  to: Date;
};

function tashkentParts(date: Date) {
  const shifted = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function tashkentStart(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - TASHKENT_OFFSET_MS);
}

function tashkentEnd(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - TASHKENT_OFFSET_MS);
}

function parseYmd(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

function startOfWeek(now: Date) {
  const p = tashkentParts(now);
  const mondayOffset = (p.weekday + 6) % 7;
  const start = tashkentStart(p.y, p.m, p.d);
  start.setTime(start.getTime() - mondayOffset * 86_400_000);
  return start;
}

function startOfMonth(now: Date) {
  const p = tashkentParts(now);
  return tashkentStart(p.y, p.m, 1);
}

function startOfQuarter(now: Date) {
  const p = tashkentParts(now);
  const month = Math.floor((p.m - 1) / 3) * 3 + 1;
  return tashkentStart(p.y, month, 1);
}

function startOfYear(now: Date) {
  const p = tashkentParts(now);
  return tashkentStart(p.y, 1, 1);
}

export function parseReportRange(query: { preset?: unknown; from?: unknown; to?: unknown }): ReportWindow {
  const raw = typeof query.preset === "string" ? query.preset : "month";
  if (!(REPORT_PRESETS as readonly string[]).includes(raw)) {
    throw new HttpError(400, "Use week, month, quarter, year, all, or custom");
  }
  const preset = raw as ReportPreset;
  const now = new Date();

  if (preset === "custom") {
    const start = parseYmd(query.from);
    const end = parseYmd(query.to);
    if (!start || !end) {
      throw new HttpError(400, "Custom range needs from and to as YYYY-MM-DD");
    }
    const from = tashkentStart(start.y, start.m, start.d);
    const to = tashkentEnd(end.y, end.m, end.d);
    if (from.getTime() > to.getTime()) {
      throw new HttpError(400, "The start date must be before the end date");
    }
    return { preset, from, to };
  }

  if (preset === "week") return { preset, from: startOfWeek(now), to: now };
  if (preset === "month") return { preset, from: startOfMonth(now), to: now };
  if (preset === "quarter") return { preset, from: startOfQuarter(now), to: now };
  if (preset === "year") return { preset, from: startOfYear(now), to: now };
  return { preset: "all", from: null, to: now };
}

export function parseTrendGrain(value: unknown, fallback: TrendGrain = "day"): TrendGrain {
  if (typeof value !== "string" || value === "") return fallback;
  if ((TREND_GRAINS as readonly string[]).includes(value)) return value as TrendGrain;
  throw new HttpError(400, "Use day, week, or month");
}

export function defaultGrain(preset: ReportPreset): TrendGrain {
  if (preset === "week") return "day";
  if (preset === "month") return "day";
  if (preset === "quarter") return "week";
  return "month";
}

export function serializeWindow(window: ReportWindow) {
  return {
    preset: window.preset,
    from: window.from ? window.from.toISOString() : null,
    to: window.to.toISOString(),
  };
}

export function tashkentYmd(date: Date) {
  return tashkentParts(date);
}

export function bucketKey(date: Date, grain: TrendGrain) {
  const p = tashkentParts(date);
  if (grain === "day") return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  if (grain === "month") return `${p.y}-${String(p.m).padStart(2, "0")}`;
  const start = startOfWeek(date);
  const s = tashkentParts(start);
  return `${s.y}-${String(s.m).padStart(2, "0")}-${String(s.d).padStart(2, "0")}`;
}

export function createdAtWhere(window: ReportWindow) {
  return {
    createdAt: {
      ...(window.from ? { gte: window.from } : {}),
      lte: window.to,
    },
  };
}
