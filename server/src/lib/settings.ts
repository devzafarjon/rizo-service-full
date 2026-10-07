import { prisma } from "./prisma.js";

const DEFAULTS: Record<string, string> = {
  block_zero_stock: "true",
  repair_warranty_days: "30", // warranty on a finished repair itself
  repair_legal_days: "20", // legal limit for a repair (Uzbekistan consumer law)
  estimate_valid_days: "7",
  pickup_storage_days: "14",
  require_estimate_for_paid_repair: "true",
  visit_slots: "09:00-11:00,11:00-13:00,14:00-16:00,16:00-18:00", // time windows a customer can book
  visits_per_technician_per_day: "6",
  reschedule_limit: "2", // how many times a customer may move a visit
  cancel_before_hours: "2", // a customer cannot cancel closer than this to the visit
  escalation_hours: "6", // an overdue job is escalated to the admins after this many hours
  escalation_hours_urgent: "24", // ... and becomes urgent after this many
  low_rating_threshold: "2", // a rating at or below this alerts the admins
  require_fiscal_receipt: "false", // payments must carry a fiscal receipt number
  weekly_digest: "true",
  warranty_expiry_notice_days: "30",
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

export const numberSettingValue = numberSetting;
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
    visitSlots: map.visit_slots,
    visitsPerTechnicianPerDay: Number(map.visits_per_technician_per_day),
    rescheduleLimit: Number(map.reschedule_limit),
    cancelBeforeHours: Number(map.cancel_before_hours),
    escalationHours: Number(map.escalation_hours),
    escalationHoursUrgent: Number(map.escalation_hours_urgent),
    lowRatingThreshold: Number(map.low_rating_threshold),
    requireFiscalReceipt: map.require_fiscal_receipt === "true",
    weeklyDigest: map.weekly_digest !== "false",
    warrantyExpiryNoticeDays: Number(map.warranty_expiry_notice_days),
  };
}

/** The booking windows, e.g. ["09:00-11:00", ...]; invalid entries are dropped. */
export async function getVisitSlots() {
  const raw = (await getSetting("visit_slots")) ?? "";
  return raw
    .split(",")
    .map((slot) => slot.trim())
    .filter((slot) => /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(slot) && slot.slice(0, 5) < slot.slice(6));
}
