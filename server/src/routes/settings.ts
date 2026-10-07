import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getAppSettings, setSetting } from "../lib/settings.js";
import { parseBody } from "../lib/parse.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { staffActor, writeAudit } from "../lib/audit.js";
import { sendWeeklyDigest } from "../lib/digest.js";

export const settingsRouter = Router();
settingsRouter.use(staffAuth);

// Technicians and the front desk read the numbers (for example whether zero stock blocks); only admins change them.
settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getAppSettings() });
  }),
);

// Send the weekly summary now (to see what it looks like).
settingsRouter.post(
  "/digest-now",
  requireStaffRole("admin"),
  asyncHandler(async (_req, res) => {
    res.json({ digest: await sendWeeklyDigest() });
  }),
);

const days = z.coerce.number().int().min(0).max(365);

settingsRouter.patch(
  "/",
  requireStaffRole("admin"),
  asyncHandler(async (req, res) => {
    const body = parseBody(
      z.object({
        blockZeroStock: z.boolean().optional(),
        requireEstimate: z.boolean().optional(),
        repairWarrantyDays: days.optional(),
        repairLegalDays: days.optional(),
        estimateValidDays: days.optional(),
        pickupStorageDays: days.optional(),
        visitSlots: z
          .string()
          .trim()
          .max(200)
          .refine((value) => value.split(",").every((slot) => /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(slot.trim())), "Use windows like 09:00-11:00, separated by commas")
          .optional(),
        visitsPerTechnicianPerDay: z.coerce.number().int().min(1).max(30).optional(),
        rescheduleLimit: z.coerce.number().int().min(0).max(10).optional(),
        cancelBeforeHours: z.coerce.number().int().min(0).max(72).optional(),
        escalationHours: z.coerce.number().int().min(1).max(240).optional(),
        escalationHoursUrgent: z.coerce.number().int().min(1).max(720).optional(),
        lowRatingThreshold: z.coerce.number().int().min(1).max(5).optional(),
        requireFiscalReceipt: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
        warrantyExpiryNoticeDays: z.coerce.number().int().min(0).max(365).optional(),
      }),
      req.body,
    );
    const before = await getAppSettings();
    if (body.blockZeroStock !== undefined) await setSetting("block_zero_stock", body.blockZeroStock ? "true" : "false");
    if (body.requireEstimate !== undefined) await setSetting("require_estimate_for_paid_repair", body.requireEstimate ? "true" : "false");
    if (body.repairWarrantyDays !== undefined) await setSetting("repair_warranty_days", String(body.repairWarrantyDays));
    if (body.repairLegalDays !== undefined) await setSetting("repair_legal_days", String(body.repairLegalDays));
    if (body.estimateValidDays !== undefined) await setSetting("estimate_valid_days", String(body.estimateValidDays));
    if (body.pickupStorageDays !== undefined) await setSetting("pickup_storage_days", String(body.pickupStorageDays));
    const extra: Array<[string, unknown]> = [
      ["visit_slots", body.visitSlots?.split(",").map((slot) => slot.trim()).join(",")],
      ["visits_per_technician_per_day", body.visitsPerTechnicianPerDay],
      ["reschedule_limit", body.rescheduleLimit],
      ["cancel_before_hours", body.cancelBeforeHours],
      ["escalation_hours", body.escalationHours],
      ["escalation_hours_urgent", body.escalationHoursUrgent],
      ["low_rating_threshold", body.lowRatingThreshold],
      ["require_fiscal_receipt", body.requireFiscalReceipt === undefined ? undefined : body.requireFiscalReceipt ? "true" : "false"],
      ["weekly_digest", body.weeklyDigest === undefined ? undefined : body.weeklyDigest ? "true" : "false"],
      ["warranty_expiry_notice_days", body.warrantyExpiryNoticeDays],
    ];
    for (const [key, value] of extra) if (value !== undefined) await setSetting(key, String(value));
    const after = await getAppSettings();
    await writeAudit({
      actor: staffActor(req.staff),
      action: "settings.update",
      entityType: "AppSetting",
      entityId: "settings",
      oldValue: before,
      newValue: after,
    });
    res.json({ settings: after });
  }),
);
