import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";
import { verifyToken, type StaffTokenPayload } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

// Deactivated staff lose access within seconds even though their JWT is still valid.
const activeCache = new Map<string, { active: boolean; at: number }>();
const ACTIVE_TTL_MS = 15_000;

async function isStaffActive(id: string) {
  const hit = activeCache.get(id);
  if (hit && Date.now() - hit.at < ACTIVE_TTL_MS) return hit.active;
  const row = await prisma.staffUser.findUnique({ where: { id }, select: { isActive: true } });
  const active = Boolean(row?.isActive);
  activeCache.set(id, { active, at: Date.now() });
  return active;
}

export function forgetStaffActiveCache(id: string) {
  activeCache.delete(id);
}

declare global {
  namespace Express {
    interface Request {
      staff?: StaffTokenPayload;
    }
  }
}

export async function staffAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      throw new HttpError(401, "Sign in required");
    }
    const payload = verifyToken(token);
    if (payload.scope !== "staff") {
      throw new HttpError(403, "Staff access only");
    }
    if (!(await isStaffActive(payload.sub))) {
      throw new HttpError(401, "Account no longer exists");
    }
    req.staff = payload;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Invalid or expired session"));
  }
}

export function requireStaffRole(...roles: Array<"admin" | "technician">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.staff) {
      next(new HttpError(401, "Sign in required"));
      return;
    }
    if (!roles.includes(req.staff.role)) {
      next(new HttpError(403, "You do not have access to this area"));
      return;
    }
    next();
  };
}
