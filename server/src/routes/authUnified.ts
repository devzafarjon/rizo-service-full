import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler.js";
import { HttpError } from "../lib/httpError.js";
import { signToken } from "../lib/jwt.js";
import { verifyPassword } from "../lib/password.js";
import { assertPhone, normalizePhone } from "../lib/phone.js";
import { parseBody } from "../lib/parse.js";
import { prisma } from "../lib/prisma.js";
import { verifyTotp } from "../lib/totp.js";
import { loginLimiter } from "../middleware/rateLimit.js";
import { serializeCustomer } from "./customerAuth.js";
import { serializeStaff } from "./staffAuth.js";

/**
 * One sign-in for the website: staff and customers type the same phone + password. The server finds whose it is and says which side
 * it signed in. The answer for a wrong phone or password is the same whichever side it would have been, so the form never tells a
 * stranger whether a number belongs to staff or to a customer.
 */
export const unifiedAuthRouter = Router();

const schema = z.object({
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(1, "Password is required"),
  /** Six-digit code from the authenticator app (staff with two-step sign-in). */
  code: z.string().trim().max(12).optional(),
  /** Only when the same phone and password open both a staff and a customer account: which one to sign in. */
  as: z.enum(["staff", "customer"]).optional(),
});

// Compared when no account exists, so a missing phone takes as long as a wrong password.
const DUMMY_HASH = "$2b$10$ijOuaJ9YLdjih8T5cBkaUe578MJ6oDVDYOjvRMrU/c.JwcmrV4Y9K";

unifiedAuthRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(schema, req.body);
    const phone = normalizePhone(body.phone);
    assertPhone(phone);

    const [staff, customer] = await Promise.all([prisma.staffUser.findUnique({ where: { phone } }), prisma.customer.findUnique({ where: { phone } })]);
    const [staffOk, customerOk] = await Promise.all([
      verifyPassword(body.password, staff?.passwordHash ?? DUMMY_HASH).then((ok) => Boolean(staff) && ok),
      verifyPassword(body.password, customer?.passwordHash ?? DUMMY_HASH).then((ok) => Boolean(customer) && ok && !customer?.anonymizedAt),
    ]);
    if (!staffOk && !customerOk) throw new HttpError(401, "Incorrect phone number or password");

    // The same phone and password open both: ask once which one (the choice is made on the next call).
    if (staffOk && customerOk && !body.as) {
      res.json({ choose: ["staff", "customer"] });
      return;
    }
    const side = body.as ?? (staffOk ? "staff" : "customer");
    if ((side === "staff" && !staffOk) || (side === "customer" && !customerOk)) throw new HttpError(401, "Incorrect phone number or password");

    if (side === "staff" && staff) {
      if (!staff.isActive) throw new HttpError(403, "This account has been deactivated", "accountInactive");
      if (staff.totpEnabled && staff.totpSecret) {
        if (!body.code) throw new HttpError(401, "Enter the code from your authenticator app", "totpRequired");
        if (!verifyTotp(staff.totpSecret, body.code)) throw new HttpError(401, "That code is not correct", "totpInvalid");
      }
      res.locals.rateLimitReset?.();
      res.json({ scope: "staff", token: signToken({ sub: staff.id, scope: "staff", role: staff.role, name: staff.name, phone: staff.phone }), user: serializeStaff(staff) });
      return;
    }
    if (!customer) throw new HttpError(401, "Incorrect phone number or password");
    res.locals.rateLimitReset?.();
    res.json({ scope: "customer", token: signToken({ sub: customer.id, scope: "customer", name: customer.name, phone: customer.phone }), user: serializeCustomer(customer) });
  }),
);
