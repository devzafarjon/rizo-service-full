import i18n, { intlLocale, parseLocale } from "../i18n";

const UZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function uzMonths() {
  const months = i18n.t("format.monthsShort", { returnObjects: true });
  return Array.isArray(months) && months.length === 12 ? (months as string[]) : UZ_MONTHS_SHORT;
}

function formatUzbekDate(date: Date, utc = false, withTime = false) {
  const month = utc ? date.getUTCMonth() : date.getMonth();
  const day = utc ? date.getUTCDate() : date.getDate();
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const datePart = `${pad2(day)}-${uzMonths()[month]} ${year}`;
  if (!withTime) return datePart;
  const hours = utc ? date.getUTCHours() : date.getHours();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  return `${datePart}, ${pad2(hours)}:${pad2(minutes)}`;
}

export function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("998") && digits.length === 12) {
    return `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`;
  }
  return phone.startsWith("+") ? phone : `+${digits}`;
}

export function technicianTypeLabel(type: "service_center" | "mobile" | null) {
  if (type === "service_center") return i18n.t("techType.service_center");
  if (type === "mobile") return i18n.t("techType.mobile");
  return null;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function formatMoney(value: number) {
  return `${formatNumber(value)} ${i18n.t("common.som")}`;
}

export function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (parseLocale(i18n.language) === "uz") return formatUzbekDate(date, true);
  return new Intl.DateTimeFormat(intlLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (parseLocale(i18n.language) === "uz") return formatUzbekDate(date);
  return new Intl.DateTimeFormat(intlLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatStamp(value: string) {
  const date = new Date(value);
  if (parseLocale(i18n.language) === "uz") return formatUzbekDate(date, false, true);
  return new Intl.DateTimeFormat(intlLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function mapsUrl(location: { address: string; lat?: number | null; lng?: number | null }) {
  if (location.lat != null && location.lng != null) {
    return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`;
}

export function normalizeDisplayId(displayId: string) {
  return displayId.replace(/^#/, "").replace(/\s+/g, "");
}

export function formatRequestId(displayId: string) {
  const raw = normalizeDisplayId(displayId);
  return raw ? `#${raw}` : displayId;
}

export function defectLabel(type: "dead_on_arrival" | "failed_during_use") {
  return i18n.t(`defect.${type}`);
}

export function formatDurationHours(hours: number | null) {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return i18n.t("common.dash");
  if (hours < 1) return i18n.t("format.minutes", { count: Math.max(1, Math.round(hours * 60)) });
  if (hours < 24) {
    const rounded = hours < 10 ? hours.toFixed(1) : String(Math.round(hours));
    return i18n.t("format.hoursValue", { value: rounded });
  }
  const days = hours / 24;
  const rounded = days < 10 ? days.toFixed(1) : String(Math.round(days));
  return i18n.t("format.daysValue", { value: rounded });
}

export function formatDurationMs(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  if (totalMinutes < 1) return i18n.t("format.lessMinute");
  if (totalMinutes < 60) return i18n.t("format.min", { count: totalMinutes });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) {
    return minutes ? i18n.t("format.hm", { hours, minutes }) : i18n.t("format.h", { hours });
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? i18n.t("format.dh", { days, hours: restHours }) : i18n.t("format.d", { days });
}

export const SUGGESTED_CATEGORIES = [
  "Refrigerators",
  "Washing machines",
  "Air conditioners",
  "Televisions",
  "Small appliances",
];
