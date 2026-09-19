import type { WarrantyStatus } from "./types";

export function addMonths(dateIso: string, months: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(day, lastDay));
  return cursor.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function warrantyStatusFor(saleDate: string, warrantyMonths: number, expiry = addMonths(saleDate, warrantyMonths)): WarrantyStatus {
  if (warrantyMonths <= 0) return "not_applicable";
  return expiry >= todayIso() ? "in_warranty" : "expired";
}
