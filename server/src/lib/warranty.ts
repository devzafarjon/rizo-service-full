import { HttpError } from "./httpError.js";

export type WarrantyStatus = "in_warranty" | "expired" | "not_applicable";

export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "Use a valid date (YYYY-MM-DD)");
  }
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const cursor = new Date(Date.UTC(year, month + months, 1));
  const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
  cursor.setUTCDate(Math.min(day, lastDay));
  return cursor;
}

export function computeWarrantyExpiry(saleDate: Date, warrantyMonths: number): Date {
  return addMonths(saleDate, warrantyMonths);
}

export function computeWarrantyStatus(warrantyMonths: number, expiry: Date, now = new Date()): WarrantyStatus {
  if (warrantyMonths <= 0) {
    return "not_applicable";
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return expiry.getTime() >= today.getTime() ? "in_warranty" : "expired";
}

export function money(value: { toString(): string } | number): number {
  return Number(value);
}
