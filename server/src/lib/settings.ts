import { prisma } from "./prisma.js";

const DEFAULTS: Record<string, string> = {
  block_zero_stock: "true",
  repair_warranty_days: "30", // warranty on a finished repair itself
  repair_legal_days: "20", // legal limit for a repair (Uzbekistan consumer law)
  estimate_valid_days: "7",
  pickup_storage_days: "14",
  require_estimate_for_paid_repair: "true",
};

export async function getSetting(key: string) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? null;
}

export async function setSetting(key: string, value: string) {
  return prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function isBlockZeroStock() {
  return (await getSetting("block_zero_stock")) !== "false";
}

async function numberSetting(key: string) {
  const value = Number(await getSetting(key));
  return Number.isFinite(value) && value >= 0 ? value : Number(DEFAULTS[key]);
}

export const repairWarrantyDays = () => numberSetting("repair_warranty_days");
export const repairLegalDays = () => numberSetting("repair_legal_days");
export const estimateValidDays = () => numberSetting("estimate_valid_days");

export async function getAppSettings() {
  const rows = await prisma.appSetting.findMany();
  const map = { ...DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return {
    blockZeroStock: map.block_zero_stock !== "false",
    repairWarrantyDays: Number(map.repair_warranty_days),
    repairLegalDays: Number(map.repair_legal_days),
    estimateValidDays: Number(map.estimate_valid_days),
    pickupStorageDays: Number(map.pickup_storage_days),
    requireEstimate: map.require_estimate_for_paid_repair !== "false",
  };
}
