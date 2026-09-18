import type { WarrantyStatus } from "./types";

export function addMonths(dateIso: string, months: number): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(day, lastDay));
  return cursor.toISOString().slice(0, 10);
}

export function warrantyStatusFor(saleDate: string, warrantyMonths: number, expiry = addMonths(saleDate, warrantyMonths)): WarrantyStatus {
  if (warrantyMonths <= 0) return "not_applicable";
  const today = new Date();
  const todayIso = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10);
  return expiry >= todayIso ? "in_warranty" : "expired";
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
