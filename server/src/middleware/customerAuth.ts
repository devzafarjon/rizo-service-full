import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";
import { verifyToken, type CustomerTokenPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      customer?: CustomerTokenPayload;
    }
  }
}

export function customerAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      throw new HttpError(401, "Sign in required");
    }
    const payload = verifyToken(token);
    if (payload.scope !== "customer") {
      throw new HttpError(403, "Customer portal access only");
    }
    req.customer = payload;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "Invalid or expired session"));
  }
}
