import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config.js";
import type { StaffRoleName } from "./roles.js";

export type StaffTokenPayload = {
  sub: string;
  scope: "staff";
  role: StaffRoleName;
  name: string;
  phone: string;
};

export type CustomerTokenPayload = {
  sub: string;
  scope: "customer";
  name: string;
  phone: string;
};

export type TokenPayload = StaffTokenPayload | CustomerTokenPayload;

export function signToken(payload: TokenPayload) {
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.jwtSecret) as TokenPayload;
}

/** A token older than this is swapped for a fresh one when its owner uses the app, so an active person never has to sign in again. */
const RENEW_AFTER_SECONDS = 12 * 3600;

/**
 * Sliding session: when the token the request came with is older than half a day, returns a new one built from the
 * account's current data (role, name, phone), otherwise nothing. The `/me` calls hand it to the website and the apps.
 */
export function renewedToken(current: unknown, fresh: TokenPayload): string | undefined {
  const issuedAt = (current as { iat?: number } | null)?.iat ?? 0;
  const age = Math.floor(Date.now() / 1000) - issuedAt;
  return age > RENEW_AFTER_SECONDS ? signToken(fresh) : undefined;
}
