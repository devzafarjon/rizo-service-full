import type { Prisma, PrismaClient } from "@prisma/client";
import { FALLBACK_REGION_CODE, resolveRegionCode } from "./regions.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

const TASHKENT = "Asia/Tashkent";

export function tashkentCalendarDate(at: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TASHKENT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

export function tashkentDdmmyy(at: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TASHKENT,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(at);
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const year = parts.find((part) => part.type === "year")?.value ?? "00";
  return `${day}${month}${year}`;
}

export function buildDisplayId(at: Date, regionCode: string, sequence: number) {
  const code = /^\d{2}$/.test(regionCode) ? regionCode : FALLBACK_REGION_CODE;
  return `${tashkentDdmmyy(at)}${code}${String(sequence).padStart(4, "0")}`;
}

export function locationAddressFrom(value: Prisma.JsonValue | null | undefined): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const address = (value as Record<string, unknown>).address;
  return typeof address === "string" && address.trim() ? address.trim() : null;
}

export function normalizeDisplayIdQuery(value: string) {
  return value.trim().replace(/^#/, "").replace(/\s+/g, "");
}

export function formatRequestId(displayId: string) {
  return displayId.startsWith("#") ? displayId : `#${displayId}`;
}

async function nextDailySequence(db: DbClient, at: Date): Promise<number> {
  const date = tashkentCalendarDate(at);
  const rows = await db.$queryRaw<Array<{ last_sequence: number | bigint }>>`
    INSERT INTO daily_request_counters (date, last_sequence)
    VALUES (${date}::date, 1)
    ON CONFLICT (date)
    DO UPDATE SET last_sequence = daily_request_counters.last_sequence + 1
    RETURNING last_sequence
  `;
  const value = rows[0]?.last_sequence;
  return typeof value === "bigint" ? Number(value) : Number(value ?? 1);
}

export async function allocateDisplayId(
  db: DbClient,
  input: {
    regionCode?: string | null;
    address?: string | null;
    extraAddress?: string | null;
    at?: Date;
  },
) {
  const at = input.at ?? new Date();
  const regionCode = resolveRegionCode(input.regionCode, input.address, input.extraAddress);
  const sequence = await nextDailySequence(db, at);
  return buildDisplayId(at, regionCode, sequence);
}
