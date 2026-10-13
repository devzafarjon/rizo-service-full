import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { adminInbox } from "../lib/inbox.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

// "My work" for the admin: what waits for a decision, counted live.
export const inboxRouter = Router();
inboxRouter.use(staffAuth, requireStaffRole("admin"));
inboxRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await adminInbox());
  }),
);
