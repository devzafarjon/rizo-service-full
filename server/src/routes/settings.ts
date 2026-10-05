import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getAppSettings, setSetting } from "../lib/settings.js";
import { parseBody } from "../lib/parse.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";
import { staffActor, writeAudit } from "../lib/audit.js";

export const settingsRouter = Router();
settingsRouter.use(staffAuth);

// Technicians and the front desk read the numbers (for example whether zero stock blocks); only admins change them.
settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getAppSettings() });
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
