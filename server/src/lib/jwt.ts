import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config.js";

export type StaffTokenPayload = {
  sub: string;
  scope: "staff";
  role: "admin" | "technician";
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
