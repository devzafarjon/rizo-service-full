import crypto from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { writeAudit } from "../lib/audit.js";
import { createServiceRequest } from "../lib/createRequest.js";
import { HttpError } from "../lib/httpError.js";
import { parseBody } from "../lib/parse.js";
import { hashPassword } from "../lib/password.js";
import { assertPhone, normalizePhone } from "../lib/phone.js";
import { prisma } from "../lib/prisma.js";
import { isRegionCode, resolveRegionCode } from "../lib/regions.js";
import { parseDateOnly, warrantyExpiryFor } from "../lib/warranty.js";
import { rateLimit } from "../middleware/rateLimit.js";

// The RIZO market posts every sale here, so the customer, the sale and its warranty exist in RIZO Service
// the moment the product is sold, and an installation request can be opened in the same call.
export const integrationsRouter = Router();

const limiter = rateLimit({ name: "market", windowMs: 60 * 1000, max: 120 });

function requireMarketKey(req: Request, _res: Response, next: NextFunction) {
  if (!env.marketApiKey) {
    next(new HttpError(503, "The market integration is not switched on (MARKET_API_KEY is empty)", "integrationOff"));
    return;
  }
  const sent = Buffer.from(String(req.headers["x-api-key"] ?? ""));
  const expected = Buffer.from(env.marketApiKey);
  if (sent.length !== expected.length || !crypto.timingSafeEqual(sent, expected)) {
    next(new HttpError(401, "The API key is not valid", "badApiKey"));
    return;
  }
  next();
}

const saleSchema = z.object({
  /** The sale's id in the market; sending it again does not create a second sale. */
  externalId: z.string().trim().min(1).max(80),
  invoiceNumber: z.string().trim().min(1).max(60),
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD)"),
  customer: z.object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().min(1),
    address: z.string().trim().max(200).optional().nullable(),
    regionCode: z.string().optional().nullable(),
  }),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1),
        quantity: z.coerce.number().int().min(1).max(99).default(1),
        price: z.coerce.number().nonnegative(),
        serialNumber: z.string().trim().max(80).optional().nullable(),
      }),
    )
    .min(1)
    .max(30),
  /** Open an installation request for every item, at this address. */
  installation: z
    .object({ address: z.string().trim().min(1).max(200), lat: z.coerce.number().min(-90).max(90).optional().nullable(), lng: z.coerce.number().min(-180).max(180).optional().nullable() })
    .optional()
    .nullable(),
});

integrationsRouter.get("/market/ping", limiter, requireMarketKey, (_req, res) => {
  res.json({ ok: true });
});

integrationsRouter.post(
  "/market/sales",
  limiter,
  requireMarketKey,
  asyncHandler(async (req, res) => {
    const body = parseBody(saleSchema, req.body);
    const phone = normalizePhone(body.customer.phone);
    assertPhone(phone);

    const products = await prisma.product.findMany({ where: { sku: { in: body.items.map((item) => item.sku) } } });
    const bySku = new Map(products.map((product) => [product.sku, product]));
    const unknown = body.items.filter((item) => !bySku.has(item.sku)).map((item) => item.sku);
    if (unknown.length > 0) throw new HttpError(422, "Some products are not in RIZO Service yet", "unknownSku", { skus: unknown });

    let customer = await prisma.customer.findUnique({ where: { phone } });
    if (!customer) {
      const regionCode = body.customer.regionCode && isRegionCode(body.customer.regionCode) ? body.customer.regionCode : resolveRegionCode(null, body.customer.address);
      customer = await prisma.customer.create({
        data: {
          name: body.customer.name,
          phone,
          address: body.customer.address || null,
          regionCode,
          // The customer signs in with "forgot password" (an SMS with a new password).
          passwordHash: await hashPassword(crypto.randomBytes(24).toString("hex")),
        },
      });
    }

    const saleDate = parseDateOnly(body.saleDate);
    const sales: Array<{ id: string; invoiceNumber: string; created: boolean }> = [];
    const installations: string[] = [];
    for (const [index, item] of body.items.entries()) {
      const product = bySku.get(item.sku)!;
      const externalId = body.items.length === 1 ? body.externalId : `${body.externalId}#${index + 1}`;
      const existing = await prisma.sale.findUnique({ where: { externalId } });
      if (existing) {
        sales.push({ id: existing.id, invoiceNumber: existing.invoiceNumber, created: false });
        continue;
      }
      const invoiceNumber = (body.items.length === 1 ? body.invoiceNumber : `${body.invoiceNumber}-${index + 1}`).toUpperCase();
      const warrantyExpiry = warrantyExpiryFor({ saleDate, installationDate: null, warrantyMonths: product.warrantyMonths, extensionMonths: 0 }, product);
      const sale = await prisma.sale.create({
        data: {
          customerId: customer.id,
          productId: product.id,
          quantity: item.quantity,
          saleDate,
          pricePaid: item.price,
          warrantyMonths: product.warrantyMonths,
          warrantyExpiry,
          invoiceNumber,
          serialNumber: item.serialNumber || null,
          externalId,
        },
      });
      sales.push({ id: sale.id, invoiceNumber: sale.invoiceNumber, created: true });
      await writeAudit({ actor: { id: "market", type: "system", name: "RIZO market" }, action: "sale.import", entityType: "Sale", entityId: sale.id, newValue: { externalId, invoiceNumber } });
      if (body.installation) {
        try {
          const result = await createServiceRequest({
            type: "installation",
            customerId: customer.id,
            saleId: sale.id,
            issueDescription: `O‘rnatish: ${product.name}`,
            locationType: "on_site",
            customerLocation: body.installation,
            source: "rizo_market",
            autoAssign: true,
          });
          installations.push(result.request.displayId);
        } catch (error) {
          // The sale is kept; the office can open the installation by hand.
          console.error("[market] installation request failed", error);
        }
      }
    }
    res.status(201).json({ customerId: customer.id, sales, installationRequests: installations });
  }),
);
