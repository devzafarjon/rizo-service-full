import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";

type Bucket = { count: number; resetAt: number };

/**
 * Small in-memory fixed-window limiter, keyed by client IP plus an optional request field (e.g. phone).
 * Good enough for a single API process; swap for a shared store if the API is ever scaled out.
 */
export function rateLimit(options: { windowMs: number; max: number; keyField?: string; name: string }) {
  const buckets = new Map<string, Bucket>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }, options.windowMs);
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const field = options.keyField ? String(req.body?.[options.keyField] ?? "").replace(/\D/g, "").slice(-9) : "";
    const key = `${req.ip}|${field}`;
    const now = Date.now();
    // A successful sign-in clears the counter, so only failed attempts add up against a phone number.
    res.locals.rateLimitReset = () => buckets.delete(key);
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      next(new HttpError(429, "Too many attempts. Try again later.", "rateLimited", { retryAfterSeconds: retryAfter, limiter: options.name }));
      return;
    }
    next();
  };
}

export const loginLimiter = rateLimit({ name: "login", windowMs: 15 * 60 * 1000, max: 10, keyField: "phone" });
export const registerLimiter = rateLimit({ name: "register", windowMs: 60 * 60 * 1000, max: 10 });
export const resetLimiter = rateLimit({ name: "reset", windowMs: 60 * 60 * 1000, max: 5, keyField: "phone" });
