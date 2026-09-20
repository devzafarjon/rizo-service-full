import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { normalizeDisplayIdQuery } from "../lib/displayId.js";
import { HttpError } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { requestInclude, serializeRequest } from "../lib/serializeRequest.js";
import { staffAuth } from "../middleware/staffAuth.js";

export const tagsRouter = Router();
tagsRouter.use(staffAuth);

tagsRouter.get(
  "/:displayId",
  asyncHandler(async (req, res) => {
    const displayId = normalizeDisplayIdQuery(req.params.displayId);
    const request = await prisma.serviceRequest.findUnique({
      where: { displayId },
      include: requestInclude,
    });
    if (!request) {
      throw new HttpError(404, "Service request not found");
    }
    res.json({
      request: serializeRequest(request),
      ownedByMe: request.assignedTechnicianId === req.staff!.sub,
    });
  }),
);
