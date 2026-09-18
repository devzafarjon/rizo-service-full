import { Router } from "express";
import type { TechnicianType } from "@prisma/client";
import { asyncHandler } from "../lib/asyncHandler.js";
import { technicianWorkload } from "../lib/assignment.js";
import { prisma } from "../lib/prisma.js";
import { requireStaffRole, staffAuth } from "../middleware/staffAuth.js";

const TYPES: TechnicianType[] = ["service_center", "mobile"];

export const techniciansRouter = Router();
techniciansRouter.use(staffAuth, requireStaffRole("admin"));

techniciansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === "string" ? req.query.type : "";
    const available = typeof req.query.available === "string" ? req.query.available : "";
    const technicians = await prisma.staffUser.findMany({
      where: {
        role: "technician",
        ...(TYPES.includes(type as TechnicianType) ? { technicianType: type as TechnicianType } : {}),
        ...(available === "true" ? { isAvailable: true } : {}),
        ...(available === "false" ? { isAvailable: false } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        technicianType: true,
        isAvailable: true,
      },
    });
    const workload = await technicianWorkload(technicians.map((tech) => tech.id));
    const ranked = technicians
      .map((tech) => ({
        ...tech,
        openJobCount: workload.get(tech.id) ?? 0,
      }))
      .sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        if (a.openJobCount !== b.openJobCount) return a.openJobCount - b.openJobCount;
        return a.name.localeCompare(b.name);
      });
    res.json({ technicians: ranked });
  }),
);
