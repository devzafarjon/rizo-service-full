import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";
import { verifyToken, type StaffTokenPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      staff?: StaffTokenPayload;
    }
  }
}

export function staffAuth(req: Request, _res: Response, next: NextFunction) {
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
