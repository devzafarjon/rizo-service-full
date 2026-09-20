import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { getAppSettings, setSetting } from "../lib/settings.js";
import { parseBody } from "../lib/parse.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

export const settingsRouter = Router();
settingsRouter.use(staffAuth, requireStaffRole("admin"));

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getAppSettings() });
  }),
);

settingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(z.object({ blockZeroStock: z.boolean() }), req.body);
    await setSetting("block_zero_stock", body.blockZeroStock ? "true" : "false");
    res.json({ settings: await getAppSettings() });
  }),
);
